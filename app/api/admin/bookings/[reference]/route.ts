import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookings } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { purgeExpiredBookings } from "@/lib/booking-bin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function DELETE(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  await purgeExpiredBookings();
  const { reference } = await context.params;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "binned") return NextResponse.json({ error: "Booking is already in the bin." }, { status: 409 });
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await getDb().batch([
    getDb().update(bookings).set({ status: "binned", binPreviousStatus: booking.status, binnedAt: now.toISOString(), purgeAfter, binnedBy: admin.email, updatedAt: now.toISOString() }).where(eq(bookings.reference, reference)),
    getDb().update(bookingAssignments).set({ revokedAt: now.toISOString(), updatedAt: now.toISOString() }).where(eq(bookingAssignments.bookingReference, reference)),
  ]);
  return NextResponse.json({ ok: true, purgeAfter });
}

export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  await purgeExpiredBookings();
  const { reference } = await context.params;
  const input = await request.json().catch(() => null) as { action?: string } | null;
  if (input?.action !== "restore") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.status !== "binned") return NextResponse.json({ error: "Booking is not in the bin." }, { status: 404 });
  await getDb().update(bookings).set({ status: booking.binPreviousStatus || "confirmed", binnedAt: null, purgeAfter: null, binnedBy: null, binPreviousStatus: null, updatedAt: new Date().toISOString() }).where(eq(bookings.reference, reference));
  return NextResponse.json({ ok: true });
}
