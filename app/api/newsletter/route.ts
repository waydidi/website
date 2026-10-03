import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { env } from "cloudflare:workers";
import { overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { TURNSTILE_FAILED, verifyTurnstile } from "@/lib/turnstile";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254), source: z.string().max(40).default("site") });

// Newsletter sign-up. Signing up twice is fine: the first sign-up is kept.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (await overRateLimit(request, "newsletter", 10, 60, env.RATE_LIMIT_SALT ?? "waydidi"))
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!(await verifyTurnstile(request, body?.turnstileToken))) return NextResponse.json(TURNSTILE_FAILED, { status: 403 });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });
  await getDb().insert(newsletterSubscribers).values({ ...parsed.data, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
