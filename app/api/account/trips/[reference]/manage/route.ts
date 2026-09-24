import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents, bookingManagementSessions } from "@/db/schema";
import { managementCookie } from "@/lib/booking-management";
import { customerBooking, customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin, secureToken, sha256 } from "@/lib/security";

// Opens the existing booking-management screen for a trip the signed-in
// customer owns, skipping the reference + surname step.
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { reference } = await context.params;
  const booking = await customerBooking(session.customer, reference.toUpperCase());
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  const token = secureToken(), now = new Date();
  await getDb().insert(bookingManagementSessions).values({
    id: crypto.randomUUID(), bookingReference: booking.reference, tokenHash: await sha256(token),
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(), createdAt: now.toISOString(), lastUsedAt: now.toISOString(),
  });
  await getDb().insert(bookingEvents).values({ bookingReference: booking.reference, eventType: "customer_account_manage", createdAt: now.toISOString() });
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": managementCookie(token), "Cache-Control": "no-store" } });
}
