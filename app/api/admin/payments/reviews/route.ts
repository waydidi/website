import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { canReviewPayments } from "@/lib/payment-discrepancies";
import { actOnPaymentReview, paymentReviewCases, paymentReviewHistory } from "@/lib/payment-review-db";
import { sameOrigin, isJsonRequest } from "@/lib/security";
import { logOperationalError, requestIdFor } from "@/lib/observability";

const headers = { "Cache-Control": "no-store" };
const referenceSchema = z.string().regex(/^(?:[A-HJ-NP-Z2-9]{6}|WD-[A-F0-9]{12})$/);
const actionSchema = z.object({
  requestId: z.string().uuid(), reference: referenceSchema,
  action: z.enum(["claim", "release", "note", "resolve"]),
  expectedVersion: z.number().int().min(0).max(100000000),
  note: z.string().trim().max(1000).default(""),
}).strict().refine(input => !["note", "resolve"].includes(input.action) || input.note.length >= 3);

export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReviewPayments(admin.role)) return NextResponse.json({ error: "Finance access required." }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  try {
    if (params.has("reference")) {
      const parsed = referenceSchema.safeParse(params.get("reference"));
      if (!parsed.success) return NextResponse.json({ error: "Invalid reference." }, { status: 400, headers });
      const rawOffset = params.get("offset") ?? "0";
      if (!/^\d{1,9}$/.test(rawOffset) || Number(rawOffset) % 100 !== 0) return NextResponse.json({ error: "Invalid history page." }, { status: 400, headers });
      const events = await paymentReviewHistory(env.DB, parsed.data, Number(rawOffset));
      return NextResponse.json({ events: events.slice(0, 100), hasMore: events.length > 100 }, { headers });
    }
    const offset = params.get("offset") ?? "0";
    if (!/^\d{1,9}$/.test(offset) || Number(offset) % 50 !== 0) return NextResponse.json({ error: "Invalid page." }, { status: 400, headers });
    const filter = z.enum(["open", "resolved", "all"]).safeParse(params.get("status") ?? "open");
    if (!filter.success) return NextResponse.json({ error: "Invalid review filter." }, { status: 400, headers });
    return NextResponse.json({ ...await paymentReviewCases(env.DB, Number(offset), filter.data), staffId: admin.id }, { headers });
  } catch (error) {
    logOperationalError("payment_review_load_failed", requestIdFor(request), error);
    return NextResponse.json({ error: "Payment reviews could not be loaded." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReviewPayments(admin.role) || !sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403, headers });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the review action and add a note when required." }, { status: 400, headers });
  try {
    const status = await actOnPaymentReview(env.DB, parsed.data, admin.id);
    if (status === "conflict") return NextResponse.json({ error: "This review changed, is assigned to another reviewer, or still has a payment discrepancy. Refresh and check the provider before resolving." }, { status: 409, headers });
    if (status === "not_found") return NextResponse.json({ error: "Booking not found." }, { status: 404, headers });
    return NextResponse.json({ ok: true, duplicate: status === "duplicate" }, { headers });
  } catch (error) {
    logOperationalError("payment_review_update_failed", requestIdFor(request), error);
    return NextResponse.json({ error: "The review could not be saved. Retry the same action before starting another." }, { status: 503, headers });
  }
}
