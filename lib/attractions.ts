import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { attractions, suppliers } from "@/db/schema";
import type { AttractionData, Program, ScheduleException } from "@/lib/trip-plan";

export type AttractionRow = typeof attractions.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;

const json = <T,>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
import { BEST_TIMES, MEAL_SLOTS, VIBES } from "@/lib/place-taxonomy";
export { BEST_TIMES, MEAL_SLOTS, PLACE_TYPES, VIBES, type PlaceI18n } from "@/lib/place-taxonomy";
import type { PlaceI18n } from "@/lib/place-taxonomy";
const time = z.string().regex(/^\d{2}:\d{2}$/);
const optTime = time.nullable().or(z.literal("").transform(() => null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullable().optional().transform((v) => v || null);
const list = (max: number, len = 200) => z.array(text(len)).max(max).default([]);

export const programSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: text(100).min(1),
  durationMin: z.number().int().min(5).max(720),
  bookingRequired: z.boolean().default(false),
  arrivalBufferMin: z.number().int().min(0).max(180).default(0),
  feeAdult: z.number().int().min(0).max(100_000).default(0),
  feeChild: z.number().int().min(0).max(100_000).default(0),
  feeIncluded: z.boolean().default(false),
  sessions: z.array(z.object({ time, days: z.array(z.number().int().min(0).max(6)).max(7).optional() })).max(40).default([]),
});
export const exceptionSchema = z.object({
  from: day, to: day, closed: z.boolean().optional(), programId: z.string().max(40).optional().transform((v) => v || undefined),
  sessions: z.array(time).max(40).optional(), note: text(200).optional(),
}).refine((e) => e.to >= e.from, { message: "An exception ends before it starts." });

export const attractionSchema = z.object({
  id: z.string().max(60).optional(),
  name: text(120).min(2),
  customerName: optText(120),
  area: text(60).default(""),
  address: optText(300),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  googlePlaceId: optText(200),
  category: text(40).default("sight"),
  tags: list(20, 30),
  openTime: optTime.default(null), closeTime: optTime.default(null), lastEntry: optTime.default(null),
  closedDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  durationMin: z.number().int().min(5).max(720),
  arrivalBufferMin: z.number().int().min(0).max(180).default(0),
  bookingRequired: z.boolean().default(false),
  weatherSensitive: z.boolean().default(false),
  dressCode: optText(200),
  description: optText(1500),
  highlights: list(10),
  bring: list(10),
  coverImage: optText(500),
  gallery: list(12, 500),
  imageCredit: optText(200),
  website: optText(300),
  phone: optText(40),
  internalNotes: optText(1500),
  supplierId: optText(60),
  programs: z.array(programSchema).max(20).default([]),
  exceptions: z.array(exceptionSchema).max(60).default([]),
  status: z.enum(["active", "hidden"]).default("active"),
  mealSlots: z.array(z.enum(MEAL_SLOTS)).max(6).default([]),
  priceLevel: z.number().int().min(1).max(4).nullable().default(null),
  avgSpend: z.number().int().min(0).max(100_000).nullable().default(null),
  neighbourhood: optText(60),
  bestTime: z.enum(BEST_TIMES).nullable().optional().transform((v) => v ?? null),
  vibes: z.array(z.enum(VIBES)).max(12).default([]),
  dropoffNote: optText(300),
  reservationNote: optText(300),
  shortLine: optText(160),
  published: z.boolean().default(false),
  i18n: z.record(z.enum(["th", "zh"]), z.object({ name: text(120).optional(), shortLine: text(160).optional(), description: text(1500).optional() })).default({}),
});
export type AttractionInput = z.infer<typeof attractionSchema>;

export const supplierSchema = z.object({
  id: z.string().max(60).optional(),
  name: text(120).min(2),
  kind: z.enum(["attraction", "restaurant", "boat", "guide", "hotel", "other"]).default("attraction"),
  contactName: optText(100), phone: optText(40), lineId: optText(60), whatsapp: optText(40),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional().or(z.literal("").transform(() => null)),
  notes: optText(1000),
});

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "place";

/** The database row as the editor and the planner use it. */
export function attractionView(row: AttractionRow) {
  return {
    ...row,
    tags: json<string[]>(row.tagsJson, []), closedDays: json<number[]>(row.closedDaysJson, []),
    highlights: json<string[]>(row.highlightsJson, []), bring: json<string[]>(row.bringJson, []), gallery: json<string[]>(row.galleryJson, []),
    programs: json<Program[]>(row.programsJson, []), exceptions: json<ScheduleException[]>(row.exceptionsJson, []),
    mealSlots: json<string[]>(row.mealSlotsJson, []), vibes: json<string[]>(row.vibesJson, []), i18n: json<PlaceI18n>(row.i18nJson, {}),
  };
}
export type AttractionView = ReturnType<typeof attractionView>;

