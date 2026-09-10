import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { constantTimeEqual, sha256 } from "@/lib/security";

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  const tokenHash = token ? await sha256(token) : "";
  if (!booking || !token || !constantTimeEqual(tokenHash, booking.accessTokenHash)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({
    reference: booking.reference, customerName: booking.customerName, customerEmail: booking.customerEmail, customerPhone: booking.customerPhone,
    pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime,
    passengers: booking.passengers, luggage: booking.luggage, vehicle: booking.vehicle, total: booking.total,
    flightNumber: booking.flightNumber, pickupSign: booking.pickupSign, pickupInstructions: booking.pickupInstructions,
    childSeats: booking.childSeats, oversizedLuggage: booking.oversizedLuggage, specialRequests: booking.specialRequests,
    status: booking.status, emailStatus: booking.emailStatus, paymentMethod: booking.paymentMethod,
  }, { headers: { "Cache-Control": "no-store" } });
}
