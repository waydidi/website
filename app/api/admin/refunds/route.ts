import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { createRefund, quoteRefund, reconcileRefunds, refundsFor } from "@/lib/refunds";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const reasons = ["customer_cancellation", "no_show", "waydidi_cancellation", "goodwill"] as const;
const ref = z.string().regex(/^[A-Z0-9]{4,12}$/);

// Admin: refund quote (calculated on the server) and the refunds already made.
export async function GET(request: Request) {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const reference = ref.safeParse(url.searchParams.get("reference"));
  const reason = z.enum(reasons).safeParse(url.searchParams.get("reason") ?? "customer_cancellation");
  if (!reference.success || !reason.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const requestedAt = url.searchParams.get("requestedAt") || new Date().toISOString();
  const [quote, refunds] = await Promise.all([quoteRefund(reference.data, reason.data, requestedAt), refundsFor(reference.data)]);
  return NextResponse.json({ quote, refunds }, { headers: { "Cache-Control": "no-store" } });
}

const createSchema = z.object({
  action: z.literal("create"),
  reference: ref,
  reason: z.enum(reasons),
  requestedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  confirm: z.literal(true),
  note: z.string().trim().max(300).optional(),
  providerFeeMinor: z.number().int().min(0).max(10_000_000).optional(),
}).strict();
const reconcileSchema = z.object({ action: z.literal("reconcile"), reference: ref }).strict();

// Admin: confirm a refund (amount recalculated here) or re-check its provider status.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const reconcile = reconcileSchema.safeParse(body);
  if (reconcile.success) { await reconcileRefunds(reconcile.data.reference); return NextResponse.json({ refunds: await refundsFor(reconcile.data.reference) }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the refund details and confirm." }, { status: 400 });
  if (Date.parse(parsed.data.requestedAt) > Date.now() + 60_000) return NextResponse.json({ error: "The cancellation time can't be in the future." }, { status: 400 });
  const result = await createRefund({ ...parsed.data, admin: admin.email });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ refund: result.refund, duplicate: result.duplicate, refunds: await refundsFor(parsed.data.reference) });
}
