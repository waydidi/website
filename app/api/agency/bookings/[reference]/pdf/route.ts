import { NextResponse } from "next/server";
import { agencyBooking, agencyForCustomer } from "@/lib/agency";
import { bookingExtras } from "@/lib/booking-extras";
import { createConfirmationPdf, confirmationPdfName } from "@/lib/confirmation-pdf";
import { customerFromRequest } from "@/lib/customer-auth";

// Agency portal: download the confirmation PDF of one of the agency's bookings.
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const session = await customerFromRequest(request);
  const agency = await agencyForCustomer(session?.customer ?? null);
  if (!agency) return NextResponse.json({ error: "Please sign in with your agency email." }, { status: 401 });
  const { reference } = await context.params;
  const booking = await agencyBooking(agency, reference.toUpperCase());
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "confirmed" && booking.status !== "completed") return NextResponse.json({ error: "No confirmation is available for this booking." }, { status: 409 });
  const pdf = await createConfirmationPdf(booking, await bookingExtras(booking));
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${confirmationPdfName(booking.reference, booking.pickupDate)}"`,
    "Cache-Control": "private, no-store",
  } });
}
