import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookings } from "@/db/schema";
import { getWaydidiAdmin, verifyAdminKey } from "@/lib/admin";
import { purgeExpiredBookings } from "@/lib/booking-bin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { VEHICLES, vehicleFits, type VehicleId } from "@/lib/vehicles";

export async function DELETE(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  // Deleting needs the admin password again, even with a signed-in session.
  const { password } = await request.json().catch(() => ({})) as { password?: string };
  if (!password || !(await verifyAdminKey(password))) return NextResponse.json({ error: "Incorrect admin password." }, { status: 403 });
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
  if (booking.status !== "cancelled") await import("@/lib/telegram/booking-changes").then((m) => m.notifyAdminBinned(reference, admin.email)).catch(() => undefined);
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
  if (booking.binPreviousStatus !== "cancelled") await import("@/lib/telegram/booking-changes").then((m) => m.notifyAdminRestored(reference, admin.email)).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

// Admin: change the trip details (date, time, return, car class, passengers, luggage).
// The price is not recalculated. A driver who already has the job gets an updated job post.
export async function PATCH(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { reference } = await context.params;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.status === "binned") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "cancelled") return NextResponse.json({ error: "Cancelled bookings can't be changed." }, { status: 409 });
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const pickupDate = String(input.pickupDate ?? ""), pickupTime = String(input.pickupTime ?? "");
  if (!date.test(pickupDate) || !time.test(pickupTime)) return NextResponse.json({ error: "Choose a valid pickup date and time." }, { status: 400 });
  const vehicle = String(input.vehicle ?? "") as VehicleId;
  if (!(vehicle in VEHICLES)) return NextResponse.json({ error: "Choose a car class." }, { status: 400 });
  const passengers = Number(input.passengers), luggage = Number(input.luggage);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 30 || !Number.isInteger(luggage) || luggage < 0 || luggage > 40) return NextResponse.json({ error: "Enter the number of passengers and bags." }, { status: 400 });
  if (!vehicleFits(vehicle, passengers, luggage)) return NextResponse.json({ error: `The ${VEHICLES[vehicle].name} carries up to ${VEHICLES[vehicle].passengers} passengers and ${VEHICLES[vehicle].bags} bags.` }, { status: 400 });
  let returnDate = booking.returnDate, returnTime = booking.returnTime;
  if (booking.returnDate) {
    returnDate = String(input.returnDate ?? ""); returnTime = String(input.returnTime ?? "");
    if (!date.test(returnDate) || !time.test(returnTime)) return NextResponse.json({ error: "Choose a valid return date and time." }, { status: 400 });
    if (`${returnDate}T${returnTime}` <= `${pickupDate}T${pickupTime}`) return NextResponse.json({ error: "The return must be after the pickup." }, { status: 400 });
  }
  const changed = booking.pickupDate !== pickupDate || booking.pickupTime !== pickupTime || booking.vehicle !== vehicle || booking.passengers !== passengers || booking.luggage !== luggage || booking.returnDate !== returnDate || booking.returnTime !== returnTime;
  if (!changed) return NextResponse.json({ ok: true, changed: false });
  await getDb().update(bookings).set({ pickupDate, pickupTime, vehicle, passengers, luggage, returnDate, returnTime, bookingVersion: booking.bookingVersion + 1, updatedAt: new Date().toISOString() }).where(eq(bookings.reference, reference));
  console.info("Admin edited booking", { reference, admin: admin.email });
  await import("@/lib/telegram/booking-changes").then((m) => m.republishJob(reference, admin.displayName || admin.email, "แก้ไขโดยแอดมิน")).catch(() => undefined);
  return NextResponse.json({ ok: true, changed: true });
}
