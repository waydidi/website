import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { smartTrips, tripPackages } from "@/db/schema";
import { attractionsById } from "@/lib/attractions";
import { arrange, inputFromRow, planFor, saveTrip, snapshotTrip, type TripInput } from "@/lib/smart-trips";
import { startTripCheckout } from "@/lib/trip-booking";
import { notifyTripSent } from "@/lib/trip-notify";
import { fmt } from "@/lib/trip-plan";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

export type PackageRow = typeof tripPackages.$inferSelect;
export const PACKAGE_KINDS = ["half_day", "full_day", "evening", "multi_day"] as const;
export const KIND_LABEL: Record<(typeof PACKAGE_KINDS)[number], string> = { half_day: "Half day", full_day: "Full day", evening: "Evening", multi_day: "Multi-day" };

const json = <T,>(v: string | null | undefined, fallback: T): T => { try { return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
const text = (max: number) => z.string().trim().max(max);
const time = z.string().regex(/^\d{2}:\d{2}$/);

export const packageSchema = z.object({
  id: z.string().max(60).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,80}$/, "Use lowercase letters, numbers and dashes for the web address."),
  city: z.string().trim().min(2).max(60),
  templateId: z.string().min(1).max(60),
  name: text(120).min(3),
  kind: z.enum(PACKAGE_KINDS),
  summary: text(400).nullable().optional().transform((v) => v || null),
  highlights: z.array(text(160)).max(10).default([]),
  included: z.array(text(160)).max(12).default([]),
  excluded: z.array(text(160)).max(12).default([]),
  startTimes: z.array(time).min(1, "Add at least one start time.").max(8),
  coverImage: text(500).nullable().optional().transform((v) => v || null),
  prices: z.record(z.enum(Object.keys(VEHICLES) as [string, ...string[]]), z.number().int().min(0).max(1_000_000)),
  minNoticeHours: z.number().int().min(0).max(240).default(24),
  published: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export type PackageInput = z.infer<typeof packageSchema>;

export function packageView(r: PackageRow) {
  return { ...r, highlights: json<string[]>(r.highlightsJson, []), included: json<string[]>(r.includedJson, []), excluded: json<string[]>(r.excludedJson, []),
    startTimes: json<string[]>(r.startTimesJson, []), prices: json<Record<string, number>>(r.pricesJson, {}) };
}
export type PackageView = ReturnType<typeof packageView>;

/** First bookable day (Bangkok time) given the notice period. */
export const earliestDate = (p: PackageView) => new Date(Date.now() + p.minNoticeHours * 3600_000 + 7 * 3600_000).toISOString().slice(0, 10);

/** Lowest price for any car that has one, for "From THB …". */
export const fromPrice = (p: PackageView) => { const v = Object.values(p.prices).filter((n) => n > 0); return v.length ? Math.min(...v) : null; };

export async function listPackages(opts: { city?: string; publishedOnly?: boolean } = {}) {
  const rows = await getDb().select().from(tripPackages).where(and(...(opts.city ? [eq(tripPackages.city, opts.city)] : []), ...(opts.publishedOnly ? [eq(tripPackages.published, true)] : [])))
    .orderBy(asc(tripPackages.city), asc(tripPackages.sortOrder), asc(tripPackages.name));
  return rows.map(packageView);
}

export async function packageBySlug(slug: string, publishedOnly = true) {
  const [row] = await getDb().select().from(tripPackages).where(and(eq(tripPackages.slug, slug), ...(publishedOnly ? [eq(tripPackages.published, true)] : []))).limit(1);
  return row ? packageView(row) : null;
}

export async function savePackage(input: PackageInput) {
  const now = new Date().toISOString();
  const values = { slug: input.slug, city: input.city, templateId: input.templateId, name: input.name, kind: input.kind, summary: input.summary,
    highlightsJson: JSON.stringify(input.highlights), includedJson: JSON.stringify(input.included), excludedJson: JSON.stringify(input.excluded),
    startTimesJson: JSON.stringify([...new Set(input.startTimes)].sort()), coverImage: input.coverImage, pricesJson: JSON.stringify(input.prices),
    minNoticeHours: input.minNoticeHours, published: input.published, sortOrder: input.sortOrder, updatedAt: now };
  if (input.id) { await getDb().update(tripPackages).set(values).where(eq(tripPackages.id, input.id)); return input.id; }
  const id = crypto.randomUUID();
  await getDb().insert(tripPackages).values({ ...values, id, createdAt: now });
  return id;
}

/** The template behind a package plus customer-facing stop details (pitch, photo, length). */
export async function packageStops(p: PackageView) {
  const [tpl] = await getDb().select().from(smartTrips).where(eq(smartTrips.id, p.templateId)).limit(1);
  if (!tpl) return { template: null, stops: [] };
  const input = inputFromRow(tpl);
  const views = await attractionsById(input.stops.map((s) => s.attractionId).filter((x): x is string => Boolean(x)));
  return {
    template: tpl,
    stops: input.stops.filter((s) => !s.skipped).map((s) => {
      const a = s.attractionId ? views[s.attractionId] : undefined;
      return { id: s.id, kind: s.kind, name: a ? (a.customerName || a.name) : s.name, durationMin: s.durationMin, sessionTime: s.sessionTime ?? null,
        pitch: a?.shortLine ?? null, cover: a?.coverImage ?? null, type: a?.category ?? s.kind, mealSlots: a?.mealSlots ?? [], published: a?.published ?? true };
    }),
  };
}

export const bookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  startTime: time,
  pickupText: z.string().trim().min(2, "Enter your hotel or pickup address.").max(300),
  pickupLat: z.number().nullable().default(null), pickupLng: z.number().nullable().default(null),
  adults: z.number().int().min(1).max(20), children: z.number().int().min(0).max(10),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]),
});
export type PackageBooking = z.infer<typeof bookingSchema>;

