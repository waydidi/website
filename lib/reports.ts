import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookingCosts, bookingFreeAddons, bookingMemberDiscounts, bookings, drivers, memberBoxes, promoRedemptions } from "@/db/schema";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB } from "./addons";
import { TIERS } from "./member-tier-rules";

// Revenue counts trips that went ahead; cancelled/refunded/failed ones are left out.
const EARNING = ["confirmed", "completed"];
const CHUNK = 90; // D1 allows at most 100 bound values per query

async function inChunks<T>(values: string[], run: (part: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += CHUNK) out.push(...(await run(values.slice(i, i + CHUNK))));
  return out;
}

export type ReportRange = { from: string; to: string }; // YYYY-MM-DD, by pickup (trip) date, inclusive

/** Trips in the range with their money: fare, discounts and driver cost. */
async function tripsInRange({ from, to }: ReportRange) {
  const rows = await getDb().select({
    reference: bookings.reference, pickupDate: bookings.pickupDate, pickup: bookings.pickup, dropoff: bookings.dropoff,
    vehicle: bookings.vehicle, paymentMethod: bookings.paymentMethod, total: bookings.total, status: bookings.status, serviceType: bookings.serviceType,
  }).from(bookings)
    .where(and(gte(bookings.pickupDate, from), lte(bookings.pickupDate, to), inArray(bookings.status, EARNING), isNull(bookings.binnedAt)));
  const refs = rows.map((r) => r.reference);
  const [promos, members, costs] = await Promise.all([
    inChunks(refs, (part) => getDb().select({ ref: promoRedemptions.bookingReference, discount: promoRedemptions.discount, code: promoRedemptions.code }).from(promoRedemptions).where(inArray(promoRedemptions.bookingReference, part))),
    inChunks(refs, (part) => getDb().select({ ref: bookingMemberDiscounts.bookingReference, discount: bookingMemberDiscounts.discount }).from(bookingMemberDiscounts).where(inArray(bookingMemberDiscounts.bookingReference, part))).catch(() => []),
    inChunks(refs, (part) => getDb().select({ ref: bookingCosts.bookingReference, cost: bookingCosts.totalDriverCost }).from(bookingCosts).where(inArray(bookingCosts.bookingReference, part))),
  ]);
  const promoBy = new Map(promos.map((p) => [p.ref, p.discount]));
  const memberBy = new Map(members.map((m) => [m.ref, m.discount]));
  const costBy = new Map(costs.map((c) => [c.ref, c.cost]));
  return rows.map((r) => ({
    ...r,
    promoDiscount: promoBy.get(r.reference) ?? 0,
    memberDiscount: memberBy.get(r.reference) ?? 0,
    driverCost: costBy.has(r.reference) ? costBy.get(r.reference)! : null,
  }));
}
export type ReportTrip = Awaited<ReturnType<typeof tripsInRange>>[number];

type Totals = { trips: number; revenue: number; discounts: number; driverCost: number; margin: number; costMissing: number };
const empty = (): Totals => ({ trips: 0, revenue: 0, discounts: 0, driverCost: 0, margin: 0, costMissing: 0 });
function add(t: Totals, trip: ReportTrip) {
  t.trips += 1;
  t.revenue += trip.total;
  t.discounts += trip.promoDiscount + trip.memberDiscount;
  if (trip.driverCost == null) t.costMissing += 1; else t.driverCost += trip.driverCost;
  t.margin = t.revenue - t.driverCost;
}

function group(trips: ReportTrip[], key: (t: ReportTrip) => string) {
  const map = new Map<string, Totals>();
  for (const trip of trips) { const k = key(trip); if (!map.has(k)) map.set(k, empty()); add(map.get(k)!, trip); }
  return map;
}

export async function revenueReport(range: ReportRange, by: "day" | "month") {
  const trips = await tripsInRange(range);
  const total = empty();
  trips.forEach((t) => add(total, t));
  const periods = [...group(trips, (t) => (by === "month" ? t.pickupDate.slice(0, 7) : t.pickupDate))].sort(([a], [b]) => a.localeCompare(b));
  const payment = [...group(trips, (t) => (t.paymentMethod === "cash" ? "Cash" : "Card"))];
  const vehicles = [...group(trips, (t) => t.vehicle)].sort(([, a], [, b]) => b.revenue - a.revenue);
  const routes = [...group(trips, (t) => (t.serviceType === "hourly" ? `${t.pickup.split(",")[0]} (hourly)` : `${t.pickup.split(",")[0]} → ${t.dropoff.split(",")[0]}`))]
    .sort(([, a], [, b]) => b.revenue - a.revenue).slice(0, 10);
  return { trips, total, periods, payment, vehicles, routes };
}

/** Monday (YYYY-MM-DD) of the week a date falls in. */
export function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * 86_400_000).toISOString().slice(0, 10);
}

export type PayoutTrip = { reference: string; pickupDate: string; route: string; fare: number; cost: number | null; status: string };
export type PayoutGroup = {
  driverId: string; driverName: string; phone: string; bank: { code: string; account: string; name: string };
  week: string; trips: PayoutTrip[]; owed: number; paid: number; unpaid: number; costMissing: number; state: "paid" | "unpaid" | "partly_paid";
};

