import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { agencyApplications, smartTrips, suppliers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { agencyForCustomer } from "@/lib/agency";
import { listAttractions } from "@/lib/attractions";
import { customerFromRequest } from "@/lib/customer-auth";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";
import { addDay, arrange, duplicateTrip, groupDays, removeDay, getTrip, inputFromRow, listTrips, planFor, saveTrip, snapshotTrip, tripSchema, tripVersions, type TripRow } from "@/lib/smart-trips";
import { notifyAgencyPriced, notifyTripSent } from "@/lib/trip-notify";
import { z } from "zod";
import { VEHICLES } from "@/lib/vehicles";

const quoteSchema = z.object({
  tripDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  pickupText: z.string().trim().min(2).max(300), pickupLat: z.number().nullable(), pickupLng: z.number().nullable(),
  adults: z.number().int().min(1).max(30), children: z.number().int().min(0).max(20),
  vehicle: z.enum(Object.keys(VEHICLES) as [string, ...string[]]).optional(),
  customerName: z.string().trim().max(100).nullable(), customerEmail: z.string().trim().toLowerCase().email().max(254).nullable().or(z.literal("").transform(() => null)),
  customerPhone: z.string().trim().max(40).nullable(),
});

/** Who is planning: Waydidi staff, or an approved travel agency (limited to its own trips). */
export type TripActor = { kind: "admin"; name: string } | { kind: "agency"; name: string; agencyId: string; agencyName: string };
export const AGENCY_COMMISSION_PERCENT = 10;

export async function adminActor(): Promise<TripActor | null> {
  const admin = await getWaydidiAdmin();
  return admin ? { kind: "admin", name: admin.displayName || admin.email } : null;
}
export async function agencyActor(request: Request): Promise<TripActor | null> {
  const session = await customerFromRequest(request);
  const agency = await agencyForCustomer(session?.customer ?? null);
  return agency ? { kind: "agency", name: agency.contactName, agencyId: agency.id, agencyName: agency.agencyName } : null;
}
const agencyIdOf = (a: TripActor) => (a.kind === "agency" ? a.agencyId : null);
const noStore = { "Cache-Control": "no-store" };
const blocked = () => NextResponse.json({ error: "Request blocked" }, { status: 403 });
const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** What an agency may see: no internal notes, supplier contacts or other agencies' data. */
export function publicRow(t: TripRow, actor: TripActor) {
  const { token, ...rest } = t;
  return actor.kind === "admin" ? t : { ...rest, token, createdBy: undefined };
}

export async function handleList(request: Request, actor: TripActor | null) {
  if (!actor) return unauthorized();
  const templates = new URL(request.url).searchParams.get("view") === "templates";
  const rows = await listTrips({ templates, agencyId: agencyIdOf(actor) });
  // Agencies may also start from Waydidi's own templates.
  const shared = templates && actor.kind === "agency" ? (await listTrips({ templates: true })).filter((t) => !t.agencyId) : [];
  const agencyNames = actor.kind === "admin" ? Object.fromEntries((await getDb().select({ id: agencyApplications.id, name: agencyApplications.agencyName }).from(agencyApplications)).map((a) => [a.id, a.name])) : {};
  return NextResponse.json({ trips: [...rows, ...shared].map((t) => ({ ...publicRow(t, actor), stopCount: (JSON.parse(t.stopsJson) as unknown[]).length, agencyName: t.agencyId ? agencyNames[t.agencyId] ?? null : null, shared: shared.includes(t) })) }, { headers: noStore });
}

export async function handleSave(request: Request, actor: TripActor | null) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return blocked();
  if (!actor) return unauthorized();
  const parsed = tripSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) { const i = parsed.error.issues[0]; return NextResponse.json({ error: `${i?.path?.join(" ") || "Trip"}: ${i?.message ?? "check the trip."}` }, { status: 400 }); }
  const input = parsed.data;
  if (actor.kind === "agency") {
    // Agencies use Waydidi's price; only staff can change it or give a discount.
    const existing = input.id ? await getTrip(input.id, actor.agencyId) : null;
    const suggested = (await planFor(input)).suggestedTransport?.total ?? 0;
    input.transportPrice = existing && existing.transportPrice > 0 && existing.status !== "draft" ? existing.transportPrice : Math.max(existing?.transportPrice ?? 0, suggested);
    input.discount = existing?.discount ?? 0;
  }
  try {
    const before = actor.kind === "admin" && input.id ? await getTrip(input.id) : null;
    const saved = await saveTrip(input, { name: actor.name, agencyId: agencyIdOf(actor), commissionPercent: actor.kind === "agency" ? AGENCY_COMMISSION_PERCENT : 0 });
    // Staff priced a trip an agency was waiting on: back to draft, and tell the agency.
    if (before?.status === "pricing" && before.agencyId && input.transportPrice > 0) {
      await getDb().update(smartTrips).set({ status: "draft", updatedAt: new Date().toISOString() }).where(eq(smartTrips.id, before.id));
      const [agency] = await getDb().select().from(agencyApplications).where(eq(agencyApplications.id, before.agencyId)).limit(1);
      if (agency) await notifyAgencyPriced(agency.email, agency.contactName, { ...before, transportPrice: input.transportPrice }, safeOrigin(request)).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "LOCKED") return NextResponse.json({ error: "This trip is paid. Duplicate it to make changes." }, { status: 409 });
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    throw error;
  }
}

