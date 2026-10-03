import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { smartTrips, smartTripVersions } from "@/db/schema";
import { attractionsById, planningData, type AttractionView } from "@/lib/attractions";
import { areaHourlyPrices, HOURLY_MAX_HOURS, HOURLY_MIN_HOURS } from "@/lib/hourly-area-pricing";
import { cityOfText } from "@/lib/hourly-area-match";
import { alternatives, autoArrange, packingList, schedule, toMin, tripFees, type AttractionData, type Plan, type PlanInput, type Point, type TripStop } from "@/lib/trip-plan";
import { travelMatrix } from "@/lib/trip-travel";
import { VEHICLES } from "@/lib/vehicles";

export type TripRow = typeof smartTrips.$inferSelect;
export const TRIP_STATUSES = ["draft", "pricing", "sent", "changes_requested", "accepted", "cancelled"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

const time = z.string().regex(/^\d{2}:\d{2}$/);
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullable().optional().transform((v) => v || null);

export const stopSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(["attraction", "meal", "custom"]),
  name: text(120).min(1),
  attractionId: z.string().max(60).optional(),
  programId: z.string().max(40).optional(),
  sessionTime: time.optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  durationMin: z.number().int().min(0).max(720),
  priority: z.enum(["fixed", "must", "nice"]),
  locked: z.boolean().optional(),
  windowStart: time.optional(), windowEnd: time.optional(),
  note: text(300).optional(),
  skipped: z.boolean().optional(),
});

export const tripSchema = z.object({
  id: z.string().max(60).optional(),
  title: text(120).min(2),
  area: text(60).default(""),
  tripDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("").transform(() => null)),
  startTime: time.default("08:00"),
  pickupText: text(300).default(""),
  pickupLat: z.number().nullable().default(null), pickupLng: z.number().nullable().default(null),
  endText: optText(300), endLat: z.number().nullable().default(null), endLng: z.number().nullable().default(null),
  durationHours: z.number().int().min(1).max(16),
  adults: z.number().int().min(1).max(30), children: z.number().int().min(0).max(20), bags: z.number().int().min(0).max(30),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]),
  language: z.enum(["en", "th", "zh"]).default("en"),
  customerName: optText(100), customerEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
  customerPhone: optText(40), notes: optText(1500),
  stops: z.array(stopSchema).max(30),
  transportPrice: z.number().int().min(0).max(1_000_000),
  discount: z.number().int().min(0).max(1_000_000).default(0),
  isTemplate: z.boolean().default(false),
  templateName: optText(120),
});
export type TripInput = z.infer<typeof tripSchema>;

const json = <T,>(v: string | null | undefined, fallback: T): T => { try { return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } };
export const tripStops = (t: Pick<TripRow, "stopsJson">) => json<TripStop[]>(t.stopsJson, []);

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function tripToken() { return Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => ALPHABET[b % ALPHABET.length]).join(""); }