/** Driver earnings per driver per week, from trips with a driver assigned. */
export async function driverPayouts({ from, to }: ReportRange): Promise<PayoutGroup[]> {
  const rows = await getDb().select({
    reference: bookings.reference, pickupDate: bookings.pickupDate, pickup: bookings.pickup, dropoff: bookings.dropoff, total: bookings.total,
    driverId: bookingAssignments.driverId, driverName: drivers.fullName, phone: drivers.phone,
    bankCode: drivers.bankCode, bankAccount: drivers.bankAccountNumber, bankName: drivers.bankAccountName,
  }).from(bookings)
    .innerJoin(bookingAssignments, and(eq(bookingAssignments.bookingReference, bookings.reference), isNull(bookingAssignments.revokedAt)))
    .innerJoin(drivers, eq(drivers.id, bookingAssignments.driverId))
    .where(and(gte(bookings.pickupDate, from), lte(bookings.pickupDate, to), inArray(bookings.status, EARNING), isNull(bookings.binnedAt)));
  const costs = await inChunks(rows.map((r) => r.reference), (part) => getDb().select({ ref: bookingCosts.bookingReference, cost: bookingCosts.totalDriverCost, status: bookingCosts.paymentStatus }).from(bookingCosts).where(inArray(bookingCosts.bookingReference, part)));
  const costBy = new Map(costs.map((c) => [c.ref, c]));
  const groups = new Map<string, PayoutGroup>();
  for (const r of rows) {
    const week = weekStart(r.pickupDate);
    const key = `${r.driverId}|${week}`;
    if (!groups.has(key)) groups.set(key, { driverId: r.driverId, driverName: r.driverName, phone: r.phone, bank: { code: r.bankCode, account: r.bankAccount, name: r.bankName }, week, trips: [], owed: 0, paid: 0, unpaid: 0, costMissing: 0, state: "unpaid" });
    const g = groups.get(key)!;
    const cost = costBy.get(r.reference);
    g.trips.push({ reference: r.reference, pickupDate: r.pickupDate, route: `${r.pickup.split(",")[0]} → ${r.dropoff.split(",")[0]}`, fare: r.total, cost: cost ? cost.cost : null, status: cost?.status ?? "unpaid" });
    if (!cost) { g.costMissing += 1; continue; }
    g.owed += cost.cost;
    if (cost.status === "paid") g.paid += cost.cost; else g.unpaid += cost.cost;
  }
  for (const g of groups.values()) {
    g.trips.sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
    g.state = g.unpaid === 0 && g.costMissing === 0 && g.paid > 0 ? "paid" : g.paid > 0 ? "partly_paid" : "unpaid";
  }
  return [...groups.values()].sort((a, b) => b.week.localeCompare(a.week) || a.driverName.localeCompare(b.driverName));
}

/**
 * Marks one driver's unpaid trips in one week as paid. The trips are worked out here
 * (not sent by the browser), and only trips with a driver cost set are changed.
 */
