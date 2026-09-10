import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingEvents, bookingNotifications, bookings, drivers, driverAvailability, driverStatusEvents } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { sendDriverAssignmentEmail } from "@/lib/email";
import { bookingWindow, rangesOverlap } from "@/lib/operations-calendar";
import { isJsonRequest, safeOrigin, sameOrigin, secureToken, sha256 } from "@/lib/security";

function phoneValid(value: string) {
  return /^[+0-9() .-]{7,30}$/u.test(value.trim());
}

function emailValid(value: string) {
  return /^\S+@\S+\.\S+$/u.test(value) && value.length <= 254;
}

export async function GET() {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [bookingRows, driverRows, assignmentRows, eventRows] = await Promise.all([
    getDb().select().from(bookings).orderBy(desc(bookings.createdAt)).limit(150),
    getDb().select().from(drivers).orderBy(drivers.fullName),
    getDb().select().from(bookingAssignments).orderBy(desc(bookingAssignments.assignedAt)).limit(250),
    getDb().select().from(driverStatusEvents).orderBy(desc(driverStatusEvents.createdAt)).limit(600),
  ]);
  return NextResponse.json({
    bookings: bookingRows.map((row) => ({
      reference: row.reference, customerName: row.customerName, customerEmail: row.customerEmail,
      customerPhone: row.customerPhone, pickup: row.pickup, dropoff: row.dropoff,
      pickupDate: row.pickupDate, pickupTime: row.pickupTime, passengers: row.passengers,
      luggage: row.luggage, vehicle: row.vehicle, total: row.total, status: row.status,
    })),
    drivers: driverRows,
    assignments: assignmentRows.map((row) => ({
      id: row.id, bookingReference: row.bookingReference, driverId: row.driverId,
      currentStatus: row.currentStatus, assignedBy: row.assignedBy, assignedAt: row.assignedAt,
      tokenExpiresAt: row.tokenExpiresAt, revokedAt: row.revokedAt, completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    })),
    events: eventRows.map((row) => ({
      id: row.id, assignmentId: row.assignmentId, bookingReference: row.bookingReference,
      status: row.status, previousStatus: row.previousStatus, latitude: row.latitude,
      longitude: row.longitude, accuracyMetres: row.accuracyMetres,
      expectedDistanceMetres: row.expectedDistanceMetres, driverNote: row.driverNote,
      evidenceKey: row.evidenceKey ? "available" : null, verificationStatus: row.verificationStatus,
      verifiedBy: row.verifiedBy, verifiedAt: row.verifiedAt,
      rejectionReason: row.rejectionReason, createdAt: row.createdAt,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = await request.json() as { action?: string; driverId?: string; bookingReference?: string; fullName?: string; phone?: string; email?: string; assignmentId?: string; eventId?: string; reason?: string };
  const now = new Date().toISOString();

  if (input.action === "create_driver") {
    const fullName = input.fullName?.trim() ?? "";
    const phone = input.phone?.trim() ?? "";
    const email = input.email?.trim().toLowerCase() ?? "";
    if (fullName.length < 2 || fullName.length > 100 || !phoneValid(phone) || (email && !emailValid(email))) return NextResponse.json({ error: "Enter a valid driver name, phone number, and email." }, { status: 400 });
    const driver = { id: crypto.randomUUID(), fullName, phone, email: email || null, remindersEnabled: true, status: "active", createdAt: now, updatedAt: now };
    await getDb().insert(drivers).values(driver);
    return NextResponse.json({ driver });
  }

  if (input.action === "assign" || input.action === "rotate_link") {
    let bookingReference = input.bookingReference?.trim() ?? "";
    let driverId = input.driverId?.trim() ?? "";
    if (input.action === "rotate_link") {
      const [existing] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, input.assignmentId ?? "")).limit(1);
      if (!existing) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
      bookingReference = existing.bookingReference;
      driverId = existing.driverId;
    }
    const [[booking], [driver]] = await Promise.all([
      getDb().select().from(bookings).where(eq(bookings.reference, bookingReference)).limit(1),
      getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1),
    ]);
    if (!booking || booking.status !== "confirmed" || !driver || driver.status !== "active") return NextResponse.json({ error: "Choose a confirmed booking and an active driver." }, { status: 409 });
    if (input.action === "assign") {
      const [driverAssignments, allBookings, unavailableRows] = await Promise.all([
        getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.driverId, driverId), isNull(bookingAssignments.revokedAt))),
        getDb().select().from(bookings),
        getDb().select().from(driverAvailability).where(eq(driverAvailability.driverId, driverId)),
      ]);
      const candidate = bookingWindow(booking);
      const bookingMap = new Map(allBookings.map((row) => [row.reference, row]));
      const conflicts: string[] = [];
      for (const assignment of driverAssignments.filter((row) => row.bookingReference !== bookingReference && row.currentStatus !== "completed")) {
        const assignedBooking = bookingMap.get(assignment.bookingReference);
        if (!assignedBooking || assignedBooking.status !== "confirmed") continue;
        const occupied = bookingWindow(assignedBooking);
        if (rangesOverlap(candidate.startsAt, candidate.endsAt, occupied.startsAt, occupied.endsAt)) conflicts.push(`Overlaps ${assignedBooking.reference} at ${assignedBooking.pickupTime}`);
      }
      for (const unavailable of unavailableRows) {
        if (rangesOverlap(candidate.startsAt, candidate.endsAt, new Date(unavailable.startsAt).getTime(), new Date(unavailable.endsAt).getTime())) conflicts.push(unavailable.reason ? `Driver unavailable: ${unavailable.reason}` : "Driver unavailable during this journey");
      }
      if (conflicts.length) return NextResponse.json({ error: `Driver schedule conflict: ${conflicts.join("; ")}. Use Operations Calendar to review or override.` }, { status: 409 });
    }
    const active = await getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.bookingReference, bookingReference), isNull(bookingAssignments.revokedAt)));
    for (const row of active) await getDb().update(bookingAssignments).set({ revokedAt: now, updatedAt: now }).where(eq(bookingAssignments.id, row.id));
    const token = secureToken();
    const pickup = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
    const expiry = new Date(Math.max(Date.now() + 48 * 60 * 60 * 1000, pickup + 24 * 60 * 60 * 1000)).toISOString();
    const assignment = { id: crypto.randomUUID(), bookingReference, driverId, tokenHash: await sha256(token), currentStatus: "assigned", assignedBy: admin.email, assignedAt: now, tokenExpiresAt: expiry, updatedAt: now };
    await getDb().insert(bookingAssignments).values(assignment);
    await getDb().insert(bookingEvents).values({ bookingReference, eventType: input.action === "rotate_link" ? "driver_link_rotated" : "driver_assigned", providerEventId: `assignment:${assignment.id}`, createdAt: now });
    const driverUrl = `${safeOrigin(request)}/driver/trip/${token}`;
    if (driver.email && driver.remindersEnabled) {
      const delivery = await sendDriverAssignmentEmail({ to: driver.email, driverName: driver.fullName, driverUrl, reference: booking.reference, pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime, vehicle: booking.vehicle });
      await getDb().insert(bookingNotifications).values({ id: crypto.randomUUID(), bookingReference, assignmentId: assignment.id, notificationType: "driver_assignment", channel: "email", recipient: driver.email, dedupeKey: `driver-assignment:${assignment.id}`, scheduledFor: now, status: delivery.status === "sent" ? "sent" : "failed", attemptCount: 1, lastAttemptAt: now, sentAt: delivery.status === "sent" ? now : null, errorMessage: delivery.status === "sent" ? null : delivery.status, createdAt: now, updatedAt: now });
    }
    return NextResponse.json({ assignment: { id: assignment.id, bookingReference, driverId, currentStatus: assignment.currentStatus, assignedAt: now, tokenExpiresAt: expiry }, driverUrl });
  }

  if (input.action === "revoke") {
    const [assignment] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, input.assignmentId ?? "")).limit(1);
    if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    await getDb().update(bookingAssignments).set({ revokedAt: now, updatedAt: now }).where(eq(bookingAssignments.id, assignment.id));
    await getDb().insert(bookingEvents).values({ bookingReference: assignment.bookingReference, eventType: "driver_access_revoked", providerEventId: `revoked:${assignment.id}`, createdAt: now });
    return NextResponse.json({ ok: true });
  }

  if (input.action === "verify_event" || input.action === "reject_event") {
    const [event] = await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.id, input.eventId ?? "")).limit(1);
    if (!event) return NextResponse.json({ error: "Evidence event not found." }, { status: 404 });
    if (event.verificationStatus !== "pending_review") return NextResponse.json({ error: "This evidence has already been reviewed." }, { status: 409 });
    const reason = input.reason?.trim() ?? "";
    if (input.action === "reject_event" && (reason.length < 3 || reason.length > 300)) return NextResponse.json({ error: "Add a reason for the driver." }, { status: 400 });
    await getDb().update(driverStatusEvents).set({ verificationStatus: input.action === "verify_event" ? "verified" : "rejected", verifiedBy: admin.email, verifiedAt: now, rejectionReason: input.action === "reject_event" ? reason : null }).where(eq(driverStatusEvents.id, event.id));
    if (input.action === "reject_event") {
      const [assignment] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, event.assignmentId)).limit(1);
      if (assignment?.currentStatus === event.status) {
        await getDb().update(bookingAssignments).set({ currentStatus: event.previousStatus, completedAt: null, updatedAt: now }).where(eq(bookingAssignments.id, event.assignmentId));
      }
    }
    if (input.action === "verify_event" && event.status === "completed") {
      await getDb().update(bookings).set({ status: "completed", updatedAt: now }).where(eq(bookings.reference, event.bookingReference));
      await getDb().insert(bookingEvents).values({ bookingReference: event.bookingReference, eventType: "trip_completed_verified", providerEventId: `completed:${event.id}`, createdAt: now });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