/** Builds the trip for a customer's date, hotel and group, and checks it (opening days, sessions, hours). */
export async function quotePackage(p: PackageView, b: PackageBooking) {
  const [tpl] = await getDb().select().from(smartTrips).where(eq(smartTrips.id, p.templateId)).limit(1);
  if (!tpl) throw new Error("NO_TEMPLATE");
  const price = p.prices[b.vehicle];
  const errors: string[] = [];
  if (!p.startTimes.includes(b.startTime)) errors.push("Choose one of the listed start times.");
  if (!price) errors.push("This car isn't available for this trip. Choose another.");
  const vehicle = VEHICLES[b.vehicle as VehicleId];
  if (vehicle && b.adults + b.children > vehicle.passengers) errors.push(`${vehicle.name} seats ${vehicle.passengers}. Choose a bigger car.`);
  const start = new Date(`${b.date}T${b.startTime}:00+07:00`).getTime();
  if (start < Date.now() + p.minNoticeHours * 3600_000) errors.push(`Please book at least ${p.minNoticeHours} hours ahead.`);
  const base = inputFromRow(tpl);
  const draft: TripInput = { ...base, id: undefined, isTemplate: false, templateName: null, title: p.name, tripDate: b.date, startTime: b.startTime,
    pickupText: b.pickupText, pickupLat: b.pickupLat, pickupLng: b.pickupLng, endText: null, endLat: null, endLng: null,
    adults: b.adults, children: b.children, vehicle: b.vehicle, transportPrice: price ?? 0, discount: 0 };
  // Fixed-session stops stay put; the rest re-order for this hotel and day.
  if (draft.pickupLat != null) draft.stops = (await arrange(draft)) as TripInput["stops"];
  const planned = await planFor(draft);
  const closures = planned.plan.problems.filter((x) => x.level === "error").map((x) => x.message);
  return { ok: errors.length === 0 && closures.length === 0, errors: [...errors, ...closures], draft, total: planned.total, fees: planned.fees, returnAt: planned.plan.returnAt == null ? null : fmt(planned.plan.returnAt),
    timeline: planned.plan.stops.map((s) => ({ name: s.name, start: fmt(s.start), end: fmt(s.end) })) };
}

/** Creates the customer's trip (frozen at today's details) and starts payment. */
export async function bookPackage(p: PackageView, b: PackageBooking, contact: { name: string; email: string; phone: string; language: "en" | "th" | "zh" }, origin: string) {
  const q = await quotePackage(p, b);
  if (!q.ok) return { ok: false as const, errors: q.errors };
  const saved = await saveTrip({ ...q.draft, customerName: contact.name, customerEmail: contact.email, customerPhone: contact.phone, language: contact.language,
    notes: null, title: p.name }, { name: "Website" });
  const now = new Date().toISOString();
  await getDb().update(smartTrips).set({ packageId: p.id, status: "sent", sentAt: now }).where(eq(smartTrips.id, saved.id));
  const [trip] = await getDb().select().from(smartTrips).where(eq(smartTrips.id, saved.id)).limit(1);
  const { snapshot } = await snapshotTrip(trip, "Website", `Booked from package ${p.slug}`);
  const [fresh] = await getDb().select().from(smartTrips).where(eq(smartTrips.id, saved.id)).limit(1);
  const result = await startTripCheckout([{ trip: fresh, snap: snapshot }], contact, origin);
  // The itinerary link arrives by email too, so the customer can see their day before and after paying.
  await notifyTripSent({ ...fresh, total: snapshot.total }, `${origin}/itinerary/${fresh.token}`, null).catch(() => undefined);
  if (result.alreadyPaid) return { ok: false as const, errors: ["This trip is already paid."] };
  return { ok: true as const, checkoutUrl: result.checkoutUrl, itinerary: `${origin}/itinerary/${fresh.token}` };
}
