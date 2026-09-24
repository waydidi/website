import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingChangeRequests, bookingAssignments } from "@/db/schema";
import {
  canManageStatus,
  HOUR,
  managedBooking,
  pickupInstant,
} from "@/lib/booking-management";
import { tripPinForReference } from "@/lib/trip-pin";

export async function GET(request: Request) {
  const booking = await managedBooking(request);
  if (!booking)
    return NextResponse.json(
      { error: "Your management session expired." },
      { status: 401 },
    );
  const [changeRequests, assignments] = await Promise.all([
    getDb()
      .select()
      .from(bookingChangeRequests)
      .where(eq(bookingChangeRequests.bookingReference, booking.reference))
      .orderBy(desc(bookingChangeRequests.createdAt))
      .limit(10),
    getDb()
      .select()
      .from(bookingAssignments)
      .where(eq(bookingAssignments.bookingReference, booking.reference)),
  ]);
  const remaining =
    pickupInstant(booking.pickupDate, booking.pickupTime) - Date.now();
  const journeyStarted = assignments.some(
    (a) =>
      !a.revokedAt &&
      [
        "going_to_standby",
        "standby",
        "passenger_verified",
        "trip_started",
        "passenger_picked_up",
        "completed",
        "no_show",
      ].includes(a.currentStatus),
  );
  const tripPin = await tripPinForReference(booking.reference);
  return NextResponse.json(
    {
      booking: {
        reference: booking.reference,
        status: booking.status,
        pickup: booking.pickup,
        dropoff: booking.dropoff,
        pickupDate: booking.pickupDate,
        pickupTime: booking.pickupTime,
        returnPickup: booking.returnPickup,
        returnDropoff: booking.returnDropoff,
        returnDate: booking.returnDate,
        returnTime: booking.returnTime,
        outboundTotal: booking.outboundTotal,
        returnTotal: booking.returnTotal,
        passengers: booking.passengers,
        luggage: booking.luggage,
        vehicle: booking.vehicle,
        total: booking.total,
        paymentMethod: booking.paymentMethod,
        serviceType: booking.serviceType,
        bookedHours: booking.bookedHours,
        refundStatus: booking.refundStatus,
        cancellationReason: booking.cancellationReason,
        bookingVersion: booking.bookingVersion,
        tripPin,
      },
      eligibility: {
        canReschedule:
          canManageStatus(booking.status) &&
          !journeyStarted &&
          remaining >= 72 * HOUR,
        canCancel:
          canManageStatus(booking.status) &&
          !journeyStarted &&
          remaining >= 24 * HOUR,
        rescheduleCutoff: new Date(
          pickupInstant(booking.pickupDate, booking.pickupTime) - 72 * HOUR,
        ).toISOString(),
        cancellationCutoff: new Date(
          pickupInstant(booking.pickupDate, booking.pickupTime) - 24 * HOUR,
        ).toISOString(),
      },
      changeRequests,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
