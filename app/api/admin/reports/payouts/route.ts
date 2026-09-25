import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { markWeekPaid } from "@/lib/reports";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const schema = z.object({
  driverId: z.string().min(1).max(80),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentReference: z.string().trim().max(120).optional().default(""),
});

// Admin-only: mark a driver's unpaid trips for one week as paid.
export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the payout details." }, { status: 400 });
  const updated = await markWeekPaid(parsed.data.driverId, parsed.data.week, parsed.data.paymentReference, admin.email);
  console.info("Admin marked driver payout paid", { driverId: parsed.data.driverId, week: parsed.data.week, trips: updated, admin: admin.email });
  return NextResponse.json({ ok: true, updated });
}
