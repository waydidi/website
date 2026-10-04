import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingEvents, bookingPayments, bookings, bookingSources, smartTrips } from "@/db/schema";
import { uniqueBookingReference } from "@/lib/booking-reference-server";
import { toSatang } from "@/lib/money";
import { paymentProviderFor } from "@/lib/payments/provider";
import { secureToken, sha256 } from "@/lib/security";
import { groupDays, type TripRow, type TripSnapshot } from "@/lib/smart-trips";
import { notifyTripReply } from "@/lib/trip-notify";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

const POLICY_VERSION = "2026-09-07";

/**
 * The customer accepted their itinerary: one "Tour" booking for the whole trip (all
 * days of a multi-day trip) at the frozen price, then Stripe checkout. The payment
 * webhook confirms the booking and markTripPaid() closes every day.
 */
export async function startTripCheckout(days: { trip: TripRow; snap: TripSnapshot }[], contact: { name: string; email: string; phone: string }, origin: string) {
  const { trip, snap } = days[0];
  const last = days.at(-1)!.snap;
  // Re-use an unpaid booking from an earlier attempt rather than making another.
  if (trip.bookingReference) {
    const [existing] = await getDb().select().from(bookings).where(eq(bookings.reference, trip.bookingReference)).limit(1);
    if (existing?.status === "confirmed") return { alreadyPaid: true as const, reference: existing.reference };
    if (existing && existing.status === "pending_payment") await getDb().update(bookings).set({ status: "expired", updatedAt: new Date().toISOString() }).where(eq(bookings.reference, existing.reference));
  }
  const total = days.reduce((sum, d) => sum + d.snap.total, 0);
  const reference = await uniqueBookingReference();
  const accessToken = secureToken();
  const now = new Date().toISOString();
  const vehicle = VEHICLES[trip.vehicle as VehicleId];
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const summary = days.map(({ snap: d }) => `${days.length > 1 ? `${d.tripDate}: ` : ""}${d.stops.map((x) => `${hhmm(x.start)} ${x.name}`).join(" · ")}`).join(" | ");
  await getDb().insert(bookings).values({
    reference, customerName: contact.name, customerEmail: contact.email, customerPhone: contact.phone,
    pickup: snap.pickupText, dropoff: `${snap.title}${days.length > 1 ? `, ${days.length} days` : ""} (trip ${snap.ref})`, pickupDate: snap.tripDate!, pickupTime: snap.startTime,
    passengers: snap.adults + snap.children, luggage: trip.bags, childSeats: 0,
    specialRequests: `Smart trip ${snap.ref} v${snap.version}: ${summary}`.slice(0, 500),
    vehicle: vehicle?.name ?? trip.vehicle, paymentMethod: "card", total, status: "pending_payment", paymentStatus: "pending",
    termsAcceptedAt: now, policyVersion: POLICY_VERSION, accessTokenHash: await sha256(accessToken),
    createdAt: now, updatedAt: now, serviceType: "tour", bookedHours: days.reduce((h, d) => h + d.snap.durationHours, 0),
    scheduledEndAt: new Date(new Date(`${last.tripDate}T${last.startTime}:00+07:00`).getTime() + last.durationHours * 3600_000).toISOString(),
  });
  await getDb().insert(bookingPayments).values({
    id: `primary:${reference}`, bookingReference: reference, provider: "stripe", status: "pending", providerStatus: "pending",
    amountExpected: total, amountExpectedMinor: toSatang(total), amountPaidMinor: 0, reconciliationStatus: "pending", createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  await getDb().insert(bookingSources).values({ bookingReference: reference, source: trip.agencyId ? `agency:${trip.agencyId}` : "trip-planner", createdAt: now }).onConflictDoNothing().catch(() => undefined);
  for (const d of days) await getDb().update(smartTrips).set({ bookingReference: reference, customerName: contact.name, customerEmail: contact.email, customerPhone: contact.phone, updatedAt: now }).where(eq(smartTrips.id, d.trip.id));
  const session = await paymentProviderFor("stripe").createPayment({ reference, accessToken, customerEmail: contact.email, vehicle: (trip.vehicle as VehicleId) ?? "comfort_suv", origin, total, idempotencyKey: `trip:${trip.id}:${reference}` });
  if (!session.sessionId || !session.checkoutUrl) throw new Error("PROVIDER_SESSION_INVALID");
  await getDb().update(bookings).set({ checkoutSessionId: session.sessionId, updatedAt: now }).where(eq(bookings.reference, reference));
  await getDb().update(bookingPayments).set({ providerSessionId: session.sessionId, updatedAt: now }).where(eq(bookingPayments.id, `primary:${reference}`));
  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "checkout_created", providerEventId: `checkout:${session.sessionId}`, createdAt: now });
  return { alreadyPaid: false as const, checkoutUrl: session.checkoutUrl, reference };
}

/** Called when a booking is confirmed: closes the smart trip it came from, if any. */
export async function markTripPaid(reference: string, origin?: string) {
  let [trip] = await getDb().select().from(smartTrips).where(eq(smartTrips.bookingReference, reference)).limit(1);
  if (!trip) {
    // An older checkout attempt was paid after a newer one started: find the trip from the booking's "(trip TP-…)" label.
    const [booking] = await getDb().select({ dropoff: bookings.dropoff, serviceType: bookings.serviceType }).from(bookings).where(eq(bookings.reference, reference)).limit(1);
    const ref = booking?.serviceType === "tour" ? /\(trip (TP-[A-Z0-9-]+)\)$/.exec(booking.dropoff)?.[1] : undefined;
    if (ref) [trip] = await getDb().select().from(smartTrips).where(eq(smartTrips.ref, ref)).limit(1);
  }
  if (!trip || trip.status === "accepted") return;
  const now = new Date().toISOString();
  // Every day of a multi-day trip is paid by the one booking.
  for (const d of await groupDays(trip)) await getDb().update(smartTrips).set({ status: "accepted", acceptedAt: now, bookingReference: reference, changeRequest: null, updatedAt: now }).where(eq(smartTrips.id, d.id));
  if (origin) await notifyTripReply(trip, "accepted", "", origin);
}
