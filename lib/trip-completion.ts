import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookings, drivers, driverStatusEvents } from "@/db/schema";
import { completeJourney, parseLeg } from "@/lib/journey-legs";
import { notifyLineDriverPayment } from "@/lib/line";

/** An admin confirms a driver's Drop (from LINE "ปิดงาน" or Telegram "Completed job"): the job is completed. */
export async function verifyTripCompletion(eventId: string, verifiedBy: string): Promise<{ result: "done" | "already" | "invalid"; reference?: string }> {
  const [statusEvent] = await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.id, eventId)).limit(1);
  if (!statusEvent || statusEvent.status !== "completed") return { result: "invalid" };
  if (statusEvent.verificationStatus === "verified") return { result: "already", reference: statusEvent.bookingReference };
  if (statusEvent.verificationStatus !== "pending_review") return { result: "invalid" };
  const [[assignment], [booking]] = await Promise.all([
    getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, statusEvent.assignmentId)).limit(1),
    getDb().select().from(bookings).where(eq(bookings.reference, statusEvent.bookingReference)).limit(1),
  ]);
  if (!assignment || assignment.revokedAt || !booking || booking.status !== "confirmed") return { result: "invalid" };
  const now = new Date().toISOString();
  const claimed = await env.DB.prepare("UPDATE driver_status_events SET verification_status = 'verified', verified_by = ?, verified_at = ? WHERE id = ? AND verification_status = 'pending_review'").bind(verifiedBy, now, statusEvent.id).run();
  if ((claimed.meta.changes ?? 0) !== 1) return { result: "already", reference: booking.reference };
  await completeJourney(booking.reference, parseLeg(assignment.leg), "completed");
  await env.DB.prepare("INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'trip_completed_verified', ?, ?)").bind(booking.reference, `completed:${statusEvent.id}`, now).run();
  const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, assignment.driverId)).limit(1);
  if (driver) await notifyLineDriverPayment({ reference: booking.reference, driverName: driver.fullName, bankCode: driver.bankCode, bankAccountNumber: driver.bankAccountNumber }).catch((error) => console.error("LINE payment notification failed", error));
  return { result: "done", reference: booking.reference };
}
