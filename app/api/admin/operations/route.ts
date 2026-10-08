import { assignmentTelegramNotification, deliverAssignmentTelegram } from "@/lib/telegram/assignments";
import { completeJourney, journeysFor, journeyFor, parseLeg } from "@/lib/journey-legs";
import { driverTokenForAssignment } from "@/lib/trip-links";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingEvents, bookingNotifications, bookings, drivers, driverAvailability, driverStatusEvents, journeyExceptions, journeyLocations, passengerVerifications } from "@/db/schema";
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

export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [bookingRows, driverRows, assignmentRows, eventRows, locationRows, exceptionRows] = await Promise.all([
    getDb().select().from(bookings).orderBy(desc(bookings.createdAt)).limit(150),
    getDb().select().from(drivers).orderBy(drivers.fullName),
    getDb().select().from(bookingAssignments).orderBy(desc(bookingAssignments.assignedAt)).limit(250),
    getDb().select().from(driverStatusEvents).orderBy(desc(driverStatusEvents.createdAt)).limit(600),
    getDb().select().from(journeyLocations).orderBy(desc(journeyLocations.serverTimestamp)).limit(1000),
    getDb().select().from(journeyExceptions).orderBy(desc(journeyExceptions.updatedAt)).limit(300),
  ]);
  const leg = parseLeg(new URL(request.url).searchParams.get("leg"));
  const journeyRows = (await journeysFor(bookingRows)).filter(row => row.leg === leg);
  const assignmentIds = new Set(assignmentRows.filter(a => a.leg === leg).map(a => a.id));
  return NextResponse.json({
    bookings: journeyRows.map((row) => ({
      reference: row.reference, customerName: row.customerName, customerEmail: row.customerEmail,
      customerPhone: row.customerPhone, pickup: row.pickup, dropoff: row.dropoff,
      pickupDate: row.pickupDate, pickupTime: row.pickupTime, passengers: row.passengers,
      luggage: row.luggage, vehicle: row.vehicle, total: row.total, status: row.status,
    })),
    drivers: driverRows.map((row) => ({ id: row.id, fullName: row.fullName, phone: row.phone, email: row.email, vehicle: row.vehicle, baseLocation: row.baseLocation, carPlate: row.carPlate, driverType: row.driverType, vehicleType: row.vehicleType, hasPhoto: Boolean(row.photoKey), remindersEnabled: row.remindersEnabled, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt, idImageKey: row.idImageKey ? "available" : null, carImageKey: row.carImageKey ? "available" : null })),
    assignments: assignmentRows.filter(row => row.leg === leg).map((row) => ({
      id: row.id, bookingReference: row.bookingReference, driverId: row.driverId,
      currentStatus: row.currentStatus, assignedBy: row.assignedBy, assignedAt: row.assignedAt,
      tokenExpiresAt: row.tokenExpiresAt, revokedAt: row.revokedAt, completedAt: row.completedAt,
      updatedAt: row.updatedAt,
      passengerVerifiedAt: row.passengerVerifiedAt, passengerVerificationMethod: row.passengerVerificationMethod,
    })),
    events: eventRows.filter(row => assignmentIds.has(row.assignmentId)).map((row) => ({
      id: row.id, assignmentId: row.assignmentId, bookingReference: row.bookingReference,
      status: row.status, previousStatus: row.previousStatus, latitude: row.latitude,
      longitude: row.longitude, accuracyMetres: row.accuracyMetres,
      expectedDistanceMetres: row.expectedDistanceMetres, driverNote: row.driverNote,
      evidenceKey: row.evidenceKey || row.tripEvidenceId ? "available" : null, verificationStatus: row.verificationStatus,
      verifiedBy: row.verifiedBy, verifiedAt: row.verifiedAt,
      rejectionReason: row.rejectionReason, createdAt: row.createdAt, confirmedAt: row.confirmedAt,
    })),
    locations: locationRows.filter(row => assignmentIds.has(row.assignmentId)).map((row) => ({ id: row.id, bookingReference: row.bookingReference, assignmentId: row.assignmentId, latitude: row.latitude, longitude: row.longitude, accuracyMetres: row.accuracyMetres, clientTimestamp: row.clientTimestamp, serverTimestamp: row.serverTimestamp, sequenceNumber: row.sequenceNumber, quality: row.quality })),
    exceptions: exceptionRows.filter(row => assignmentIds.has(row.assignmentId)),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = await request.json() as { action?: string; leg?: string; driverId?: string; bookingReference?: string; fullName?: string; phone?: string; email?: string; assignmentId?: string; eventId?: string; reason?: string };
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
    let rotation: typeof bookingAssignments.$inferSelect | null = null;
    let leg = parseLeg(input.leg);
    let bookingReference = input.bookingReference?.trim() ?? "";
    let driverId = input.driverId?.trim() ?? "";
    if (input.action === "rotate_link") {
      const [existing] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, input.assignmentId ?? "")).limit(1);
      if (!existing) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
      bookingReference = existing.bookingReference;
      driverId = existing.driverId;
      leg = parseLeg(existing.leg);
      rotation = existing;
    }
    const [[parentBooking], [driver]] = await Promise.all([
      getDb().select().from(bookings).where(eq(bookings.reference, bookingReference)).limit(1),
      getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1),
    ]);
    const booking = parentBooking ? await journeyFor(parentBooking, leg) : null;
    if (!booking || booking.status !== "confirmed" || !driver || driver.status !== "active") return NextResponse.json({ error: "Choose a confirmed booking and an active driver." }, { status: 409 });
    if (rotation) {
      if (rotation.revokedAt) return NextResponse.json({error:"This driver link was revoked."},{status:409});
      const token = await driverTokenForAssignment(bookingReference, leg); const tokenExpiresAt = new Date(Math.max(Date.now()+48*3600_000,new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime()+24*3600_000)).toISOString();
      const [updated] = await getDb().update(bookingAssignments).set({tokenHash:await sha256(token),tokenExpiresAt,updatedAt:now}).where(and(eq(bookingAssignments.id,rotation.id),isNull(bookingAssignments.revokedAt))).returning();
      if (!updated) return NextResponse.json({error:"Assignment changed. Refresh and retry."},{status:409});
      await getDb().insert(bookingEvents).values({bookingReference,eventType:"driver_link_rotated",providerEventId:`rotation:${crypto.randomUUID()}`,createdAt:now});
      return NextResponse.json({assignment:{id:updated.id,bookingReference,leg,driverId,currentStatus:updated.currentStatus,assignedAt:updated.assignedAt,tokenExpiresAt},driverUrl:`${safeOrigin(request)}/driver/trip/${token}`});
    }
    if (input.action === "assign") {
      const [driverAssignments, allBookings, unavailableRows] = await Promise.all([
        getDb().select().from(bookingAssignments).where(and(eq(bookingAssignments.driverId, driverId), isNull(bookingAssignments.revokedAt))),
        getDb().select().from(bookings),
        getDb().select().from(driverAvailability).where(eq(driverAvailability.driverId, driverId)),
      ]);
      const candidate = bookingWindow(booking);
      const bookingMap = new Map((await journeysFor(allBookings)).map((row) => [row.journeyId, row]));
      const conflicts: string[] = [];
      for (const assignment of driverAssignments.filter((row) => (row.bookingReference !== bookingReference || row.leg !== leg) && row.currentStatus !== "completed" && row.currentStatus !== "no_show")) {
        const assignedBooking = bookingMap.get(`${assignment.bookingReference}:${assignment.leg}`);
        if (!assignedBooking || assignedBooking.status !== "confirmed") continue;
        const occupied = bookingWindow(assignedBooking);
        if (rangesOverlap(candidate.startsAt, candidate.endsAt, occupied.startsAt, occupied.endsAt)) conflicts.push(`Overlaps ${assignedBooking.reference} at ${assignedBooking.pickupTime}`);
      }
      for (const unavailable of unavailableRows) {
        if (rangesOverlap(candidate.startsAt, candidate.endsAt, new Date(unavailable.startsAt).getTime(), new Date(unavailable.endsAt).getTime())) conflicts.push(unavailable.reason ? `Driver unavailable: ${unavailable.reason}` : "Driver unavailable during this journey");
      }
      if (conflicts.length) return NextResponse.json({ error: `Driver schedule conflict: ${conflicts.join("; ")}. Use Operations Calendar to review or override.` }, { status: 409 });
    }
    const token = await driverTokenForAssignment(bookingReference, leg);
    const pickup = new Date(`${booking.pickupDate}T${booking.pickupTime}:00+07:00`).getTime();
    const expiry = new Date(Math.max(Date.now() + 48 * 60 * 60 * 1000, pickup + 24 * 60 * 60 * 1000)).toISOString();
    const assignment = { id: crypto.randomUUID(), bookingReference, leg, driverId, tokenHash: await sha256(token), currentStatus: "assigned", assignedBy: admin.email, assignedAt: now, tokenExpiresAt: expiry, updatedAt: now };
    await getDb().batch([
      getDb().update(bookingAssignments).set({revokedAt:now,updatedAt:now}).where(and(eq(bookingAssignments.bookingReference,bookingReference),eq(bookingAssignments.leg,leg),isNull(bookingAssignments.revokedAt))),
      getDb().insert(bookingAssignments).values(assignment),
      getDb().insert(bookingNotifications).values(assignmentTelegramNotification(assignment)),
    ]);
    await getDb().insert(bookingEvents).values({ bookingReference, eventType: input.action === "rotate_link" ? "driver_link_rotated" : "driver_assigned", providerEventId: `assignment:${assignment.id}`, createdAt: now });
    const driverUrl = `${safeOrigin(request)}/driver/trip/${token}`;
    const telegramNotification = await deliverAssignmentTelegram(assignment.id).catch(() => "queued");
    // Day trips from the planner: the stop-by-stop plan goes to the staff LINE group to forward.
    await import("@/lib/trip-driver").then((m) => m.sendDriverPlanToLine(bookingReference, driver.fullName, driverUrl)).catch((error) => console.error("driver plan LINE failed", error));
    if (driver.email && driver.remindersEnabled) {
      const delivery = await sendDriverAssignmentEmail({ to: driver.email, driverName: driver.fullName, driverUrl, reference: booking.reference, pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime, vehicle: booking.vehicle });
      await getDb().insert(bookingNotifications).values({ id: crypto.randomUUID(), bookingReference, assignmentId: assignment.id, notificationType: "driver_assignment", channel: "email", recipient: driver.email, dedupeKey: `driver-assignment:${assignment.id}`, scheduledFor: now, status: delivery.status === "sent" ? "sent" : "failed", attemptCount: 1, lastAttemptAt: now, sentAt: delivery.status === "sent" ? now : null, errorMessage: delivery.status === "sent" ? null : delivery.status, createdAt: now, updatedAt: now });
    }
    return NextResponse.json({ assignment: { id: assignment.id, bookingReference, driverId, currentStatus: assignment.currentStatus, assignedAt: now, tokenExpiresAt: expiry }, driverUrl, telegramNotification });
  }

  if (input.action === "revoke") {
    const [assignment] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, input.assignmentId ?? "")).limit(1);
    if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    await getDb().update(bookingAssignments).set({ revokedAt: now, updatedAt: now }).where(eq(bookingAssignments.id, assignment.id));
    await getDb().insert(bookingEvents).values({ bookingReference: assignment.bookingReference, eventType: "driver_access_revoked", providerEventId: `revoked:${assignment.id}`, createdAt: now });
    return NextResponse.json({ ok: true });
  }

  if (input.action === "override_passenger_verification") {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 3 || reason.length > 300) return NextResponse.json({ error: "Add an override reason (3–300 characters)." }, { status: 400 });
    const [assignment] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, input.assignmentId ?? "")).limit(1);
    if (!assignment) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    if (assignment.currentStatus !== "standby" || assignment.passengerVerifiedAt) return NextResponse.json({ error: "This passenger cannot be overridden at the current trip step." }, { status: 409 });
    const [{ attempts }] = await getDb().select({ attempts: count() }).from(passengerVerifications).where(eq(passengerVerifications.assignmentId, assignment.id));
    await getDb().batch([
      getDb().update(bookingAssignments).set({ currentStatus: "passenger_verified", passengerVerifiedAt: now, passengerVerificationMethod: "operations_override", passengerVerifiedBy: admin.email, updatedAt: now }).where(eq(bookingAssignments.id, assignment.id)),
      getDb().insert(passengerVerifications).values({ id: crypto.randomUUID(), bookingReference: assignment.bookingReference, assignmentId: assignment.id, driverId: assignment.driverId, result: "override", attemptNumber: attempts + 1, actor: admin.email, reason, createdAt: now }),
      getDb().insert(driverStatusEvents).values({ id: crypto.randomUUID(), assignmentId: assignment.id, bookingReference: assignment.bookingReference, status: "passenger_verified", previousStatus: "standby", verificationStatus: "verified", verifiedBy: admin.email, verifiedAt: now, driverNote: `Operations override: ${reason}`, createdAt: now }),
      getDb().insert(bookingEvents).values({ bookingReference: assignment.bookingReference, eventType: "passenger_verification_override", providerEventId: `passenger-override:${assignment.id}`, createdAt: now }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (input.action === "verify_event" || input.action === "reject_event") {
    const [event] = await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.id, input.eventId ?? "")).limit(1);
    if (!event) return NextResponse.json({ error: "Evidence event not found." }, { status: 404 });
    if (event.verificationStatus !== "pending_review") return NextResponse.json({ error: "This evidence has already been reviewed." }, { status: 409 });
    const reason = input.reason?.trim() ?? "";
    if (input.action === "reject_event" && (reason.length < 3 || reason.length > 300)) return NextResponse.json({ error: "Add a reason for the driver." }, { status: 400 });
    const [reviewed] = await getDb().update(driverStatusEvents).set({ verificationStatus: input.action === "verify_event" ? "verified" : "rejected", verifiedBy: admin.email, verifiedAt: now, rejectionReason: input.action === "reject_event" ? reason : null }).where(and(eq(driverStatusEvents.id, event.id),eq(driverStatusEvents.verificationStatus,"pending_review"))).returning();
    if (!reviewed) return NextResponse.json({error:"This evidence has already been reviewed."},{status:409});
    if (input.action === "reject_event") {
      const [assignment] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, event.assignmentId)).limit(1);
      if (assignment?.currentStatus === event.status) {
        await getDb().update(bookingAssignments).set({ currentStatus: event.previousStatus, completedAt: null, updatedAt: now }).where(eq(bookingAssignments.id, event.assignmentId));
      }
    }
    if (input.action === "verify_event" && event.status === "no_show") {
      const [a] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id,event.assignmentId)).limit(1);
      if (a) await completeJourney(event.bookingReference,parseLeg(a.leg),"no_show");
      await getDb().insert(bookingEvents).values({ bookingReference: event.bookingReference, eventType: "no_show_verified", providerEventId: `no-show:${event.id}`, createdAt: now });
    }
    if (input.action === "reject_event" && event.status === "no_show") {
      await getDb().update(bookings).set({ attentionStatus: "normal", attentionReason: null, updatedAt: now }).where(eq(bookings.reference, event.bookingReference));
    }
    if (input.action === "verify_event" && event.status === "completed") {
      const [a] = await getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id,event.assignmentId)).limit(1);
      if (a) await completeJourney(event.bookingReference,parseLeg(a.leg),"completed");
      await getDb().insert(bookingEvents).values({ bookingReference: event.bookingReference, eventType: "trip_completed_verified", providerEventId: `completed:${event.id}`, createdAt: now });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
