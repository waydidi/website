import { customerFromRequest, customerBooking } from "@/lib/customer-auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  const { reference } = await context.params;
  const account=await customerFromRequest(request);
  if(!account||!await customerBooking(account.customer,reference)) return NextResponse.json({error:"Verify your booking email before cancellation."},{status:401});
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.status === "binned") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "cancelled") return NextResponse.json({ status: "cancelled", refundStatus: booking.refundStatus });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "This booking cannot be cancelled online." }, { status: 409 });
  const pickup = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
  if (pickup - Date.now() < 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Cancellations less than 24 hours before pickup are non-refundable. Contact Waydidi on WhatsApp +66 63 206 4884." }, { status: 409 });

  return NextResponse.json({ error: "To cancel or ask about a refund, contact Waydidi on WhatsApp +66 63 206 4884 or email support@waydidi.com with your booking reference." }, { status: 409 });
}
