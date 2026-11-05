import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { funnelDateRange } from "@/lib/booking-funnel-rules";
import { canReviewPayments } from "@/lib/payment-discrepancies";
import { webMonitoringReport } from "@/lib/web-monitoring-db";
import { webMonitoringEnabled } from "@/lib/web-monitoring-rules";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReviewPayments(admin.role)) return NextResponse.json({ error: "Finance access required" }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const range = funnelDateRange(params.get("from") ?? "", params.get("to") ?? "");
  if (!range) return NextResponse.json({ error: "Choose a valid date range" }, { status: 400, headers });
  try { return NextResponse.json({ enabled: webMonitoringEnabled(env), ...await webMonitoringReport(env.DB, range.start, range.end) }, { headers }); }
  catch { return NextResponse.json({ error: "Report unavailable" }, { status: 503, headers }); }
}
