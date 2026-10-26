import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { canReviewPayments } from "@/lib/payment-discrepancies";
import { funnelDateRange, funnelEnabled } from "@/lib/booking-funnel-rules";
import { funnelReport } from "@/lib/booking-funnel-db";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReviewPayments(admin.role)) return NextResponse.json({ error: "Finance access required" }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const range = funnelDateRange(params.get("from") ?? "", params.get("to") ?? "");
  const service = params.get("service") ?? "all";
  if (!range || !["all", "transfer", "hourly", "tour"].includes(service)) return NextResponse.json({ error: "Choose a valid range of up to 90 days" }, { status: 400, headers });
  try { return NextResponse.json({ enabled: funnelEnabled(env), counts: await funnelReport(env.DB, range.start, range.end, service) }, { headers }); }
  catch { return NextResponse.json({ error: "Report unavailable" }, { status: 503, headers }); }
}
