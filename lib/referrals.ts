import { env } from "cloudflare:workers";

// "Share with a friend": every member has a personal code (e.g. FRIENDANNA27). A friend who uses it
// on their first ride gets ฿100 off; when that ride is completed, the member gets a ฿100 thank-you
// coupon (a one-use promo code, added to their coupons and emailed to them).

export const FRIEND_DISCOUNT = 100;
export const REFERRER_REWARD = 100;
export const MIN_FARE = 500;
export const MAX_REWARDS_PER_YEAR = 20;

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

let ready: Promise<unknown> | null = null;
export function ensureReferralTables() {
  ready ??= (async () => {
    await db().prepare("CREATE TABLE IF NOT EXISTS referral_codes (customer_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)").run();
    await db().prepare("CREATE TABLE IF NOT EXISTS referral_uses (booking_reference TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, friend_email TEXT, friend_phone TEXT, status TEXT NOT NULL DEFAULT 'pending', reward_code TEXT, created_at TEXT NOT NULL, rewarded_at TEXT)").run();
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

export const isReferralShape = (code: string) => /^FRIEND[A-Z0-9]{2,16}$/.test(code);
const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "").slice(-9);

/** The member's code, created the first time (FRIEND + first name + 2 digits). */
export async function referralCode(customer: { id: string; name?: string | null }) {
  await ensureReferralTables();
  const have = await db().prepare("SELECT code FROM referral_codes WHERE customer_id=?").bind(customer.id).first<{ code: string }>();
  if (have) return have.code;
  const base = (customer.name ?? "").normalize("NFKD").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "WAY";
  for (let i = 0; i < 30; i++) {
    const code = `FRIEND${base}${String(10 + Math.floor(Math.random() * 90))}${i > 10 ? i : ""}`;
    const r = await db().prepare("INSERT INTO referral_codes(customer_id,code,created_at) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM promo_codes WHERE UPPER(code)=?) ON CONFLICT DO NOTHING")
      .bind(customer.id, code, new Date().toISOString(), code).run().catch(() => ({ meta: { changes: 0 } }));
    if (r.meta.changes) return code;
    const mine = await db().prepare("SELECT code FROM referral_codes WHERE customer_id=?").bind(customer.id).first<{ code: string }>();
    if (mine) return mine.code;
  }
  throw new Error("Couldn't create a referral code.");
}

/** Check a friend's use of a code: first ride only, not the member themself, fare at least ฿500. */
export async function checkReferral(input: { code: string; total: number; email?: string; phone?: string; customerId?: string | null }) {
  if (!isReferralShape(input.code)) return null;
  await ensureReferralTables().catch(() => undefined);
  const owner = await db().prepare("SELECT r.customer_id,c.email,c.phone FROM referral_codes r LEFT JOIN customers c ON c.id=r.customer_id WHERE r.code=?").bind(input.code)
    .first<{ customer_id: string; email: string | null; phone: string | null }>().catch(() => null);
  if (!owner) return null;
  const email = (input.email ?? "").trim().toLowerCase(), phone = digits(input.phone);
  if (input.customerId === owner.customer_id || (email && owner.email?.toLowerCase() === email) || (phone.length >= 8 && digits(owner.phone) === phone))
    return { ok: false as const, reason: "This is your own invite code. Share it with friends instead!" };
  if (input.total < MIN_FARE) return { ok: false as const, reason: `Friend invites work on rides from ฿${MIN_FARE}.` };
  if (email || phone) {
    const before = await db().prepare(`SELECT 1 x FROM bookings WHERE status IN ('confirmed','completed') AND (LOWER(customer_email)=? OR substr(replace(replace(replace(customer_phone,' ',''),'-',''),'+',''),-9)=?) LIMIT 1`)
      .bind(email || "-", phone.length >= 8 ? phone : "-").first().catch(() => null);
    if (before) return { ok: false as const, reason: "Friend invites are for a first ride with Waydidi." };
  }
  const discount = Math.min(FRIEND_DISCOUNT, input.total);
  return { ok: true as const, discount, finalTotal: input.total - discount, referrerId: owner.customer_id, promo: { id: `referral:${owner.customer_id}`, code: input.code, title: `Friend invite · ฿${FRIEND_DISCOUNT} off your first ride` } };
}

export async function recordReferral(reference: string, referrerId: string, email?: string, phone?: string) {
  await ensureReferralTables();
  await db().prepare("INSERT INTO referral_uses(booking_reference,referrer_id,friend_email,friend_phone,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING")
    .bind(reference, referrerId, (email ?? "").toLowerCase() || null, phone || null, new Date().toISOString()).run();
}

const randomCode = () => `THANKS${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("")}`;

/**
 * Run from the scheduled job: for each friend's ride now completed, give the member a ฿100 thank-you
 * coupon (one use, 6 months). Cancelled rides earn nothing; at most 20 rewards a year per member.
 */
export async function issueReferralRewards(sendEmail?: (to: string, name: string, code: string, expires: string) => Promise<unknown>) {
  await ensureReferralTables();
  const { results } = await db().prepare(`SELECT u.booking_reference,u.referrer_id,b.status,c.email,c.name FROM referral_uses u JOIN bookings b ON b.reference=u.booking_reference
    LEFT JOIN customers c ON c.id=u.referrer_id WHERE u.status='pending' AND b.status IN ('completed','cancelled','no_show','binned') LIMIT 50`)
    .all<{ booking_reference: string; referrer_id: string; status: string; email: string | null; name: string | null }>();
  let issued = 0;
  for (const r of results) {
    const now = new Date().toISOString();
    if (r.status !== "completed") { await db().prepare("UPDATE referral_uses SET status='void' WHERE booking_reference=?").bind(r.booking_reference).run(); continue; }
    const year = await db().prepare("SELECT COUNT(*) n FROM referral_uses WHERE referrer_id=? AND status='rewarded' AND rewarded_at>?").bind(r.referrer_id, new Date(Date.now() - 365 * 86400_000).toISOString()).first<{ n: number }>();
    if ((year?.n ?? 0) >= MAX_REWARDS_PER_YEAR) { await db().prepare("UPDATE referral_uses SET status='capped' WHERE booking_reference=?").bind(r.booking_reference).run(); continue; }
    // Claim it first, so a reward is only ever issued once.
    const claimed = await db().prepare("UPDATE referral_uses SET status='rewarding' WHERE booking_reference=? AND status='pending'").bind(r.booking_reference).run();
    if (!claimed.meta.changes) continue;
    const code = randomCode(), expires = new Date(Date.now() + 182 * 86400_000).toISOString();
    await db().prepare(`INSERT INTO promo_codes(id,code,title,discount_type,discount_value,min_fare,ends_at,max_uses,per_customer_limit,first_booking_only,service,show_on_homepage,status,created_at,updated_at)
      VALUES(?,?,?,'fixed',?,?,?,1,1,0,'any',0,'active',?,?)`).bind(crypto.randomUUID(), code, `Thank you for inviting a friend · ฿${REFERRER_REWARD} off`, REFERRER_REWARD, MIN_FARE, expires, now, now).run();
    await db().prepare("INSERT INTO member_coupons(customer_id,code,collected_at) VALUES(?,?,?) ON CONFLICT DO NOTHING").bind(r.referrer_id, code, now).run().catch(() => undefined);
    await db().prepare("UPDATE referral_uses SET status='rewarded',reward_code=?,rewarded_at=? WHERE booking_reference=?").bind(code, now, r.booking_reference).run();
    if (sendEmail && r.email) await sendEmail(r.email, r.name ?? "", code, expires).catch(() => undefined);
    issued++;
  }
  return issued;
}

/** What a member sees on their account: their code and how their invites are doing. */
export async function referralSummary(customerId: string) {
  await ensureReferralTables();
  const r = await db().prepare("SELECT SUM(status IN ('pending','rewarding')) waiting, SUM(status='rewarded') rewarded FROM referral_uses WHERE referrer_id=?").bind(customerId).first<{ waiting: number | null; rewarded: number | null }>();
  return { waiting: r?.waiting ?? 0, rewarded: r?.rewarded ?? 0, earned: (r?.rewarded ?? 0) * REFERRER_REWARD };
}

/** Every 30 minutes (from the scheduled job): thank-you coupons for completed friend rides, by email. */
export async function referralRewardsIfDue(at: Date) {
  if (at.getUTCMinutes() % 30 !== 7) return 0;
  const { sendTripEmail } = await import("@/lib/email");
  return issueReferralRewards((to, name, code, expires) => sendTripEmail({
    to, kicker: "Waydidi friends", title: `Your friend rode with Waydidi: here's ฿${REFERRER_REWARD} for you`,
    intro: `Hi${name ? ` ${name}` : ""}, thank you for inviting a friend. Their ride is complete, so here's your thank-you coupon.`,
    rows: [["Coupon code", code], ["Value", `฿${REFERRER_REWARD} off a ride from ฿${MIN_FARE}`], ["Valid until", expires.slice(0, 10)]],
    cta: "See my coupons", link: "https://waydidi.com/account/coupons",
    footer: "It's also saved in your Waydidi account. Keep inviting friends: there's a coupon for every friend's first ride.",
    tag: `referral-reward-${code}`,
  }));
}
