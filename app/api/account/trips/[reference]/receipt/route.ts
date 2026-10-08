import { NextResponse } from "next/server";
import { customerBooking, customerFromRequest } from "@/lib/customer-auth";
import { receiptResponse } from "@/lib/receipt-response";
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { reference } = await context.params;
  const booking = await customerBooking(session.customer, reference.toUpperCase());
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return receiptResponse(booking);
}
