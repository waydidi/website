import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentCustomer, overRateLimit } from "@/lib/customer-auth";
import { isCodeShape, normalizeCode } from "@/lib/promo";
import { checkPromo } from "@/lib/promo-db";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const input = z.object({
  code: z.string().max(40),
  total: z.number().int().min(1).max(10_000_000),
  serviceType: z.enum(["transfer", "hourly"]),
  returnTrip: z.boolean().optional(),
  vehicle: z.string().max(40),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
}).strict();

// Preview a code at the Payment step. Checkout re-checks it against the real
// quote price, so the total sent here only affects what is shown.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const vars = env as unknown as Record<string, string | undefined>;
  if (await overRateLimit(request, "promo-check", 20, 10, vars.RATE_LIMIT_SALT ?? "waydidi")) {
    return NextResponse.json({ ok: false, reason: "Too many tries. Please wait a few minutes." }, { status: 429 });
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "Enter a promo code." }, { status: 400 });
  const code = normalizeCode(parsed.data.code);
  if (!isCodeShape(code)) return NextResponse.json({ ok: false, reason: "This promo code isn't valid." });
  const customer = await currentCustomer().catch(() => null);
  const result = await checkPromo({ ...parsed.data, code, customerId: customer?.id ?? null }).catch(() => ({ ok: false as const, reason: "Promo codes are unavailable right now." }));
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, code, title: result.promo?.title ?? code, discount: result.discount, finalTotal: result.finalTotal }, { headers: { "Cache-Control": "no-store" } });
}
