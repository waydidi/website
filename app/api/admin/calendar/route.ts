import { assignmentTelegramNotification, deliverAssignmentTelegram } from "@/lib/telegram/assignments";
import { journeysFor, journeyFor, parseLeg } from "@/lib/journey-legs";
import { driverTokenForAssignment } from "@/lib/trip-links";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  bookingAssignments,
  bookingEvents,
  bookingNotifications,
  bookings,
  drivers,
  driverAvailability,
  driverStatusEvents,
  operationsCalendarEvents,
  operationsAlerts,
} from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { sendDriverAssignmentEmail } from "@/lib/email";
import {
  attentionForJourney,
  bookingWindow,
  pickupTimestamp,
  rangesOverlap,
  validCalendarDate,
  validCalendarTimestamp,
} from "@/lib/operations-calendar";
import { isJsonRequest, safeOrigin, sameOrigin, secureToken, sha256 } from "@/lib/security";

const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "completed", "no_show", "cancelled"]);

function rangeInstants(from: string, to: string) {
  return {
    startsAt: new Date(`${from}T00:00:00+07:00`).toISOString(),
    endsAt: new Date(`${to}T23:59:59+07:00`).toISOString(),
  };
}


function textValue(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!validCalendarDate(from) || !validCalendarDate(to)) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  const rangeStart = new Date(`${from}T00:00:00+07:00`).getTime();
  const rangeEnd = new Date(`${to}T23:59:59+07:00`).getTime();
  if (rangeEnd < rangeStart || rangeEnd - rangeStart > 93 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Choose a date range of 93 days or less." }, { status: 400 });
  const instants = rangeInstants(from, to);

  const [parentRows, scheduleParentRows, driverRows, assignmentRows, eventRows, availabilityRows, calendarRows, alertRows, notificationRows] = await Promise.all([
    getDb().select().from(bookings),
    getDb().select().from(bookings),
    getDb().select().from(drivers).orderBy(drivers.fullName),
    getDb().select().from(bookingAssignments).where(isNull(bookingAssignments.revokedAt)).orderBy(desc(bookingAssignments.assignedAt)),
    getDb().select().from(driverStatusEvents).where(gte(driverStatusEvents.createdAt, new Date(rangeStart - 7 * 24 * 60 * 60 * 1000).toISOString())).orderBy(desc(driverStatusEvents.createdAt)).limit(1000),
    getDb().select().from(driverAvailability).where(and(lte(driverAvailability.startsAt, instants.endsAt), gte(driverAvailability.endsAt, instants.startsAt))).orderBy(driverAvailability.startsAt),
    getDb().select().from(operationsCalendarEvents).where(and(lte(operationsCalendarEvents.startsAt, instants.endsAt), gte(operationsCalendarEvents.endsAt, instants.startsAt))).orderBy(operationsCalendarEvents.startsAt),
    getDb().select().from(operationsAlerts).where(and(gte(operationsAlerts.detectedAt, new Date(rangeStart - 7 * 24 * 60 * 60 * 1000).toISOString()), lte(operationsAlerts.detectedAt, instants.endsAt))).orderBy(desc(operationsAlerts.detectedAt)).limit(500),
    getDb().select().from(bookingNotifications).where(and(gte(bookingNotifications.createdAt, new Date(rangeStart - 2 * 24 * 60 * 60 * 1000).toISOString()), lte(bookingNotifications.createdAt, instants.endsAt))).orderBy(desc(bookingNotifications.createdAt)).limit(500),
  ]);

  const leg = parseLeg(url.searchParams.get("leg"));
  const bookingRows = (await journeysFor(parentRows)).filter(j => j.leg === leg && j.pickupDate >= from && j.pickupDate <= to);
  const scheduleBookingRows = await journeysFor(scheduleParentRows);
  const activeAssignments = new Map<string, typeof assignmentRows[number]>();
  for (const assignment of assignmentRows.filter(a => a.leg === leg)) if (!activeAssignments.has(assignment.bookingReference)) activeAssignments.set(assignment.bookingReference, assignment);
  const bookingByReference = new Map(scheduleBookingRows.map((booking) => [booking.journeyId, booking]));
  const conflicts = new Map<string, string[]>();
  const assigned = assignmentRows.map((assignment) => ({ assignment, booking: bookingByReference.get(`${assignment.bookingReference}:${assignment.leg}`) })).filter((row): row is { assignment: typeof assignmentRows[number]; booking: typeof bookingRows[number] } => Boolean(row.booking));
  for (let index = 0; index < assigned.length; index += 1) {
    const left = assigned[index];
    const leftWindow = bookingWindow(left.booking);
    for (let next = index + 1; next < assigned.length; next += 1) {
      const right = assigned[next];
      if (left.assignment.driverId !== right.assignment.driverId) continue;
      const rightWindow = bookingWindow(right.booking);
      if (!rangesOverlap(leftWindow.startsAt, leftWindow.endsAt, rightWindow.startsAt, rightWindow.endsAt)) continue;
      conflicts.set(left.booking.journeyId, [...(conflicts.get(left.booking.journeyId) ?? []), `Overlaps ${right.booking.reference}`]);
      conflicts.set(right.booking.journeyId, [...(conflicts.get(right.booking.journeyId) ?? []), `Overlaps ${left.booking.reference}`]);
    }
  }
  for (const { assignment, booking } of assigned) {
    const window = bookingWindow(booking);
    for (const unavailable of availabilityRows.filter((row) => row.driverId === assignment.driverId)) {
      if (rangesOverlap(window.startsAt, window.endsAt, new Date(unavailable.startsAt).getTime(), new Date(unavailable.endsAt).getTime())) {
        conflicts.set(booking.journeyId, [...(conflicts.get(booking.journeyId) ?? []), unavailable.reason ? `Driver unavailable: ${unavailable.reason}` : "Driver unavailable"]);
      }
    }
  }

  const responseBookings = bookingRows.filter((row) => ACTIVE_BOOKING_STATUSES.has(row.status)).map((row) => {
    const assignment = activeAssignments.get(row.reference);
    const pendingEvidence = eventRows.filter((event) => event.assignmentId === assignment?.id && event.verificationStatus === "pending_review").length;
    const window = bookingWindow(row);
    const bookingConflicts = conflicts.get(row.journeyId) ?? [];
    const attention = attentionForJourney({ bookingStatus: row.status, attentionStatus: row.attentionStatus, pickup: window.pickup, assignmentStatus: assignment?.currentStatus, hasAssignment: Boolean(assignment), pendingEvidence, hasConflict: bookingConflicts.length > 0 });
    return {
      serviceType: row.serviceType,
      reference: row.reference,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      pickup: row.pickup,
      dropoff: row.dropoff,
      pickupDate: row.pickupDate,
      pickupTime: row.pickupTime,
      passengers: row.passengers,
      luggage: row.luggage,
      flightNumber: row.flightNumber,
      vehicle: row.vehicle,
      total: row.total,
      paymentMethod: row.paymentMethod,
      status: row.status,
      emailStatus: row.emailStatus,
      pricingArea: row.pricingArea,
      routeDistanceMeters: row.routeDistanceMeters,
      routeDurationSeconds: row.routeDurationSeconds,
      preparationBufferMinutes: row.preparationBufferMinutes,
      postTripBufferMinutes: row.postTripBufferMinutes,
      attentionStatus: row.attentionStatus,
      attentionReason: row.attentionReason,
      internalNotes: row.internalNotes,
      operationalStartsAt: new Date(window.startsAt).toISOString(),
      operationalEndsAt: new Date(window.endsAt).toISOString(),
      durationEstimated: window.estimated,
      assignment: assignment ? { id: assignment.id, driverId: assignment.driverId, currentStatus: assignment.currentStatus, assignedAt: assignment.assignedAt, tokenExpiresAt: assignment.tokenExpiresAt } : null,
      pendingEvidence,
      conflicts: bookingConflicts,
      attention,
    };
  });

  return NextResponse.json({
    timezone: "Asia/Bangkok",
    bookings: responseBookings,
    drivers: driverRows.map((row) => ({ id: row.id, fullName: row.fullName, phone: row.phone, email: row.email, remindersEnabled: row.remindersEnabled, status: row.status })),
    availability: availabilityRows,
    calendarEvents: calendarRows,
    alerts: alertRows,
    notifications: notificationRows,
    refreshedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json() as Record<string, unknown>;
  const action = textValue(input.action, 40);
  const now = new Date().toISOString();

  if (action === "update_booking") {
    const reference = textValue(input.bookingReference, 40);
    const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const leg = parseLeg(input.leg);
    const journey = await journeyFor(booking,leg);
    if (!journey || journey.status !== "confirmed") return NextResponse.json({error:"Only active journeys can be rescheduled."},{status:409});
    const attentionStatus = input.attentionStatus === "attention" ? "attention" : "normal";
    const attentionReason = textValue(input.attentionReason, 300) || null;
    const internalNotes = textValue(input.internalNotes, 2000) || null;
    const pickupDate = textValue(input.pickupDate, 10) || journey.pickupDate;
    const pickupTime = textValue(input.pickupTime, 5) || journey.pickupTime;
    const preparationBufferMinutes = Math.min(240, Math.max(0, Number(input.preparationBufferMinutes ?? booking.preparationBufferMinutes)));
    const postTripBufferMinutes = Math.min(240, Math.max(0, Number(input.postTripBufferMinutes ?? booking.postTripBufferMinutes)));
    if (!validCalendarDate(pickupDate) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(pickupTime)) return NextResponse.json({ error: "Choose a valid pickup date and time." }, { status: 400 });
    if (!Number.isInteger(preparationBufferMinutes) || !Number.isInteger(postTripBufferMinutes)) return NextResponse.json({ error: "Buffers must be whole minutes." }, { status: 400 });
    const schedule = leg === "return" ? {returnDate:pickupDate,returnTime:pickupTime} : {pickupDate,pickupTime};
    await getDb().update(bookings).set({ ...schedule, attentionStatus, attentionReason, internalNotes, preparationBufferMinutes, postTripBufferMinutes, updatedAt: now }).where(eq(bookings.reference, reference));
    if (pickupDate !== journey.pickupDate || pickupTime !== journey.pickupTime) {
      const tokenExpiresAt = new Date(Math.max(Date.now() + 48 * 60 * 60 * 1000, pickupTimestamp(pickupDate, pickupTime) + 24 * 60 * 60 * 1000)).toISOString();
      await getDb().update(bookingAssignments).set({ tokenExpiresAt, updatedAt: now }).where(and(eq(bookingAssignments.bookingReference, reference), eq(bookingAssignments.leg,leg), isNull(bookingAssignments.revokedAt)));
    }
    await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "operations_updated", providerEventId: `operations:${crypto.randomUUID()}`, createdAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action === "create_availability") {
    const driverId = textValue(input.driverId, 80);
    const startsAt = textValue(input.startsAt, 40);
    const endsAt = textValue(input.endsAt, 40);
    const reason = textValue(input.reason, 300) || null;
    const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
    if (!driver || !validCalendarTimestamp(startsAt) || !validCalendarTimestamp(endsAt) || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return NextResponse.json({ error: "Choose a driver and a valid unavailable period." }, { status: 400 });
    if (new Date(endsAt).getTime() - new Date(startsAt).getTime() > 31 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: "An unavailable period cannot exceed 31 days." }, { status: 400 });
    const row = { id: crypto.randomUUID(), driverId, startsAt, endsAt, availabilityType: "unavailable", reason, createdBy: admin.email, createdAt: now };
    await getDb().insert(driverAvailability).values(row);
    return NextResponse.json({ availability: row });
  }

  if (action === "delete_availability") {
    const id = textValue(input.id, 80);
    await getDb().delete(driverAvailability).where(eq(driverAvailability.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "create_event") {
    const title = textValue(input.title, 120);
    const startsAt = textValue(input.startsAt, 40);
    const endsAt = textValue(input.endsAt, 40);
    const notes = textValue(input.notes, 1000) || null;
    const driverId = textValue(input.driverId, 80) || null;
    if (title.length < 2 || !validCalendarTimestamp(startsAt) || !validCalendarTimestamp(endsAt) || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return NextResponse.json({ error: "Add a title and a valid time period." }, { status: 400 });
    if (driverId) {
      const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
      if (!driver) return NextResponse.json({ error: "Driver not found." }, { status: 404 });
    }
    const row = { id: crypto.randomUUID(), eventType: "operations_note", title, startsAt, endsAt, driverId, notes, createdBy: admin.email, createdAt: now };
    await getDb().insert(operationsCalendarEvents).values(row);
    return NextResponse.json({ calendarEvent: row });
  }

  if (action === "delete_event") {
    const id = textValue(input.id, 80);
    await getDb().delete(operationsCalendarEvents).where(eq(operationsCalendarEvents.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "assign_driver") {
    const bookingReference = textValue(input.bookingReference, 40);
    const driverId = textValue(input.driverId, 80);
    const overrideConflict = input.overrideConflict === true;
    const [[parentBooking], [driver], activeAssignments, allBookingRows, unavailableRows] = await Promise.all([
      getDb().select().from(bookings).where(eq(bookings.reference, bookingReference)).limit(1),
      getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1),
      getDb().select().from(bookingAssignments).where(isNull(bookingAssignments.revokedAt)),
      getDb().select().from(bookings),
      getDb().select().from(driverAvailability).where(eq(driverAvailability.driverId, driverId)),
    ]);
    const leg = parseLeg(input.leg);
    const booking = parentBooking ? await journeyFor(parentBooking,leg) : null;
    if (!booking || booking.status !== "confirmed" || !driver || driver.status !== "active") return NextResponse.json({ error: "Choose a confirmed booking and active driver." }, { status: 409 });
    const candidateWindow = bookingWindow(booking);
    const bookingMap = new Map((await journeysFor(allBookingRows)).map((row) => [row.journeyId,row]));
    const conflictMessages: string[] = [];
    for (const assignment of activeAssignments.filter((row) => row.driverId === driverId && (row.bookingReference !== bookingReference || row.leg !== leg) && row.currentStatus !== "completed" && row.currentStatus !== "no_show")) {
      const assignedBooking = bookingMap.get(`${assignment.bookingReference}:${assignment.leg}`);
      if (!assignedBooking || assignedBooking.status !== "confirmed") continue;
      const assignedWindow = bookingWindow(assignedBooking);
      if (rangesOverlap(candidateWindow.startsAt, candidateWindow.endsAt, assignedWindow.startsAt, assignedWindow.endsAt)) conflictMessages.push(`Overlaps ${assignedBooking.reference} at ${assignedBooking.pickupTime}`);
    }
    for (const unavailable of unavailableRows) {
      if (rangesOverlap(candidateWindow.startsAt, candidateWindow.endsAt, new Date(unavailable.startsAt).getTime(), new Date(unavailable.endsAt).getTime())) conflictMessages.push(unavailable.reason ? `Driver unavailable: ${unavailable.reason}` : "Driver unavailable during this journey");
    }
    if (conflictMessages.length && !overrideConflict) return NextResponse.json({ error: "This driver has a schedule conflict.", conflicts: conflictMessages, canOverride: true }, { status: 409 });

    const token = await driverTokenForAssignment(bookingReference, leg);
    const expiry = new Date(Math.max(Date.now() + 48 * 60 * 60 * 1000, pickupTimestamp(booking.pickupDate, booking.pickupTime) + 24 * 60 * 60 * 1000)).toISOString();
    const assignment = { id: crypto.randomUUID(), bookingReference, leg, driverId, tokenHash: await sha256(token), currentStatus: "assigned", assignedBy: admin.email, assignedAt: now, tokenExpiresAt: expiry, updatedAt: now };
    await getDb().batch([
      getDb().update(bookingAssignments).set({revokedAt:now,updatedAt:now}).where(and(eq(bookingAssignments.bookingReference,bookingReference),eq(bookingAssignments.leg,leg),isNull(bookingAssignments.revokedAt))),
      getDb().insert(bookingAssignments).values(assignment),
      getDb().insert(bookingNotifications).values(assignmentTelegramNotification(assignment)),
    ]);
    await getDb().insert(bookingEvents).values({ bookingReference, eventType: overrideConflict && conflictMessages.length ? "driver_assigned_conflict_override" : "driver_assigned", providerEventId: `assignment:${assignment.id}`, createdAt: now });
    const driverUrl = `${safeOrigin(request)}/driver/trip/${token}`;
    const telegramNotification = await deliverAssignmentTelegram(assignment.id).catch(() => "queued");
    // Day trips from the planner: the stop-by-stop plan goes to the staff LINE group to forward.
    await import("@/lib/trip-driver").then((m) => m.sendDriverPlanToLine(bookingReference, driver.fullName, driverUrl)).catch((error) => console.error("driver plan LINE failed", error));
    if (driver.email && driver.remindersEnabled) {
      const delivery = await sendDriverAssignmentEmail({ to: driver.email, driverName: driver.fullName, driverUrl, reference: booking.reference, pickup: booking.pickup, dropoff: booking.dropoff, pickupDate: booking.pickupDate, pickupTime: booking.pickupTime, vehicle: booking.vehicle });
      await getDb().insert(bookingNotifications).values({ id: crypto.randomUUID(), bookingReference, assignmentId: assignment.id, notificationType: "driver_assignment", channel: "email", recipient: driver.email, dedupeKey: `driver-assignment:${assignment.id}`, scheduledFor: now, status: delivery.status === "sent" ? "sent" : "failed", attemptCount: 1, lastAttemptAt: now, sentAt: delivery.status === "sent" ? now : null, errorMessage: delivery.status === "sent" ? null : delivery.status, createdAt: now, updatedAt: now });
    }
    return NextResponse.json({ assignment: { id: assignment.id, bookingReference, driverId, currentStatus: "assigned", assignedAt: now, tokenExpiresAt: expiry }, driverUrl, telegramNotification, conflicts: conflictMessages });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
