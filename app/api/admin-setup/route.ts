import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { sendOwnerSetupLink } from "@/lib/email";
import { constantTimeEqual, hmacSha256, isJsonRequest, safeOrigin, sameOrigin, sha256 } from "@/lib/security";
import { hashStaffPassword } from "@/lib/staff-security";

// First owner account. Open only while no staff account exists. The link goes to the business inbox, is signed, and works for 30 minutes.
const reply = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const sign = (secret: string, expires: number) => hmacSha256(secret, `owner-setup:${expires}`);

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const secret = env.WAYDIDI_ADMIN_SESSION_SECRET ?? "";
  if (secret.length < 32) return reply("Staff authentication is not configured.", 503);
  const db = env.DB as SecurityDatabase;
  if (await db.prepare("SELECT 1 AS x FROM staff_accounts LIMIT 1").first()) return reply("An owner account already exists. Sign in, or ask the owner to add you under Staff access.", 409);
  const input = await request.json().catch(() => null) as { action?: string; token?: string; username?: string; password?: string } | null;

  if (input?.action === "send") {
    const fingerprint = await sha256(`owner-setup:${env.RATE_LIMIT_SALT ?? secret}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
    const window = Math.floor(Date.now() / 900000);
    const allowed = await db.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 WHERE attempts<3 RETURNING attempts").bind(fingerprint, window).first();
    if (!allowed) return reply("Too many requests. Try again in 15 minutes.", 429);
    const expires = Date.now() + 30 * 60000;
    const url = `${safeOrigin(request)}/admin-setup#${expires}.${await sign(secret, expires)}`;
    const sent = await sendOwnerSetupLink({ url, expires });
    if (sent.status !== "sent") return reply("The setup email couldn't be sent. Check that the business email is configured.", 503);
    return NextResponse.json({ ok: true });
  }

  const [e, t] = (input?.token ?? "").split(".");
  const expires = Number(e);
  if (!expires || expires < Date.now() || !t || !constantTimeEqual(t, await sign(secret, expires))) return reply("This setup link has expired. Request a new one from the admin sign-in page.", 401);
  const username = (input?.username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) return reply("Use 3–60 lowercase letters, numbers, dots, dashes or underscores for the admin ID.");
  const password = input?.password ?? "";
  if (password.length < 12 || password.length > 200) return reply("Use a password of 12–200 characters.");
  const email = (env.BOOKING_ALERT_EMAIL ?? "").split(",")[0]?.trim().toLowerCase() || username;
  const result = await db.prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,created_at) SELECT ?,?,?,?,?,'owner',? WHERE NOT EXISTS(SELECT 1 FROM staff_accounts)")
    .bind(crypto.randomUUID(), username, email, username, await hashStaffPassword(password), new Date().toISOString()).run();
  if (!result.meta.changes) return reply("An owner account already exists.", 409);
  return NextResponse.json({ ok: true });
}