export async function markWeekPaid(driverId: string, week: string, paymentReference: string, adminEmail: string) {
  const end = new Date(new Date(`${week}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const group = (await driverPayouts({ from: week, to: end })).find((g) => g.driverId === driverId && g.week === week);
  const refs = group ? group.trips.filter((t) => t.cost != null && t.status !== "paid").map((t) => t.reference) : [];
  const now = new Date().toISOString();
  let updated = 0;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const res = await getDb().update(bookingCosts).set({ paymentStatus: "paid", paidAt: now, paymentReference: paymentReference || null, updatedBy: adminEmail, updatedAt: now })
      .where(inArray(bookingCosts.bookingReference, refs.slice(i, i + CHUNK))).returning({ ref: bookingCosts.bookingReference });
    updated += res.length;
  }
  return updated;
}

// ---- CSV ----
const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  // Quote when needed; a leading =,+,-,@ is prefixed so spreadsheets don't run it as a formula.
  // Plain numbers and phone numbers (e.g. +66 81 234 5678) are left as they are.
  const safe = /^[=+\-@]/.test(s) && !/^[+-]?[\d ().-]+$/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};
export const toCsv = (rows: (string | number | null)[][]) => rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

// ---- Discount cost ----

export type DiscountLine = { key: string; label: string; group: "Promo codes" | "Member rewards" | "Free add-ons"; cost: number; bookings: number; revenue: number };

const BUILT_IN: Record<string, { label: string; group: DiscountLine["group"] }> = {
  LOYALTY: { label: "5th-ride reward (10% off)", group: "Member rewards" },
  SPIN: { label: "Spin-the-wheel prize", group: "Member rewards" },
  FREERIDE: { label: "Free airport transfer gift", group: "Member rewards" },
  REWARD: { label: "Mystery-box THB-off coupon", group: "Member rewards" },
};

/**
 * What discounts and free extras cost in the range (by trip date, confirmed and completed
 * trips), and how many bookings and how much revenue came with each.
 */
export async function discountReport(range: ReportRange) {
  const trips = await tripsInRange(range);
  const refs = trips.map((t) => t.reference);
  const [promos, members, freebies, tickets] = await Promise.all([
    inChunks(refs, (part) => getDb().select({ ref: promoRedemptions.bookingReference, code: promoRedemptions.code, discount: promoRedemptions.discount }).from(promoRedemptions).where(inArray(promoRedemptions.bookingReference, part))),
    inChunks(refs, (part) => getDb().select({ ref: bookingMemberDiscounts.bookingReference, tier: bookingMemberDiscounts.tier, discount: bookingMemberDiscounts.discount }).from(bookingMemberDiscounts).where(inArray(bookingMemberDiscounts.bookingReference, part))).catch(() => []),
    inChunks(refs, (part) => getDb().select().from(bookingFreeAddons).where(inArray(bookingFreeAddons.bookingReference, part))).catch(() => []),
    // Partner prizes (cruise, buffet) won in mystery boxes opened in the range.
    getDb().select({ prize: memberBoxes.prizeName, fulfilment: memberBoxes.fulfilment }).from(memberBoxes)
      .where(and(gte(memberBoxes.openedAt, `${range.from}T00:00:00`), lte(memberBoxes.openedAt, `${range.to}T23:59:59.999Z`))).catch(() => []),
  ]);
  const revenueBy = new Map(trips.map((t) => [t.reference, t.total]));
  const lines = new Map<string, DiscountLine>();
  const put = (key: string, label: string, group: DiscountLine["group"], ref: string, cost: number) => {
    if (cost <= 0) return;
    if (!lines.has(key)) lines.set(key, { key, label, group, cost: 0, bookings: 0, revenue: 0 });
    const l = lines.get(key)!;
    l.cost += cost; l.bookings += 1; l.revenue += revenueBy.get(ref) ?? 0;
  };
  for (const p of promos) {
    const built = BUILT_IN[p.code];
    put(`code:${p.code}`, built?.label ?? `Code ${p.code}`, built?.group ?? "Promo codes", p.ref, p.discount);
  }
  for (const m of members) {
    const tier = TIERS.find((t) => t.id === m.tier);
    put(`tier:${m.tier}`, `${tier?.name ?? m.tier} member discount (${tier?.percent ?? "?"}%)`, "Member rewards", m.ref, m.discount);
  }
  for (const f of freebies) {
    // Split what the badge gave for free from what a gift voucher covered.
    const [tierId] = f.tier.split("+");
    const tier = TIERS.find((t) => t.id === tierId);
    const tierSeats = Math.min(f.childSeats, tier?.freeChildSeats ?? 0);
    const tierExchange = Boolean(f.exchangeStop && tier?.freeExchangeStop);
    const name = tier?.name ?? "Member";
    put(`free-seat-tier:${tierId}`, `Free child seat (${name} badge)`, "Free add-ons", f.bookingReference, tierSeats * CHILD_SEAT_THB);
    put(`free-exchange-tier:${tierId}`, `Free exchange stop (${name} badge)`, "Free add-ons", f.bookingReference, tierExchange ? EXCHANGE_STOP_THB : 0);
    put("free-seat-gift", "Free child seat (gift voucher)", "Free add-ons", f.bookingReference, (f.childSeats - tierSeats) * CHILD_SEAT_THB);
    put("free-exchange-gift", "Free exchange stop (gift voucher)", "Free add-ons", f.bookingReference, f.exchangeStop && !tierExchange ? EXCHANGE_STOP_THB : 0);
  }
  const list = [...lines.values()].sort((a, b) => b.cost - a.cost);
  const discountedRefs = new Set([...promos.map((p) => p.ref), ...members.map((m) => m.ref), ...freebies.map((f) => f.bookingReference)]);
  const revenue = trips.reduce((n, t) => n + t.total, 0);
  const cost = list.reduce((n, l) => n + l.cost, 0);
  const ticketCounts = new Map<string, { won: number; arranged: number }>();
  for (const t of tickets) {
    if (!t.prize || t.fulfilment == null) continue; // only partner tickets carry a fulfilment status
    const c = ticketCounts.get(t.prize) ?? { won: 0, arranged: 0 };
    c.won += 1; if (t.fulfilment !== "to_arrange") c.arranged += 1;
    ticketCounts.set(t.prize, c);
  }
  return {
    lines: list, cost, revenue, trips: trips.length,
    discountedTrips: [...discountedRefs].filter((r) => revenueBy.has(r)).length,
    // Share of what the fares would have been without any discount.
    share: revenue + cost > 0 ? cost / (revenue + cost) : 0,
    byGroup: (["Promo codes", "Member rewards", "Free add-ons"] as const).map((g) => ({ group: g, cost: list.filter((l) => l.group === g).reduce((n, l) => n + l.cost, 0) })),
    partnerTickets: [...ticketCounts].map(([prize, c]) => ({ prize, ...c })),
  };
}
