import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { constantTimeEqual, isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  const { reference } = await context.params;
  const input = await request.json() as { token?: string };
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || !input.token || !constantTimeEqual(await sha256(input.token), booking.accessTokenHash)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "cancelled") return NextResponse.json({ status: "cancelled", refundStatus: booking.refundStatus });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "This booking cannot be cancelled online." }, { status: 409 });
  const pickup = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
  if (pickup - Date.now() < 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Online cancellation closes 24 hours before pickup. Contact Waydidi support." }, { status: 409 });

  return NextResponse.json({ error: "Open Manage your booking to cancel and submit a refund request for administrator approval.", manageUrl: "/booking/manage" }, { status: 409 });
}
