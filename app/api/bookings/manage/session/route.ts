import { env } from "cloudflare:workers";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingManagementSessions, bookings, checkoutAttempts } from "@/db/schema";
import { MANAGEMENT_COOKIE, managementCookie } from "@/lib/booking-management";
import { constantTimeEqual, isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
  const address=request.headers.get("cf-connecting-ip")??request.headers.get("x-real-ip")??"unknown";
  const fingerprint=await sha256(`manage:${env.RATE_LIMIT_SALT??"waydidi"}:${address}`);
  const since=new Date(Date.now()-15*60*1000).toISOString();
  const [{attempts}]=await getDb().select({attempts:count()}).from(checkoutAttempts).where(and(eq(checkoutAttempts.fingerprintHash,fingerprint),gt(checkoutAttempts.createdAt,since)));
  if(attempts>=10)return NextResponse.json({error:"Too many attempts. Please wait 15 minutes."},{status:429});
  await getDb().insert(checkoutAttempts).values({fingerprintHash:fingerprint,createdAt:new Date().toISOString()});
  const input=await request.json() as {reference?:unknown;email?:unknown};
  const reference=typeof input.reference==="string"?input.reference.trim().toUpperCase():"";
  const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
  const [booking]=/^WD-[A-F0-9]{12}$/.test(reference)?await getDb().select().from(bookings).where(eq(bookings.reference,reference)).limit(1):[];
  const matches=booking&&/^\S+@\S+\.\S+$/.test(email)?constantTimeEqual(await sha256(email),await sha256(booking.customerEmail.toLowerCase())):false;
  if(!booking||!matches)return NextResponse.json({error:"We could not find a booking matching those details."},{status:404});
  const token=secureToken(),now=new Date(),expires=new Date(now.getTime()+15*60*1000);
  await getDb().delete(bookingManagementSessions).where(lt(bookingManagementSessions.expiresAt,now.toISOString()));
  await getDb().insert(bookingManagementSessions).values({id:crypto.randomUUID(),bookingReference:reference,tokenHash:await sha256(token),expiresAt:expires.toISOString(),createdAt:now.toISOString(),lastUsedAt:now.toISOString()});
  return NextResponse.json({ok:true},{headers:{"Set-Cookie":managementCookie(token),"Cache-Control":"no-store"}});
}

export async function DELETE() {
  return NextResponse.json({ok:true},{headers:{"Set-Cookie":managementCookie("",0),"Cache-Control":"no-store"}});
}
