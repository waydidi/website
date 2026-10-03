import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingEvents, bookingPayments, bookings, bookingSources, smartTrips } from "@/db/schema";
import { uniqueBookingReference } from "@/lib/booking-reference-server";
import { toSatang } from "@/lib/money";
import { paymentProviderFor } from "@/lib/payments/provider";
import { secureToken, sha256 } from "@/lib/security";
import type { TripRow, TripSnapshot } from "@/lib/smart-trips";
import { notifyTripReply } from "@/lib/trip-notify";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

const POLICY_VERSION = "2026-09-07";

/**
 * The customer accepted their itinerary: one "Tour" booking for the day at the
 * frozen price, then Stripe checkout. The payment webhook confirms the booking
 * and markTripPaid() closes the trip.
 */
export async function startTripCheckout(trip: TripRow, snap: TripSnapshot, contact: { name: string; email: string; phone: string }, origin: string) {
  // Re-use an unpaid booking from an earlier attempt rather than making another.
  if (trip.bookingReference) {
    const [existing] = await getDb().select().from(bookings).where(eq(bookings.reference, trip.bookingReference)).limit(1);
    if (existing?.status === "confirmed") return { alreadyPaid: true as const, reference: existing.reference };
    if (existing && existing.status === "pending_payment" && existing.total === snap.total) await getDb().update(bookings).set({ status: "expired", updatedAt: new Date().toISOString() }).where(eq(bookings.reference, existing.reference));
  }
  const reference = await uniqueBookingReference();
  const accessToken = secureToken();
  const now = new Date().toISOString();
  const vehicle = VEHICLES[trip.vehicle as VehicleId];
  const stops = snap.stops.map((s) => `${String(Math.floor(s.start / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")} ${s.name}`).join(" · ");
  await getDb().insert(bookings).values({
    reference, customerName: contact.name, customerEmail: contact.email, customerPhone: contact.phone,
    pickup: snap.pickupText, dropoff: `${snap.title} (trip ${snap.ref})`, pickupDate: snap.tripDate!, pickupTime: snap.startTime,
    passengers: snap.adults + snap.children, luggage: trip.bags, childSeats: 0,
    specialRequests: `Smart trip ${snap.ref} v${snap.version}: ${stops}`.slice(0, 500),
    vehicle: vehicle?.name ?? trip.vehicle, paymentMethod: "card", total: snap.total, status: "pending_payment", paymentStatus: "pending",
    termsAcceptedAt: now, policyVersion: POLICY_VERSION, accessTokenHash: await sha256(accessToken),
    createdAt: now, updatedAt: now, serviceType: "tour", bookedHours: snap.durationHours,
    scheduledEndAt: new Date(new Date(`${snap.tripDate}T${snap.startTime}:00+07:00`).getTime() + snap.durationHours * 3600_000).toISOString(),
  });
  await getDb().insert(bookingPayments).values({
    id: `primary:${reference}`, bookingReference: reference, provider: "stripe", status: "pending", providerStatus: "pending",
    amountExpected: snap.total, amountExpectedMinor: toSatang(snap.total), amountPaidMinor: 0, reconciliationStatus: "pending", createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  await getDb().insert(bookingSources).values({ bookingReference: reference, source: trip.agencyId ? `agency:${trip.agencyId}` : "trip-planner", createdAt: now }).onConflictDoNothing().catch(() => undefined);
  await getDb().update(smartTrips).set({ bookingReference: reference, customerName: contact.name, customerEmail: contact.email, customerPhone: contact.phone, updatedAt: now }).where(eq(smartTrips.id, trip.id));
  const session = await paymentProviderFor("stripe").createPayment({ reference, accessToken, customerEmail: contact.email, vehicle: (trip.vehicle as VehicleId) ?? "comfort_suv", origin, total: snap.total, idempotencyKey: `trip:${trip.id}:${reference}` });
  if (!session.sessionId || !session.checkoutUrl) throw new Error("PROVIDER_SESSION_INVALID");
  await getDb().update(bookings).set({ checkoutSessionId: session.sessionId, updatedAt: now }).where(eq(bookings.reference, reference));
  await getDb().update(bookingPayments).set({ providerSessionId: session.sessionId, updatedAt: now }).where(eq(bookingPayments.id, `primary:${reference}`));
  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "checkout_created", providerEventId: `checkout:${session.sessionId}`, createdAt: now });
  return { alreadyPaid: false as const, checkoutUrl: session.checkoutUrl, reference };
}

/** Called when a booking is confirmed: closes the smart trip it came from, if any. */
export async function markTripPaid(reference: string, origin?: string) {
  const [trip] = await getDb().select().from(smartTrips).where(eq(smartTrips.bookingReference, reference)).limit(1);
  if (!trip || trip.status === "accepted") return;
  const now = new Date().toISOString();
  await getDb().update(smartTrips).set({ status: "accepted", acceptedAt: now, changeRequest: null, updatedAt: now }).where(eq(smartTrips.id, trip.id));
  if (origin) await notifyTripReply(trip, "accepted", "", origin);
}
