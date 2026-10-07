import { env } from "cloudflare:workers";
import { commissionState } from "@/lib/storefront";
import { tripSecretHmacHex } from "@/lib/trip-secret";

// Affiliates: partners (bloggers, hotels, guides) who send customers with their own link
// (waydidi.com/?ref=mint, remembered for 30 days) or code (MINT5, gives the customer a discount).
// They earn a commission on the fare the customer pays, once the ride is completed.

export const REF_COOKIE = "wd_ref";
export const REF_DAYS = 30;
export type Affiliate = {
  id: string; slug: string; code: string; name: string; email: string | null; phone: string | null; kind: string;
  commission_percent: number; discount_percent: number; status: string; notes: string | null; created_at: string; updated_at: string; link_version?: number;
  website?: string | null; audience?: string | null; pitch?: string | null; decided_at?: string | null; decided_by?: string | null;
};
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

// The tables are created on first use (CREATE … IF NOT EXISTS), so the feature works even before the
// migration (drizzle/0096_affiliates.sql) has been run on the live database.
let ready: Promise<unknown> | null = null;
export function ensureAffiliateTables() {
  ready ??= (async () => {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS affiliates (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT, phone TEXT, kind TEXT NOT NULL DEFAULT 'creator', commission_percent REAL NOT NULL DEFAULT 8, discount_percent REAL NOT NULL DEFAULT 5, status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS affiliate_clicks (affiliate_id TEXT NOT NULL, day TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (affiliate_id, day))",
      "CREATE TABLE IF NOT EXISTS booking_affiliates (booking_reference TEXT PRIMARY KEY, affiliate_id TEXT NOT NULL, via TEXT NOT NULL, fare_before_discount INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, commission_percent REAL NOT NULL, commission INTEGER NOT NULL, paid_at TEXT, created_at TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_booking_affiliates_affiliate ON booking_affiliates(affiliate_id)",
    ]) await db().prepare(sql).run();
    // Added later: bumping it gives the partner a new dashboard link (the old one stops working).
    for (const col of ["link_version INTEGER NOT NULL DEFAULT 0", "website TEXT", "audience TEXT", "pitch TEXT", "decided_at TEXT", "decided_by TEXT"])
      await db().prepare(`ALTER TABLE affiliates ADD COLUMN ${col}`).run().catch(() => undefined);
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export const cleanSlug = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
export const cleanCode = (v: string) => v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
export const isSlug = (v: string) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(v);

export async function affiliateBySlug(slug: string) {
  await ensureAffiliateTables().catch(() => undefined);
  return isSlug(slug) ? db().prepare("SELECT * FROM affiliates WHERE slug=? AND status='active'").bind(slug).first<Affiliate>().catch(() => null) : null;
}
export async function affiliateByCode(code: string) {
  const c = cleanCode(code);
  if (c.length >= 3) await ensureAffiliateTables().catch(() => undefined);
  return c.length >= 3 ? db().prepare("SELECT * FROM affiliates WHERE code=? AND status='active'").bind(c).first<Affiliate>().catch(() => null) : null;
}

/** One more click on a partner link (counted per day). */
export async function countClick(slug: string) {
  const a = await affiliateBySlug(slug);
  if (!a) return false;
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  await db().prepare("INSERT INTO affiliate_clicks(affiliate_id,day,clicks) VALUES(?,?,1) ON CONFLICT(affiliate_id,day) DO UPDATE SET clicks=clicks+1").bind(a.id, day).run();
  return true;
}

export const affiliateDiscount = (fare: number, percent: number) => Math.max(0, Math.round((fare * percent) / 100));
export const affiliateCommission = (fareAfterDiscount: number, percent: number) => Math.max(0, Math.round((fareAfterDiscount * percent) / 100));

/** Read the remembered partner from the request's cookie. */
export function refFromRequest(request: Request) {
  const m = (request.headers.get("cookie") ?? "").match(/(?:^|;\s*)wd_ref=([a-z0-9-]{2,40})/);
  return m?.[1] ?? null;
}

/** A partner can't earn on their own bookings. */
export const isSelfReferral = (a: Affiliate, email?: string | null, phone?: string | null) => {
  const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "").slice(-9);
  return Boolean((a.email && email && a.email.trim().toLowerCase() === email.trim().toLowerCase()) || (a.phone && phone && digits(a.phone).length >= 8 && digits(a.phone) === digits(phone)));
};

export async function linkBooking(input: { reference: string; affiliate: Affiliate; via: "link" | "code"; fare: number; discount: number }) {
  await ensureAffiliateTables();
  const commission = affiliateCommission(input.fare - input.discount, input.affiliate.commission_percent);
  await db().prepare("INSERT INTO booking_affiliates(booking_reference,affiliate_id,via,fare_before_discount,discount,commission_percent,commission,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(booking_reference) DO NOTHING")
    .bind(input.reference, input.affiliate.id, input.via, input.fare, input.discount, input.affiliate.commission_percent, commission, new Date().toISOString()).run();
}

export type AffiliateSummary = Affiliate & { clicks30: number; bookings: number; sales: number; pending: number; earned: number; paid: number };
/** Every partner with clicks (30 days), bookings, sales and commission (pending, earned and unpaid, paid). */
export async function affiliateSummaries(): Promise<AffiliateSummary[]> {
  await ensureAffiliateTables();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [list, clicks, rows] = await Promise.all([
    db().prepare("SELECT * FROM affiliates ORDER BY created_at DESC").all<Affiliate>(),
    db().prepare("SELECT affiliate_id,SUM(clicks) n FROM affiliate_clicks WHERE day>=? GROUP BY affiliate_id").bind(since).all<{ affiliate_id: string; n: number }>(),
    db().prepare("SELECT ba.affiliate_id,ba.commission,ba.fare_before_discount-ba.discount sale,ba.paid_at,b.status FROM booking_affiliates ba JOIN bookings b ON b.reference=ba.booking_reference").all<{ affiliate_id: string; commission: number; sale: number; paid_at: string | null; status: string }>(),
  ]);
  const clickMap = new Map(clicks.results.map((c) => [c.affiliate_id, c.n]));
  return list.results.map((a) => {
    const mine = rows.results.filter((r) => r.affiliate_id === a.id && commissionState(r.status) !== "cancelled" && r.status !== "pending_payment");
    const sum = (f: (r: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((n, r) => n + r.commission, 0);
    return { ...a, clicks30: clickMap.get(a.id) ?? 0, bookings: mine.length, sales: mine.reduce((n, r) => n + r.sale, 0),
      pending: sum((r) => commissionState(r.status) === "pending"), earned: sum((r) => commissionState(r.status) === "earned" && !r.paid_at), paid: sum((r) => Boolean(r.paid_at)) };
  });
}

export async function affiliateBookings(affiliateId: string) {
  const { results } = await db().prepare(`SELECT ba.*,b.customer_name,b.pickup_date,b.pickup,b.dropoff,b.status FROM booking_affiliates ba JOIN bookings b ON b.reference=ba.booking_reference
    WHERE ba.affiliate_id=? ORDER BY ba.created_at DESC LIMIT 200`).bind(affiliateId).all<{ booking_reference: string; via: string; fare_before_discount: number; discount: number; commission: number; paid_at: string | null; customer_name: string; pickup_date: string; pickup: string; dropoff: string; status: string }>();
  return results.map((r) => ({ ...r, state: commissionState(r.status) }));
}

// ---- Partner dashboard: a private link per partner (waydidi.com/partner/<id>/<key>), no password ----

const dashKey = async (a: Pick<Affiliate, "id" | "link_version">) => (await tripSecretHmacHex(`aff-dash:${a.id}:${a.link_version ?? 0}`)).slice(0, 32);
export async function dashboardPath(a: Pick<Affiliate, "id" | "link_version">) { return `/partner/${a.id}/${await dashKey(a)}`; }

/** The partner for a dashboard link, or null if the link is wrong or has been replaced. */
export async function affiliateForDashboard(id: string, key: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{32}$/.test(key)) return null;
  await ensureAffiliateTables().catch(() => undefined);
  const a = await db().prepare("SELECT * FROM affiliates WHERE id=?").bind(id).first<Affiliate>().catch(() => null);
  if (!a) return null;
  const expected = await dashKey(a);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= expected.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0 ? a : null;
}

/** Everything a partner sees: this month's numbers, totals, and recent bookings (no customer names). */
export async function partnerDashboard(a: Affiliate) {
  const bkk = new Date(Date.now() + 7 * 3600_000).toISOString();
  const monthStart = `${bkk.slice(0, 7)}-01`;
  const [clicks, rows] = await Promise.all([
    db().prepare("SELECT COALESCE(SUM(clicks),0) n FROM affiliate_clicks WHERE affiliate_id=? AND day>=?").bind(a.id, monthStart).first<{ n: number }>(),
    db().prepare(`SELECT ba.booking_reference,ba.via,ba.fare_before_discount,ba.discount,ba.commission,ba.paid_at,ba.created_at,b.pickup_date,b.pickup,b.dropoff,b.status
      FROM booking_affiliates ba JOIN bookings b ON b.reference=ba.booking_reference WHERE ba.affiliate_id=? AND b.status<>'pending_payment' ORDER BY ba.created_at DESC LIMIT 300`).bind(a.id)
      .all<{ booking_reference: string; via: string; fare_before_discount: number; discount: number; commission: number; paid_at: string | null; created_at: string; pickup_date: string; pickup: string; dropoff: string; status: string }>(),
  ]);
  const list = rows.results.map((r) => ({ ...r, state: r.paid_at ? "paid" as const : commissionState(r.status) === "earned" ? "owed" as const : commissionState(r.status) }));
  const live = list.filter((r) => r.state !== "cancelled");
  const sum = (xs: typeof list) => xs.reduce((n, r) => n + r.commission, 0);
  const thisMonth = live.filter((r) => (new Date(Date.parse(r.created_at) + 7 * 3600_000).toISOString()) >= monthStart);
  return {
    monthName: new Date(`${monthStart}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }),
    month: { clicks: clicks?.n ?? 0, bookings: thisMonth.length },
    owed: sum(list.filter((r) => r.state === "owed")),
    pending: sum(list.filter((r) => r.state === "pending")),
    paid: sum(list.filter((r) => r.state === "paid")),
    completedRides: list.filter((r) => r.state === "owed" || r.state === "paid").length,
    recent: list.slice(0, 30).map((r) => ({ date: r.pickup_date, from: r.pickup, to: r.dropoff, via: r.via, commission: r.commission, state: r.state })),
  };
}

// ---- Applications from the public join page (waydidi.com/partners) ----

export const DEFAULT_COMMISSION = 8;
export const DEFAULT_DISCOUNT = 5;

/** A free link name and code for a new partner, based on what they asked for or their name. */
async function freeSlugAndCode(wanted: string, name: string) {
  const base = (cleanSlug(wanted) || cleanSlug(name.replace(/\s+/g, "-")) || "partner").replace(/^-+|-+$/g, "").slice(0, 30) || "partner";
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${base}-${i + 1}` : base;
    const code = cleanCode(`${slug.replace(/-/g, "").slice(0, 12)}${i ? i + 1 : ""}${DEFAULT_DISCOUNT}`);
    const taken = await db().prepare("SELECT 1 x FROM affiliates WHERE slug=? OR code=? UNION SELECT 1 FROM promo_codes WHERE UPPER(code)=?").bind(slug, code, code).first().catch(() => null);
    if (!taken && isSlug(slug) && code.length >= 3) return { slug, code };
  }
  const r = crypto.randomUUID().slice(0, 6);
  return { slug: `partner-${r}`, code: cleanCode(`P${r}${DEFAULT_DISCOUNT}`) };
}

export type Application = { name: string; email: string; phone: string; kind: string; website: string; audience: string; pitch: string; wanted: string };
export async function applyAsAffiliate(a: Application) {
  await ensureAffiliateTables();
  const dup = await db().prepare("SELECT status FROM affiliates WHERE LOWER(email)=? AND status IN ('applied','active','paused')").bind(a.email.toLowerCase()).first<{ status: string }>();
  if (dup) return { ok: false as const, reason: dup.status === "applied" ? "We already have your application. We'll reply by email soon." : "This email is already a Waydidi partner." };
  const { slug, code } = await freeSlugAndCode(a.wanted, a.name);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().prepare("INSERT INTO affiliates(id,slug,code,name,email,phone,kind,commission_percent,discount_percent,status,website,audience,pitch,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'applied',?,?,?,?,?)")
    .bind(id, slug, code, a.name, a.email.toLowerCase(), a.phone || null, a.kind, DEFAULT_COMMISSION, DEFAULT_DISCOUNT, a.website || null, a.audience || null, a.pitch || null, now, now).run();
  return { ok: true as const, id, slug, code };
}