/** Plans a draft without saving: times, problems, alternatives, price and packing list. Optionally auto-arranges first. */
export async function handlePlan(request: Request, actor: TripActor | null) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return blocked();
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = tripSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the trip." }, { status: 400 });
  const input = parsed.data;
  if (body?.arrange === true) input.stops = (await arrange(input)) as typeof input.stops;
  const p = await planFor(input);
  return NextResponse.json({
    stops: input.stops, plan: p.plan, source: p.source, alternatives: p.alternatives, fees: p.fees, total: p.total,
    suggestedTransport: p.suggestedTransport, packing: p.packing,
  }, { headers: noStore });
}

export async function handleGet(id: string, actor: TripActor | null) {
  if (!actor) return unauthorized();
  const trip = await getTrip(id, agencyIdOf(actor));
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  const versions = await tripVersions(trip.id);
  const group = (await groupDays(trip)).map((d) => ({ id: d.id, dayNumber: d.dayNumber, tripDate: d.tripDate, total: d.total, status: d.status, stops: (JSON.parse(d.stopsJson) as unknown[]).length }));
  let supplierContacts: Record<string, typeof suppliers.$inferSelect> = {};
  if (actor.kind === "admin") {
    const ids = [...new Set((await listAttractions({ includeHidden: true })).filter((a) => a.supplierId && inputFromRow(trip).stops.some((s) => s.attractionId === a.id)).map((a) => [a.id, a.supplierId!] as const))];
    const rows = ids.length ? await getDb().select().from(suppliers).where(inArray(suppliers.id, ids.map(([, s]) => s))) : [];
    supplierContacts = Object.fromEntries(ids.map(([aid, sid]) => [aid, rows.find((r) => r.id === sid)!]).filter(([, r]) => r));
  }
  return NextResponse.json({ trip: publicRow(trip, actor), input: inputFromRow(trip), versions, supplierContacts, group }, { headers: noStore });
}

