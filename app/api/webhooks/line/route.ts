import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingEvents, bookings, drivers, driverStatusEvents } from "@/db/schema";
import { notifyLineDriverPayment, verifyLineSignature } from "@/lib/line";

type LineEvent = { type?: string; webhookEventId?: string; postback?: { data?: string } };

export async function POST(request: Request) {
  const raw = await request.text();
  if (!(await verifyLineSignature(raw, request.headers.get("x-line-signature") ?? ""))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let body: { events?: LineEvent[] }; try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  for (const event of body.events ?? []) {
    if (event.type !== "postback") continue;
    const params = new URLSearchParams(event.postback?.data ?? "");
    if (params.get("action") !== "complete_trip") continue;
    const eventId = params.get("event") ?? "";
    const [statusEvent] = await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.id, eventId)).limit(1);
    if (!statusEvent || statusEvent.status !== "completed") continue;
    if (statusEvent.verificationStatus === "verified") continue;
    if (statusEvent.verificationStatus !== "pending_review") continue;
    const [[assignment], [booking]] = await Promise.all([
      getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, statusEvent.assignmentId)).limit(1),
      getDb().select().from(bookings).where(eq(bookings.reference, statusEvent.bookingReference)).limit(1),
    ]);
    if (!assignment || !booking) continue;
    const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, assignment.driverId)).limit(1);
    const now = new Date().toISOString();
    const claimed = await env.DB.prepare("UPDATE driver_status_events SET verification_status = 'verified', verified_by = ?, verified_at = ? WHERE id = ? AND verification_status = 'pending_review'").bind("LINE admin", now, statusEvent.id).run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;
    await env.DB.batch([
      env.DB.prepare("UPDATE bookings SET status = 'completed', updated_at = ? WHERE reference = ?").bind(now, booking.reference),
      env.DB.prepare("INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'trip_completed_verified', ?, ?)").bind(booking.reference, `line-completed:${statusEvent.id}`, now),
    ]);
    if (driver) await notifyLineDriverPayment({ reference: booking.reference, driverName: driver.fullName, bankCode: driver.bankCode, bankAccountNumber: driver.bankAccountNumber }).catch((error) => console.error("LINE payment notification failed", error));
  }
  return NextResponse.json({ ok: true });
}