async function newRef() {
  for (let i = 0; i < 6; i++) {
    const ref = `TP-${1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)}${String.fromCharCode(65 + (crypto.getRandomValues(new Uint8Array(1))[0] % 26))}`;
    const [hit] = await getDb().select({ id: smartTrips.id }).from(smartTrips).where(eq(smartTrips.ref, ref)).limit(1);
    if (!hit) return ref;
  }
  return `TP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Everything the planner needs about a trip, with road times. */
export async function planFor(input: Pick<TripInput, "tripDate" | "startTime" | "pickupLat" | "pickupLng" | "endLat" | "endLng" | "durationHours" | "stops" | "adults" | "children" | "vehicle" | "pickupText" | "transportPrice" | "discount">) {
  const views = await attractionsById(input.stops.map((s) => s.attractionId).filter((x): x is string => Boolean(x)));
  const data: Record<string, AttractionData> = Object.fromEntries(Object.values(views).map((v) => [v.id, planningData(v)]));
  const from: Point | null = input.pickupLat != null && input.pickupLng != null ? { lat: input.pickupLat, lng: input.pickupLng } : null;
  const end: Point | null = input.endLat != null && input.endLng != null ? { lat: input.endLat, lng: input.endLng } : from;
  const points = [from, end, ...input.stops.map((s) => (s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : null))].filter((p): p is Point => Boolean(p));
  const departure = input.tripDate ? new Date(`${input.tripDate}T${input.startTime}:00+07:00`) : null;
  const { travel, source } = await travelMatrix(points, departure);
  const startMin = toMin(input.startTime);
  const planInput: PlanInput = { date: input.tripDate ?? null, startMin, from, end, endLimit: startMin + input.durationHours * 60, attractions: data, travel };
  const plan = schedule(input.stops as TripStop[], planInput);
  const fees = tripFees(input.stops as TripStop[], data, input.adults, input.children);
  const suggested = await suggestedTransport(input.pickupText, input.durationHours, input.vehicle);
  const capacity = VEHICLES[input.vehicle as keyof typeof VEHICLES];
  if (capacity && input.adults + input.children > capacity.passengers)
    plan.problems.unshift({ level: "error", message: `${capacity.name} seats ${capacity.passengers}; this group is ${input.adults + input.children}. Choose a bigger vehicle.` });
  return {
    plan, planInput, source, views, data,
    alternatives: plan.overBy > 0 ? alternatives(input.stops as TripStop[], planInput).map(({ label, returnAt, fits, stops, extendHours }) => ({ label, returnAt, fits, stops, extendHours })) : [],
    fees, suggestedTransport: suggested,
    total: Math.max(0, input.transportPrice + fees.included - input.discount),
    packing: packingList(input.stops as TripStop[], data, fees.onSite),
  };
}

export async function arrange(input: Parameters<typeof planFor>[0]) {
  const { planInput } = await planFor(input);
  return autoArrange(input.stops as TripStop[], planInput);
}

/** Driver price for the day from the By the hour city rates (3–10 hours), when the pickup is in a priced city. */
export async function suggestedTransport(pickup: string, hours: number, vehicle: string) {
  const slug = cityOfText(pickup);
  if (!slug) return null;
  const prices = await areaHourlyPrices(slug, Math.min(HOURLY_MAX_HOURS, Math.max(HOURLY_MIN_HOURS, hours))).catch(() => null);
  const base = prices?.[vehicle as keyof typeof prices] as { total: number; extraHourRate: number } | undefined;
  if (!base) return null;
  const extra = Math.max(0, hours - HOURLY_MAX_HOURS) * base.extraHourRate;
  return { total: base.total + extra, city: slug };
}

export async function saveTrip(input: TripInput, by: { name: string; agencyId?: string | null; commissionPercent?: number }) {
  const now = new Date().toISOString();
  const planned = await planFor(input);
  const values = {
    title: input.title, area: input.area, tripDate: input.tripDate ?? null, startTime: input.startTime,
    pickupText: input.pickupText, pickupLat: input.pickupLat, pickupLng: input.pickupLng,
    endText: input.endText, endLat: input.endLat, endLng: input.endLng, durationHours: input.durationHours,
    adults: input.adults, children: input.children, bags: input.bags, vehicle: input.vehicle, language: input.language,
    customerName: input.customerName, customerEmail: input.customerEmail ?? null, customerPhone: input.customerPhone, notes: input.notes,
    stopsJson: JSON.stringify(input.stops), transportPrice: input.transportPrice, feesTotal: planned.fees.included,
    discount: input.discount, total: planned.total, isTemplate: input.isTemplate, templateName: input.templateName, updatedAt: now,
  };
  if (input.id) {
    const scope = by.agencyId ? and(eq(smartTrips.id, input.id), eq(smartTrips.agencyId, by.agencyId)) : eq(smartTrips.id, input.id);
    const [existing] = await getDb().select().from(smartTrips).where(scope).limit(1);
    if (!existing) throw new Error("NOT_FOUND");
    if (existing.status === "accepted") throw new Error("LOCKED");
    await getDb().update(smartTrips).set(values).where(eq(smartTrips.id, input.id));
    return { id: input.id, ref: existing.ref };
  }
  const id = crypto.randomUUID(), ref = await newRef();
  await getDb().insert(smartTrips).values({ ...values, id, ref, token: tripToken(), status: "draft", createdBy: by.name,
    agencyId: by.agencyId ?? null, commissionPercent: by.commissionPercent ?? 0, createdAt: now });
  return { id, ref };
}

export async function getTrip(id: string, agencyId?: string | null) {
  const where = agencyId ? and(eq(smartTrips.id, id), eq(smartTrips.agencyId, agencyId)) : eq(smartTrips.id, id);
  const [row] = await getDb().select().from(smartTrips).where(where).limit(1);
  return row ?? null;
}

export async function listTrips(opts: { templates?: boolean; agencyId?: string | null } = {}) {
  const rows = await getDb().select().from(smartTrips).where(and(eq(smartTrips.isTemplate, Boolean(opts.templates)), ...(opts.agencyId ? [eq(smartTrips.agencyId, opts.agencyId)] : []))).orderBy(desc(smartTrips.updatedAt)).limit(500);
  return rows;
}

export function inputFromRow(t: TripRow): TripInput {
  return {
    id: t.id, title: t.title, area: t.area, tripDate: t.tripDate, startTime: t.startTime, pickupText: t.pickupText, pickupLat: t.pickupLat, pickupLng: t.pickupLng,
    endText: t.endText, endLat: t.endLat, endLng: t.endLng, durationHours: t.durationHours, adults: t.adults, children: t.children, bags: t.bags,
    vehicle: t.vehicle, language: t.language as TripInput["language"], customerName: t.customerName, customerEmail: t.customerEmail, customerPhone: t.customerPhone,
    notes: t.notes, stops: tripStops(t) as TripInput["stops"], transportPrice: t.transportPrice, discount: t.discount, isTemplate: t.isTemplate, templateName: t.templateName,
  };
}

// ---- Frozen copy for the customer ------------------------------------------------

export type SnapshotStop = {
  id: string; kind: TripStop["kind"]; name: string; arrival: number; start: number; end: number; travelMin: number;
  program: string | null; sessionTime: string | null; checkIn: number | null; lat: number | null; lng: number | null; note: string | null;
  description: string | null; highlights: string[]; cover: string | null; gallery: string[]; dressCode: string | null; openHours: string | null;
  fee: { adult: number; child: number; included: boolean } | null;
};
export type TripSnapshot = {
  version: number; createdAt: string; ref: string; title: string; tripDate: string | null; startTime: string; pickupText: string;
  pickup: Point | null; endText: string; end: Point | null; durationHours: number; adults: number; children: number; vehicle: string; vehicleName: string;
  customerName: string | null; language: string; notes: string | null; stops: SnapshotStop[]; returnAt: number; returnTravel: number; totalDrive: number;
  transportPrice: number; feesIncluded: number; feesOnSite: number; discount: number; total: number; packing: string[];
  /** Stops dropped on the day from the live view. */
  liveSkipped?: string[];
};

function snapshotStops(plan: Plan, views: Record<string, AttractionView>): SnapshotStop[] {
  return plan.stops.map((s) => {
    const a = s.attractionId ? views[s.attractionId] : undefined;
    const program = a?.programs.find((p) => p.id === s.programId);
    const buffer = program?.arrivalBufferMin ?? a?.arrivalBufferMin ?? 0;
    return {
      id: s.id, kind: s.kind, name: a ? (a.customerName || a.name) : s.name, arrival: s.arrival, start: s.start, end: s.end, travelMin: s.travelMin,
      program: program?.name ?? null, sessionTime: s.sessionTime ?? null, checkIn: s.sessionTime ? toMin(s.sessionTime) - buffer : null,
      lat: s.lat ?? null, lng: s.lng ?? null, note: s.note ?? null,
      description: a?.description ?? null, highlights: a?.highlights ?? [], cover: a?.coverImage ?? null, gallery: a?.gallery ?? [],
      dressCode: a?.dressCode ?? null, openHours: a?.openTime && a.closeTime ? `${a.openTime}–${a.closeTime}` : null,
      fee: program && (program.feeAdult || program.feeChild) ? { adult: program.feeAdult ?? 0, child: program.feeChild ?? 0, included: Boolean(program.feeIncluded) } : null,
    };
  });
}

/** Freezes the trip as the customer will see it, and records the version. */
export async function snapshotTrip(trip: TripRow, by: string, note: string) {
  const input = inputFromRow(trip);
  const planned = await planFor(input);
  const version = trip.version + 1;
  const vehicle = VEHICLES[trip.vehicle as keyof typeof VEHICLES];
  const snap: TripSnapshot = {
    version, createdAt: new Date().toISOString(), ref: trip.ref, title: trip.title, tripDate: trip.tripDate, startTime: trip.startTime,
    pickupText: trip.pickupText, pickup: trip.pickupLat != null && trip.pickupLng != null ? { lat: trip.pickupLat, lng: trip.pickupLng } : null,
    endText: trip.endText || trip.pickupText, end: trip.endLat != null && trip.endLng != null ? { lat: trip.endLat, lng: trip.endLng } : null,
    durationHours: trip.durationHours, adults: trip.adults, children: trip.children, vehicle: trip.vehicle, vehicleName: vehicle?.name ?? trip.vehicle,
    customerName: trip.customerName, language: trip.language, notes: trip.notes, stops: snapshotStops(planned.plan, planned.views),
    returnAt: planned.plan.returnAt, returnTravel: planned.plan.returnTravel, totalDrive: planned.plan.totalDrive,
    transportPrice: trip.transportPrice, feesIncluded: planned.fees.included, feesOnSite: planned.fees.onSite, discount: trip.discount,
    total: planned.total, packing: planned.packing,
  };
  const now = new Date().toISOString();
  await getDb().insert(smartTripVersions).values({ id: crypto.randomUUID(), tripId: trip.id, version, snapshotJson: JSON.stringify(snap), note, createdBy: by, createdAt: now });
  await getDb().update(smartTrips).set({ snapshotJson: JSON.stringify(snap), version, total: planned.total, feesTotal: planned.fees.included, updatedAt: now }).where(eq(smartTrips.id, trip.id));
  return { snapshot: snap, problems: planned.plan.problems };
}

export const tripSnapshot = (t: Pick<TripRow, "snapshotJson">) => json<TripSnapshot | null>(t.snapshotJson, null);

export async function tripVersions(tripId: string) {
  return getDb().select({ version: smartTripVersions.version, note: smartTripVersions.note, createdBy: smartTripVersions.createdBy, createdAt: smartTripVersions.createdAt })
    .from(smartTripVersions).where(eq(smartTripVersions.tripId, tripId)).orderBy(desc(smartTripVersions.version));
}

export async function tripByToken(token: string) {
  if (!/^[A-Z2-9]{20}$/.test(token)) return null;
  const [row] = await getDb().select().from(smartTrips).where(eq(smartTrips.token, token)).limit(1);
  return row ?? null;
}

/** A copy for another customer or date: new reference, new link, back to draft. */
export async function duplicateTrip(trip: TripRow, by: { name: string; agencyId?: string | null; commissionPercent?: number }, asTemplate = false) {
  const input = inputFromRow(trip);
  return saveTrip({ ...input, id: undefined, isTemplate: asTemplate, title: asTemplate ? (trip.templateName || trip.title) : `${trip.title} (copy)`, templateName: asTemplate ? (trip.templateName || trip.title) : null,
    ...(asTemplate ? { customerName: null, customerEmail: null, customerPhone: null, tripDate: null } : {}) }, by);
}

/** An agency's day trips: how many are out with guests, how many paid, and commission earned. */
export async function agencyTripStats(agencyId: string) {
  const rows = await getDb().select({ status: smartTrips.status, total: smartTrips.total, pct: smartTrips.commissionPercent, isTemplate: smartTrips.isTemplate }).from(smartTrips).where(eq(smartTrips.agencyId, agencyId));
  const trips = rows.filter((r) => !r.isTemplate);
  const paid = trips.filter((r) => r.status === "accepted");
  return {
    open: trips.filter((r) => ["draft", "pricing", "sent", "changes_requested"].includes(r.status)).length,
    paid: paid.length,
    commission: paid.reduce((sum, r) => sum + Math.round((r.total * r.pct) / 100), 0),
  };
}
