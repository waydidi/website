import { NextResponse } from "next/server";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { customerBooking, customerFromRequest } from "@/lib/customer-auth";

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { reference } = await context.params;
  const booking = await customerBooking(session.customer, reference.toUpperCase());
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "confirmed" && booking.status !== "completed") return NextResponse.json({ error: "No receipt is available for this booking." }, { status: 409 });
  const pdf = await createConfirmationPdf(booking);
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="Waydidi-${booking.reference}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}
