import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin, secureToken, sha256 } from "@/lib/security";
import { acceptedTotpStep, CHALLENGE_COOKIE, decryptMfa, encryptMfa, newStaffSession, newTotpSecret, readCookie, STAFF_COOKIE, STAFF_SESSION_SECONDS, verifyStaffPassword, type StaffAccount } from "@/lib/staff-security";
const cookieOptions={httpOnly:true,secure:true,sameSite:"strict" as const,path:"/"};
const reply=(error:string,status=401)=>NextResponse.json({error},{status,headers:{"Cache-Control":"no-store"}});

export async function POST(request: Request) {
  if(!sameOrigin(request)||!isJsonRequest(request)) return reply("Request blocked.",403);
  const secret=env.WAYDIDI_ADMIN_SESSION_SECRET??"";
  if(secret.length<32) return reply("Staff authentication is not configured.",503);
  const fingerprint=await sha256(`staff:${env.RATE_LIMIT_SALT??secret}:${request.headers.get("cf-connecting-ip")??"unknown"}`);
  const window=Math.floor(Date.now()/900000);
  const claimed=await (env.DB as SecurityDatabase).prepare(`INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 WHERE attempts<30 RETURNING attempts`).bind(fingerprint,window).first();
  if(!claimed) return reply("Too many attempts. Try again in 15 minutes.",429);
  await (env.DB as SecurityDatabase).prepare("DELETE FROM security_rate_windows WHERE window<?").bind(window-96).run();
  const input=await request.json().catch(()=>null) as {username?:unknown;password?:unknown;code?:unknown}|null;
  const now=new Date().toISOString();
  if(typeof input?.code==="string") {
    const hash=await sha256(readCookie(request,CHALLENGE_COOKIE));
    const challenge=await (env.DB as SecurityDatabase).prepare(`UPDATE staff_challenges SET attempts=attempts+1 WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<5 RETURNING *`).bind(hash,now).first<{staff_id:string;enrollment_secret:string|null}>();
    if(!challenge) return reply("Verification expired or the attempt limit was reached. Sign in again.");
    const account=await (env.DB as SecurityDatabase).prepare("SELECT * FROM staff_accounts WHERE id=? AND active=1").bind(challenge.staff_id).first<StaffAccount>();
    if(!account) return reply("Account unavailable.");
    const encrypted=account.mfa_secret??challenge.enrollment_secret;
    if(!encrypted) return reply("MFA enrollment is required.");
    const step=await acceptedTotpStep(await decryptMfa(encrypted,secret),input.code);
    if(step===null||step<=account.last_totp_step) return reply("That authenticator code is invalid or has already been used.");
    // Only the request that consumes this challenge can update MFA and receive a session.
    const result=await (env.DB as SecurityDatabase).batch([
      (env.DB as SecurityDatabase).prepare(`UPDATE staff_challenges SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM staff_accounts WHERE id=? AND active=1 AND last_totp_step<?)`).bind(now,hash,now,account.id,step),
      (env.DB as SecurityDatabase).prepare(`UPDATE staff_accounts SET mfa_secret=?,last_totp_step=? WHERE id=? AND active=1 AND last_totp_step<? AND EXISTS(SELECT 1 FROM staff_challenges WHERE token_hash=? AND consumed_at=?)`).bind(encrypted,step,account.id,step,hash,now),
    ]);
    if(!result[0].meta.changes||!result[1].meta.changes) return reply("Code already used. Sign in again.");
    const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    response.cookies.set(STAFF_COOKIE,await newStaffSession(env.DB,account.id),{...cookieOptions,maxAge:STAFF_SESSION_SECONDS});
    response.cookies.set(CHALLENGE_COOKIE,"",{...cookieOptions,maxAge:0});
    return response;
  }
  if(typeof input?.username!=="string"||typeof input.password!=="string"||input.password.length>200||input.username.length>100) return reply("Staff ID and password are required.",400);
  const username=input.username.trim().toLowerCase();
  const account=await (env.DB as SecurityDatabase).prepare("SELECT * FROM staff_accounts WHERE username=? AND active=1").bind(username).first<StaffAccount>();

  if(!account||!await verifyStaffPassword(input.password,account.password_hash)) return reply("The staff ID or password is incorrect.");
  const token=secureToken(), enrollment=account.mfa_secret?null:newTotpSecret();
  // Invalidate old challenges before generating another enrollment secret.
  await (env.DB as SecurityDatabase).prepare("DELETE FROM staff_challenges WHERE staff_id=? OR expires_at<=?").bind(account.id,now).run();
  await (env.DB as SecurityDatabase).prepare("INSERT INTO staff_challenges(token_hash,staff_id,enrollment_secret,expires_at) VALUES(?,?,?,?)").bind(await sha256(token),account.id,enrollment?await encryptMfa(enrollment,secret):null,new Date(Date.now()+5*60000).toISOString()).run();
  const response=NextResponse.json({mfaRequired:true,enrollmentSecret:enrollment,otpauth:enrollment?`otpauth://totp/${encodeURIComponent(`Waydidi:${username}`)}?secret=${enrollment}&issuer=Waydidi`:null},{headers:{"Cache-Control":"no-store"}});
  response.cookies.set(CHALLENGE_COOKIE,token,{...cookieOptions,maxAge:300});
  return response;
}
export async function DELETE(request: Request) {
  if(!sameOrigin(request)) return reply("Request blocked.",403);
  await (env.DB as SecurityDatabase).prepare("UPDATE staff_sessions SET revoked_at=? WHERE token_hash=?").bind(new Date().toISOString(),await sha256(readCookie(request,STAFF_COOKIE))).run();
  const response=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
  response.cookies.set(STAFF_COOKIE,"",{...cookieOptions,maxAge:0});
  response.cookies.set(CHALLENGE_COOKIE,"",{...cookieOptions,maxAge:0});
  return response;
}
export async function GET() {
  const admin=await getWaydidiAdmin();
  return admin?NextResponse.json({username:admin.displayName,role:admin.role},{headers:{"Cache-Control":"no-store"}}):reply("Unauthorized");
}
