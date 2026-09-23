import { env } from "cloudflare:workers";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookingManagementSessions, bookings, checkoutAttempts } from "@/db/schema";
import { cookieValue, MANAGEMENT_COOKIE, managementCookie } from "@/lib/booking-management";
import { constantTimeEqual, isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";
import { legacySurname, normalizeSurname } from "@/lib/booking-reference";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
  const address=request.headers.get("cf-connecting-ip")??request.headers.get("x-real-ip")??"unknown";
  const fingerprint=await sha256(`manage:${env.RATE_LIMIT_SALT??"waydidi"}:${address}`);
  const since=new Date(Date.now()-15*60*1000).toISOString();
  const [{attempts}]=await getDb().select({attempts:count()}).from(checkoutAttempts).where(and(eq(checkoutAttempts.fingerprintHash,fingerprint),gt(checkoutAttempts.createdAt,since)));
  if(attempts>=10)return NextResponse.json({error:"Too many attempts. Please wait 15 minutes."},{status:429});
  await getDb().insert(checkoutAttempts).values({fingerprintHash:fingerprint,createdAt:new Date().toISOString()});
  const input=await request.json() as {reference?:unknown;surname?:unknown};
  const reference=typeof input.reference==="string"?input.reference.trim().toUpperCase():"";
  const surname=typeof input.surname==="string"?normalizeSurname(input.surname):"";
  const validReference=/^(?:[A-HJ-NP-Z2-9]{6}|WD-[A-F0-9]{12})$/.test(reference);
  const [booking]=validReference?await getDb().select().from(bookings).where(eq(bookings.reference,reference)).limit(1):[];
  const expectedSurname=booking?normalizeSurname(booking.customerSurname||legacySurname(booking.customerName)):"";
  const matches=booking&&surname?constantTimeEqual(await sha256(surname),await sha256(expectedSurname)):false;
  if(!booking||booking.status==="binned"||!matches)return NextResponse.json({error:"We could not find a booking matching those details."},{status:404});
  const token=secureToken(),now=new Date(),expires=new Date(now.getTime()+15*60*1000);
  await getDb().delete(bookingManagementSessions).where(lt(bookingManagementSessions.expiresAt,now.toISOString()));
  await getDb().insert(bookingManagementSessions).values({id:crypto.randomUUID(),bookingReference:reference,tokenHash:await sha256(token),expiresAt:expires.toISOString(),createdAt:now.toISOString(),lastUsedAt:now.toISOString()});
  await getDb().insert(bookingEvents).values({bookingReference:reference,eventType:"customer_management_sign_in",createdAt:now.toISOString()});
  return NextResponse.json({ok:true},{headers:{"Set-Cookie":managementCookie(token),"Cache-Control":"no-store"}});
}

export async function DELETE(request: Request) {
  const token = cookieValue(request, MANAGEMENT_COOKIE);
  if (token) await getDb().delete(bookingManagementSessions).where(eq(bookingManagementSessions.tokenHash, await sha256(token)));
  return NextResponse.json({ok:true},{headers:{"Set-Cookie":managementCookie("",0),"Cache-Control":"no-store"}});
}
