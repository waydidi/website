import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { leadsEnabled, listLeads } from "@/lib/sales-ai/leads";
import { factsCsv, lossAnalysis, quoteFacts, setLossLabel } from "@/lib/sales-ai/loss";
import { LOSS_REASONS } from "@/lib/sales-ai/lead-rules";

// Sales insights (owner only): lead scores and lost-quote analysis, on demand. allowedStaffRoute also refuses
// this path for every other role. Nothing here is scheduled or sent anywhere: there is no daily sales report.
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const bangkokStart = (day: string) => new Date(Date.parse(`${day}T00:00:00+07:00`)).toISOString();

export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || staff.role !== "owner") return fail("Owner access required.", 403);
  const q = new URL(request.url).searchParams;
  if (q.get("view") === "leads") return NextResponse.json({ enabled: leadsEnabled(), leads: await listLeads(100) }, { headers });
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const fromDay = q.get("from") || new Date(Date.parse(today) - 89 * 86400000).toISOString().slice(0, 10), toDay = q.get("to") || today;
  if (!DAY.test(fromDay) || !DAY.test(toDay) || fromDay > toDay) return fail("Choose a valid date range (YYYY-MM-DD).", 400);
  if (Date.parse(toDay) - Date.parse(fromDay) > 366 * 86400000) return fail("Choose at most one year.", 400);
  const from = bangkokStart(fromDay), to = new Date(Date.parse(bangkokStart(toDay)) + 86400000).toISOString();
  if (q.get("format") === "csv")
    return new Response(factsCsv(await quoteFacts(from, to)), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="quotes-${fromDay}-to-${toDay}.csv"` } });
  const analysis = await lossAnalysis(from, to);
  return NextResponse.json({ fromDay, toDay, ...analysis, reasonSummary: analysis.reasons, reasons: LOSS_REASONS }, { headers });
}

/** The owner labels why a sent quote was not booked (or corrects an earlier label). */
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return fail("Request blocked", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || staff.role !== "owner") return fail("Owner access required.", 403);
  const body = await request.json().catch(() => null) as { bundleId?: unknown; reason?: unknown } | null;
  if (typeof body?.bundleId !== "string" || !/^[a-f0-9]{16}$/.test(body.bundleId) || typeof body.reason !== "string" || !(LOSS_REASONS as readonly string[]).includes(body.reason)) return fail("Choose a quote and a reason.", 400);
  try { await setLossLabel(body.bundleId, body.reason, { name: staff.displayName, staffId: staff.id }); }
  catch (e) { return fail(e instanceof Error ? e.message : "Not saved.", 409); }
  return NextResponse.json({ ok: true }, { headers });
}
