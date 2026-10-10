import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { resolveTripAccess } from "@/lib/trip-access";
import { parseShareToken } from "@/lib/customer-trip-rules";
import { isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";
export async function POST(request:Request) {
 if(!sameOrigin(request)||!isJsonRequest(request)) return NextResponse.json({error:"Request blocked"},{status:403});
 const input=await request.json() as {reference?:string;query?:string};
 const reference=String(input.reference??"").toUpperCase(), params=new URLSearchParams(input.query??"");
 const url=new URL(`/api/trip/${reference}`,request.url);for(const key of ["token","key","share","ride"]) {const value=params.get(key);if(value)url.searchParams.set(key,value);}
 const resolved=await resolveTripAccess(new Request(url,{headers:request.headers}),reference);
 if(!resolved) return NextResponse.json({error:"Trip link expired or revoked. Verify your booking email for a new link."},{status:404});
 const issued=parseShareToken(params.get(resolved.access==="shared"?"share":"key")??"")?.issuedAt??(params.has("token")?Date.parse(resolved.booking.createdAt):Date.now());
 const expires=new Date(Math.min(Date.now()+24*3600000,issued+(resolved.access==="shared"?7:1)*24*3600000)).toISOString();
 const token=secureToken();
 await env.DB.prepare("DELETE FROM trip_access_sessions WHERE expires_at<=?").bind(new Date().toISOString()).run();
 await env.DB.prepare("INSERT INTO trip_access_sessions(token_hash,booking_reference,access,issued_at,expires_at) VALUES(?,?,?,?,?)").bind(await sha256(token),reference,resolved.access,issued,expires).run();
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store","Set-Cookie":`waydidi_trip_${reference}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((Date.parse(expires)-Date.now())/1000))}`}});
}