export async function handleAction(request: Request, id: string, actor: TripActor | null) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return blocked();
  if (!actor) return unauthorized();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { action, note, notify } = body as { action?: string; note?: string; notify?: boolean };
  let trip = await getTrip(id, agencyIdOf(actor));
  // Agencies may quote from (or copy) Waydidi's own templates.
  if (!trip && actor.kind === "agency" && (action === "quote" || action === "duplicate")) {
    const shared = await getTrip(id);
    if (shared?.isTemplate && !shared.agencyId) trip = shared;
  }
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  const by = { name: actor.name, agencyId: agencyIdOf(actor), commissionPercent: actor.kind === "agency" ? AGENCY_COMMISSION_PERCENT : 0 };
  const now = new Date().toISOString();
  const origin = safeOrigin(request);
  switch (action) {
    case "send": {
      if (trip.isTemplate) return NextResponse.json({ error: "Templates can't be sent. Use the template to make a trip first." }, { status: 400 });
      if (trip.status === "accepted" || trip.status === "cancelled") return NextResponse.json({ error: "This trip can no longer be sent." }, { status: 409 });
      // A multi-day trip is always sent as a whole: every day frozen, one link (the first day's).
      const days = await groupDays(trip);
      for (const d of days) {
        const label = days.length > 1 ? `Day ${d.dayNumber}: ` : "";
        if (!d.tripDate) return NextResponse.json({ error: `${label}set the trip date first.` }, { status: 400 });
        if (d.total <= 0 && d.transportPrice <= 0) return NextResponse.json({ error: `${label}${actor.kind === "agency" ? "this trip needs a price from Waydidi first. Use “Ask Waydidi for a price”." : "set the transport price first."}` }, { status: 400 });
      }
      let total = 0, version = 0;
      const warnings: string[] = [];
      for (const d of days) {
        const { snapshot, problems } = await snapshotTrip(d, actor.name, note?.slice(0, 200) || (d.version ? "Updated itinerary" : "First itinerary"));
        total += snapshot.total; version = Math.max(version, snapshot.version);
        warnings.push(...problems.filter((p) => p.level === "error").map((e) => (days.length > 1 ? `Day ${d.dayNumber}: ${e.message}` : e.message)));
        await getDb().update(smartTrips).set({ status: "sent", sentAt: now, changeRequest: null, updatedAt: now }).where(eq(smartTrips.id, d.id));
      }
      const lead = days[0];
      const link = `${origin}/itinerary/${lead.token}`;
      const delivery = notify && lead.customerEmail ? await notifyTripSent({ ...lead, total, holdDays: lead.holdDays }, link, actor.kind === "agency" ? actor.agencyName : null, days.length).catch(() => "failed") : "not_sent";
      return NextResponse.json({ ok: true, link, version, warnings, delivery });
    }
    case "ask_price": {
      if (actor.kind !== "agency") return NextResponse.json({ error: "Only agencies ask for a price." }, { status: 400 });
      await getDb().update(smartTrips).set({ status: "pricing", updatedAt: now }).where(eq(smartTrips.id, trip.id));
      await notifyPricingRequest(trip, actor.agencyName, origin).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }
    case "duplicate": return NextResponse.json({ ok: true, ...(await duplicateTrip(trip, by)) });
    case "live_adjust": {
      if (actor.kind !== "admin") return NextResponse.json({ error: "Only Waydidi staff change a trip on the day." }, { status: 403 });
      const change = body.change as { kind?: string; stopId?: string; minutes?: number } | undefined;
      if (!change?.stopId || !["skip", "shorten", "restore"].includes(change.kind ?? "")) return NextResponse.json({ error: "Choose a change." }, { status: 400 });
      const { adjustLive } = await import("@/lib/trip-live-data");
      return NextResponse.json({ ok: true, note: await adjustLive(trip, change as { kind: "skip" | "shorten" | "restore"; stopId: string; minutes?: number }, actor.name) });
    }
    case "quote": {
      // Quick quote: a copy of a template for one customer, ready to send.
      if (!trip.isTemplate) return NextResponse.json({ error: "Quick quotes start from a template." }, { status: 400 });
      const q = quoteSchema.safeParse(body);
      if (!q.success) return NextResponse.json({ error: q.error.issues[0]?.message ?? "Check the quote details." }, { status: 400 });
      const base = inputFromRow(trip);
      const draft = { ...base, ...q.data, id: undefined, isTemplate: false, templateName: null, title: `${trip.templateName || trip.title}${q.data.customerName ? ` · ${q.data.customerName}` : ""}`,
        vehicle: q.data.vehicle ?? base.vehicle };
      // New hotel and start time: re-order the stops around the fixed sessions for this day.
      draft.stops = (await arrange(draft)) as typeof draft.stops;
      const saved = await saveTrip(draft, by);
      return NextResponse.json({ ok: true, ...saved });
    }
    case "template": return NextResponse.json({ ok: true, ...(await duplicateTrip(trip, by, true)) });
    case "cancel": {
      if (trip.status === "accepted") return NextResponse.json({ error: "This trip is paid. Cancel its booking from Bookings instead." }, { status: 409 });
      for (const d of await groupDays(trip)) await getDb().update(smartTrips).set({ status: "cancelled", updatedAt: now }).where(eq(smartTrips.id, d.id));
      return NextResponse.json({ ok: true });
    }
    case "add_day": {
      if (trip.isTemplate) return NextResponse.json({ error: "Templates are single days." }, { status: 400 });
      const days = await groupDays(trip);
      if (days.some((d) => d.status === "accepted")) return NextResponse.json({ error: "This trip is paid. Plan the extra day as a new trip." }, { status: 409 });
      if (days.length >= 14) return NextResponse.json({ error: "A trip can have up to 14 days." }, { status: 400 });
      return NextResponse.json({ ok: true, ...(await addDay(trip, by)) });
    }
    case "remove_day": {
      try { await removeDay(trip); return NextResponse.json({ ok: true, leadId: trip.groupId }); }
      catch (e) { return NextResponse.json({ error: (e as Error).message === "LOCKED" ? "This trip is paid." : "The first day can't be removed; cancel the trip instead." }, { status: 409 }); }
    }
    case "reopen": {
      if (trip.status !== "cancelled" && trip.status !== "changes_requested") return NextResponse.json({ error: "Nothing to reopen." }, { status: 400 });
      await getDb().update(smartTrips).set({ status: "draft", updatedAt: now }).where(eq(smartTrips.id, trip.id));
      return NextResponse.json({ ok: true });
    }
    case "delete": {
      if (!trip.isTemplate) return NextResponse.json({ error: "Only templates can be deleted; cancel trips instead." }, { status: 400 });
      await getDb().delete(smartTrips).where(eq(smartTrips.id, trip.id));
      return NextResponse.json({ ok: true });
    }
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}

async function notifyPricingRequest(trip: TripRow, agencyName: string, origin: string) {
  const { pushLine } = await import("@/lib/line");
  await pushLine([{ type: "text", text: `${agencyName} asks for a price for trip ${trip.ref} (${trip.title}${trip.tripDate ? `, ${trip.tripDate}` : ""}).\n${origin}/admin/trips/${trip.id}` }]);
}
