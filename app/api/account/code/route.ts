import { env } from "cloudflare:workers";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerLoginCodes } from "@/db/schema";
import { overRateLimit } from "@/lib/customer-auth";
import { CODE_MINUTES, generateSignInCode, isValidEmail, MAX_CODES_PER_EMAIL_PER_HOUR, MAX_REQUESTS_PER_IP_PER_15_MIN, normalizeEmail } from "@/lib/customer-account";
import { sendAccountSignInCode } from "@/lib/email";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

// Always answers the same way for a valid email so the endpoint cannot be
// used to discover who has an account or has booked with Waydidi.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (await overRateLimit(request, "account-code", MAX_REQUESTS_PER_IP_PER_15_MIN, 15, env.RATE_LIMIT_SALT ?? "waydidi"))
    return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 });
  const input = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const now = new Date();
  await getDb().delete(customerLoginCodes).where(lt(customerLoginCodes.expiresAt, new Date(now.getTime() - 86_400_000).toISOString()));
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [{ recent }] = await getDb().select({ recent: count() }).from(customerLoginCodes)
    .where(and(eq(customerLoginCodes.email, email), gt(customerLoginCodes.createdAt, hourAgo)));
  if (recent >= MAX_CODES_PER_EMAIL_PER_HOUR) return NextResponse.json({ error: "Too many codes requested for this email. Please wait an hour." }, { status: 429 });

  const id = crypto.randomUUID();
  const code = generateSignInCode();
  await getDb().insert(customerLoginCodes).values({
    id, email, codeHash: await sha256(`${id}:${code}`), attempts: 0,
    expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000).toISOString(), createdAt: now.toISOString(),
  });
  const sent = await sendAccountSignInCode({ to: email, code, codeId: id });
  if (sent.status !== "sent") return NextResponse.json({ error: "We could not send the code right now. Please try again shortly." }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