/** Only what the planning engine needs. */
export function planningData(a: AttractionView): AttractionData {
  return {
    id: a.id, name: a.customerName || a.name, latitude: a.latitude, longitude: a.longitude,
    openTime: a.openTime, closeTime: a.closeTime, lastEntry: a.lastEntry, closedDays: a.closedDays,
    durationMin: a.durationMin, arrivalBufferMin: a.arrivalBufferMin, programs: a.programs, exceptions: a.exceptions,
    tags: a.tags, bring: a.bring, dressCode: a.dressCode,
  };
}

export async function listAttractions(opts: { includeHidden?: boolean } = {}) {
  const rows = await getDb().select().from(attractions).orderBy(asc(attractions.area), asc(attractions.name));
  return rows.filter((r) => opts.includeHidden || r.status === "active").map(attractionView);
}

export async function attractionsById(ids: string[]) {
  if (!ids.length) return {};
  const rows = await getDb().select().from(attractions).where(inArray(attractions.id, [...new Set(ids)]));
  return Object.fromEntries(rows.map((r) => { const v = attractionView(r); return [v.id, v]; })) as Record<string, AttractionView>;
}

export async function saveAttraction(input: AttractionInput) {
  const now = new Date().toISOString();
  const values = {
    name: input.name, customerName: input.customerName, area: input.area, address: input.address,
    latitude: input.latitude, longitude: input.longitude, googlePlaceId: input.googlePlaceId, category: input.category,
    tagsJson: JSON.stringify(input.tags), openTime: input.openTime, closeTime: input.closeTime, lastEntry: input.lastEntry,
    closedDaysJson: JSON.stringify(input.closedDays), durationMin: input.durationMin, arrivalBufferMin: input.arrivalBufferMin,
    bookingRequired: input.bookingRequired, weatherSensitive: input.weatherSensitive, dressCode: input.dressCode, description: input.description,
    highlightsJson: JSON.stringify(input.highlights), bringJson: JSON.stringify(input.bring), coverImage: input.coverImage,
    galleryJson: JSON.stringify(input.gallery), imageCredit: input.imageCredit, website: input.website, phone: input.phone,
    internalNotes: input.internalNotes, supplierId: input.supplierId, programsJson: JSON.stringify(input.programs),
    exceptionsJson: JSON.stringify(input.exceptions), status: input.status, updatedAt: now,
    mealSlotsJson: JSON.stringify(input.mealSlots), priceLevel: input.priceLevel, avgSpend: input.avgSpend, neighbourhood: input.neighbourhood,
    bestTime: input.bestTime, vibesJson: JSON.stringify(input.vibes), dropoffNote: input.dropoffNote, reservationNote: input.reservationNote,
    shortLine: input.shortLine, published: input.published, i18nJson: JSON.stringify(input.i18n),
  };
  if (input.id) {
    await getDb().update(attractions).set(values).where(eq(attractions.id, input.id));
    return input.id;
  }
  const id = `${slug(input.name)}-${crypto.randomUUID().slice(0, 6)}`;
  await getDb().insert(attractions).values({ ...values, id, createdAt: now });
  return id;
}

export async function markVerified(id: string, by: string) {
  await getDb().update(attractions).set({ verifiedAt: new Date().toISOString(), verifiedBy: by }).where(eq(attractions.id, id));
}

export async function listSuppliers() {
  return getDb().select().from(suppliers).orderBy(asc(suppliers.name));
}

export async function saveSupplier(input: z.infer<typeof supplierSchema>) {
  const now = new Date().toISOString();
  const values = { name: input.name, kind: input.kind, contactName: input.contactName, phone: input.phone, lineId: input.lineId, whatsapp: input.whatsapp, email: input.email ?? null, notes: input.notes, updatedAt: now };
  if (input.id) { await getDb().update(suppliers).set(values).where(eq(suppliers.id, input.id)); return input.id; }
  const id = `${slug(input.name)}-${crypto.randomUUID().slice(0, 6)}`;
  await getDb().insert(suppliers).values({ ...values, id, createdAt: now });
  return id;
}

/** Days since the attraction's details were last checked, or null if never. */
export const daysSinceVerified = (verifiedAt: string | null) => verifiedAt ? Math.floor((Date.now() - Date.parse(verifiedAt)) / 86_400_000) : null;
export const STALE_AFTER_DAYS = 180;

/** Adds starter places that aren't in the library yet (matched by their seed key). Never changes existing rows. */
export async function importStarterPlaces(city: "bangkok") {
  const { BANGKOK_PLACES, seedToInput } = await import("@/lib/seeds/bangkok-places");
  const list = city === "bangkok" ? BANGKOK_PLACES : [];
  const existing = new Set((await getDb().select({ key: attractions.seedKey }).from(attractions)).map((r) => r.key));
  let added = 0;
  for (const place of list) {
    if (existing.has(place.key)) continue;
    const id = await saveAttraction(attractionSchema.parse(seedToInput(place)));
    await getDb().update(attractions).set({ seedKey: place.key }).where(eq(attractions.id, id));
    added++;
  }
  return { added, skipped: list.length - added };
}
