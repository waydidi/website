import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { DEFAULT_CAP, dailyStatsIfDue, flightApiConfigured } from "@/lib/aerodatabox";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const allowed = (role: string) => role === "owner" || role === "operations";

/** Flight data usage for Admin → Flights: calls per day, settings, stats runs, watched pickups. */
export async function GET() {
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Staff access required.", 403);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [days, settings, stats, watch, searches] = await Promise.all([
    db().prepare("SELECT day,calls FROM flight_api_usage WHERE day>=? ORDER BY day DESC").bind(since).all<{ day: string; calls: number }>(),
    db().prepare("SELECT daily_cap,usd_per_call,updated_by,updated_at FROM flight_settings WHERE id=1").first<{ daily_cap: number; usd_per_call: number; updated_by: string | null; updated_at: string | null }>(),
    db().prepare("SELECT day,status,created_at,CASE WHEN status='failed' THEN stats_json END error FROM flight_stats ORDER BY day DESC LIMIT 7").all<{ day: string; status: string; created_at: string; error: string | null }>(),
    db().prepare("SELECT w.booking_reference,w.flight_number,w.last_eta,w.last_status,w.notified_at,w.checked_at,b.pickup_date,b.pickup_time FROM flight_watch w LEFT JOIN bookings b ON b.reference=w.booking_reference ORDER BY w.checked_at DESC LIMIT 20").all(),
    db().prepare("SELECT flight_number,SUM(searches) searches FROM flight_tracked WHERE day>=? GROUP BY flight_number ORDER BY searches DESC LIMIT 10").bind(since).all(),
  ]);
  return NextResponse.json({
    configured: flightApiConfigured(),
    settings: { dailyCap: settings?.daily_cap ?? DEFAULT_CAP, usdPerCall: settings?.usd_per_call ?? 0, updatedBy: settings?.updated_by ?? null, updatedAt: settings?.updated_at ?? null },
    days: days.results, stats: stats.results, watch: watch.results, searches: searches.results,
  }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Staff access required.", 403);
  const body = await request.json().catch(() => null) as { action?: string; dailyCap?: number; usdPerCall?: number } | null;
  if (body?.action === "run-stats") {
    if (!flightApiConfigured()) return reply("Add the AERODATABOX_KEY secret first.", 400);
    await dailyStatsIfDue(new Date(), true);
    const row = await db().prepare("SELECT status,stats_json FROM flight_stats ORDER BY created_at DESC LIMIT 1").first<{ status: string; stats_json: string | null }>();
    return NextResponse.json({ status: row?.status ?? "failed", error: row?.status === "failed" ? row.stats_json : null }, { headers });
  }
  const cap = Number(body?.dailyCap), price = Number(body?.usdPerCall);
  if (!Number.isInteger(cap) || cap < 0 || cap > 20000) return reply("Daily limit must be a whole number from 0 to 20,000.", 400);
  if (!Number.isFinite(price) || price < 0 || price > 1) return reply("Price per call must be between 0 and 1 US$.", 400);
  await db().prepare("INSERT INTO flight_settings(id,daily_cap,usd_per_call,updated_by,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET daily_cap=excluded.daily_cap,usd_per_call=excluded.usd_per_call,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
    .bind(cap, price, staff.displayName ?? staff.id, new Date().toISOString()).run();
  return NextResponse.json({ ok: true }, { headers });
}
