import { env } from "cloudflare:workers";
import { sha256 } from "@/lib/security";
import { toSatang } from "@/lib/money";
import { parseLegPrices, type LegPriceInput } from "@/lib/leg-price-rules";

// "Split payment" on a round trip: the admin sets the price to collect for the first trip and for the second trip.
// Rows are only ever added (the newest one counts), so what was set before stays on record. A split only counts
// while it still adds up to the booking's current total: if the booking's price changes later, the booking shows
// its normal price again until the split is set again.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => Stmt; batch: (s: Stmt[]) => Promise<unknown> };
const db = () => env.DB as unknown as Db;
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS booking_leg_prices (id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, first_minor INTEGER NOT NULL, second_minor INTEGER NOT NULL, total_minor INTEGER NOT NULL, set_by TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_booking_leg_prices_booking ON booking_leg_prices(booking_reference, created_at)",
];
let ready: Promise<unknown> | undefined;
const ensure = () => (ready ??= db().batch(SCHEMA.map((sql) => db().prepare(sql))).catch((error) => { ready = undefined; throw error; }));

export type LegSplit = { first: number; second: number };

/** The current split (in THB) of each of these bookings that has one and where it still adds up to the booking's total. */
export async function legSplits(refs: string[]): Promise<Map<string, LegSplit>> {
  const out = new Map<string, LegSplit>();
  if (!refs.length) return out;
  await ensure();
  for (let i = 0; i < refs.length; i += 40) {
    const chunk = refs.slice(i, i + 40);
    const { results } = await db().prepare(`SELECT p.booking_reference ref,p.first_minor f,p.second_minor s,p.total_minor t,b.total total FROM booking_leg_prices p JOIN bookings b ON b.reference=p.booking_reference
      WHERE p.booking_reference IN (${chunk.map(() => "?").join(",")}) AND p.id=(SELECT id FROM booking_leg_prices q WHERE q.booking_reference=p.booking_reference ORDER BY q.created_at DESC,q.id DESC LIMIT 1)`)
      .bind(...chunk).all<{ ref: string; f: number; s: number; t: number; total: number }>().catch(() => ({ results: [] }));
    for (const r of results) if (r.f + r.s === r.t && r.t === Math.round(r.total * 100)) out.set(r.ref, { first: r.f / 100, second: r.s / 100 });
  }
  return out;
}

export type SaveResult = { ok: true; changed: boolean } | { ok: false; status: number; error: string };

/** Records the two prices. Only a confirmed round trip; both prices must add up to the booking's total. */
export async function saveLegPrices(reference: string, input: LegPriceInput, by: string): Promise<SaveResult> {
  await ensure();
  const b = await db().prepare("SELECT status,total,return_date,return_time FROM bookings WHERE reference=? AND binned_at IS NULL").bind(reference).first<{ status: string; total: number; return_date: string | null; return_time: string | null }>();
  if (!b) return { ok: false, status: 404, error: "Booking not found." };
  if (!b.return_date || !b.return_time) return { ok: false, status: 409, error: "Only a round trip has two prices." };
  if (b.status === "cancelled" || b.status === "completed" || b.status === "no_show" || b.status === "expired") return { ok: false, status: 409, error: "This booking can't be changed." };
  const totalMinor = toSatang(b.total);
  const parsed = parseLegPrices(input, totalMinor);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const latest = await db().prepare("SELECT id,first_minor,second_minor,total_minor FROM booking_leg_prices WHERE booking_reference=? ORDER BY created_at DESC,id DESC LIMIT 1").bind(reference).first<{ id: string; first_minor: number; second_minor: number; total_minor: number }>();
  if (latest && latest.first_minor === parsed.value.firstMinor && latest.second_minor === parsed.value.secondMinor && latest.total_minor === totalMinor) return { ok: true, changed: false };
  // The same values on top of the same previous row make the same id: a retry or two taps at once add one row.
  const id = `legp:${(await sha256(`${reference}:${parsed.value.firstMinor}:${parsed.value.secondMinor}:${totalMinor}:${latest?.id ?? "none"}`)).slice(0, 40)}`;
  const at = new Date().toISOString();
  const written = await db().prepare(`INSERT OR IGNORE INTO booking_leg_prices(id,booking_reference,first_minor,second_minor,total_minor,set_by,created_at)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE reference=? AND binned_at IS NULL AND status NOT IN ('cancelled','completed','no_show','expired') AND CAST(ROUND(total*100) AS INTEGER)=?)`)
    .bind(id, reference, parsed.value.firstMinor, parsed.value.secondMinor, totalMinor, by, at, reference, totalMinor).run();
  return { ok: true, changed: written.meta.changes > 0 };
}
