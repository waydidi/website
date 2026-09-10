import { env } from "cloudflare:workers";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { checkoutAttempts } from "@/db/schema";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, createAdminSession, verifyAdminKey } from "@/lib/admin";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in before using an admin key." }, { status: 401 });

  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
  const fingerprint = await sha256(`admin:${env.RATE_LIMIT_SALT ?? "waydidi-admin"}:${address}:${user.email.toLowerCase()}`);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(checkoutAttempts).where(and(eq(checkoutAttempts.fingerprintHash, fingerprint), gt(checkoutAttempts.createdAt, windowStart)));
  if (attempts >= 8) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });

  const input = await request.json().catch(() => null) as { key?: unknown } | null;
  const candidate = typeof input?.key === "string" ? input.key : "";
  if (!(await verifyAdminKey(candidate))) {
    await getDb().insert(checkoutAttempts).values({ fingerprintHash: fingerprint, createdAt: new Date().toISOString() });
    await getDb().delete(checkoutAttempts).where(lt(checkoutAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()));
    return NextResponse.json({ error: "The admin key is incorrect." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, await createAdminSession(user.email), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return response;
}
