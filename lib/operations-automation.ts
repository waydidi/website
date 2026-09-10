import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookingNotifications, bookings, drivers, operationsAlerts } from "@/db/schema";
import { sendCustomerTripReminder, sendDriverTripReminder, sendLateJourneyAlert } from "@/lib/email";
import { DEFAULT_ROUTE_SECONDS, pickupTimestamp } from "@/lib/operations-calendar";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const MAX_NOTIFICATION_ATTEMPTS = 3;

type Booking = typeof bookings.$inferSelect;
type Assignment = typeof bookingAssignments.$inferSelect;
type Driver = typeof drivers.$inferSelect;
type Delivery = { status: "sent" | "failed" | "pending_configuration" };

type AlertDefinition = {
  type: string;
  severity: "warning" | "critical";
  title: string;
  details: string;
  expectedAt: number;
};

export type AutomationSummary = {
  scanned: number;
  notificationsSent: number;
  notificationsFailed: number;
  alertsOpened: number;
  alertsResolved: number;
  runAt: string;
};

function bangkokDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function reminderInput(booking: Booking) {
  return {
    reference: booking.reference,
    pickup: booking.pickup,
    dropoff: booking.dropoff,
    pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime,
    vehicle: booking.vehicle,
  };
}

async function deliverNotification(input: {
  booking: Booking;
  assignmentId?: string | null;
  notificationType: string;
  recipient: string;
  scheduledFor: number;
  send: () => Promise<Delivery>;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const dedupeKey = `${input.notificationType}:${input.booking.reference}${input.assignmentId ? `:${input.assignmentId}` : ""}`;
  await db.insert(bookingNotifications).values({
    id: crypto.randomUUID(),
    bookingReference: input.booking.reference,
    assignmentId: input.assignmentId ?? null,
    notificationType: input.notificationType,
    channel: "email",
    recipient: input.recipient,
    dedupeKey,
    scheduledFor: new Date(input.scheduledFor).toISOString(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  const [notification] = await db.select().from(bookingNotifications).where(eq(bookingNotifications.dedupeKey, dedupeKey)).limit(1);
  if (!notification || notification.status === "sent" || notification.attemptCount >= MAX_NOTIFICATION_ATTEMPTS) return "skipped" as const;
  if (notification.lastAttemptAt && Date.now() - new Date(notification.lastAttemptAt).getTime() < 10 * MINUTE) return "skipped" as const;

  await db.update(bookingNotifications).set({ status: "processing", attemptCount: notification.attemptCount + 1, lastAttemptAt: now, updatedAt: now }).where(eq(bookingNotifications.id, notification.id));
  const delivery = await input.send();
  const sent = delivery.status === "sent";
  await db.update(bookingNotifications).set({
    status: sent ? "sent" : "failed",
    sentAt: sent ? now : null,
    errorMessage: sent ? null : delivery.status,
    updatedAt: now,
  }).where(eq(bookingNotifications.id, notification.id));
  return sent ? "sent" as const : "failed" as const;
}

function activeAlert(booking: Booking, assignment: Assignment | undefined, now: number): AlertDefinition | null {
  const pickup = pickupTimestamp(booking.pickupDate, booking.pickupTime);
  const remaining = pickup - now;
  if (!assignment && remaining > 0 && remaining <= 24 * HOUR) {
    return { type: "unassigned_24h", severity: "warning", title: "Driver assignment needed", details: "Pickup is within 24 hours and no active driver is assigned.", expectedAt: pickup };
  }
  if (!assignment) return null;
  if (remaining > 0 && remaining <= HOUR && assignment.currentStatus === "assigned") {
    return { type: "driver_not_started", severity: "warning", title: "Driver has not started", details: "Pickup is within 60 minutes and the driver has not started the standby journey.", expectedAt: pickup - HOUR };
  }
  if (now >= pickup + 15 * MINUTE && ["assigned", "going_to_standby"].includes(assignment.currentStatus)) {
    return { type: "standby_late", severity: "critical", title: "Driver is late to standby", details: "The driver is not marked as standing by 15 minutes after pickup time.", expectedAt: pickup + 15 * MINUTE };
  }
  const expectedDropoff = pickup + Math.max(15 * MINUTE, (booking.routeDurationSeconds ?? DEFAULT_ROUTE_SECONDS) * 1000);
  if (now >= expectedDropoff + 30 * MINUTE && assignment.currentStatus === "passenger_picked_up") {
    return { type: "dropoff_late", severity: "critical", title: "Drop-off is overdue", details: "The journey is still active 30 minutes after the estimated drop-off time.", expectedAt: expectedDropoff + 30 * MINUTE };
  }
  return null;
}

async function openAlert(booking: Booking, assignment: Assignment | undefined, alert: AlertDefinition, now: string) {
  const db = getDb();
  const dedupeKey = `${alert.type}:${booking.reference}:${assignment?.id ?? "unassigned"}`;
  await db.insert(operationsAlerts).values({
    id: crypto.randomUUID(), bookingReference: booking.reference, assignmentId: assignment?.id ?? null,
    alertType: alert.type, severity: alert.severity, title: alert.title, details: alert.details,
    dedupeKey, status: "open", expectedAt: new Date(alert.expectedAt).toISOString(), detectedAt: now, createdAt: now, updatedAt: now,
  }).onConflictDoNothing();
  const [row] = await db.select().from(operationsAlerts).where(eq(operationsAlerts.dedupeKey, dedupeKey)).limit(1);
  if (!row || row.detectedAt !== now) return false;
  await sendLateJourneyAlert({ ...reminderInput(booking), alertType: alert.type, title: alert.title, details: alert.details });
  return true;
}

export async function runOperationsAutomation(at = new Date()): Promise<AutomationSummary> {
  const db = getDb();
  const nowMs = at.getTime();
  const now = at.toISOString();
  const today = bangkokDate(nowMs);
  const bookingRows = await db.select().from(bookings).where(and(eq(bookings.status, "confirmed"), gte(bookings.pickupDate, addDays(today, -1)), lte(bookings.pickupDate, addDays(today, 2))));
  const references = bookingRows.map((booking) => booking.reference);
  const assignmentRows = references.length ? await db.select().from(bookingAssignments).where(and(inArray(bookingAssignments.bookingReference, references), isNull(bookingAssignments.revokedAt))) : [];
  const driverRows = await db.select().from(drivers);
  const assignmentByBooking = new Map<string, Assignment>();
  for (const row of assignmentRows) if (!assignmentByBooking.has(row.bookingReference)) assignmentByBooking.set(row.bookingReference, row);
  const driverById = new Map<string, Driver>(driverRows.map((driver) => [driver.id, driver]));
  const summary: AutomationSummary = { scanned: bookingRows.length, notificationsSent: 0, notificationsFailed: 0, alertsOpened: 0, alertsResolved: 0, runAt: now };

  for (const booking of bookingRows) {
    const pickup = pickupTimestamp(booking.pickupDate, booking.pickupTime);
    const remaining = pickup - nowMs;
    const assignment = assignmentByBooking.get(booking.reference);
    const common = reminderInput(booking);
    const deliveries: Array<Promise<"sent" | "failed" | "skipped">> = [];
    if (remaining > 3 * HOUR && remaining <= 24 * HOUR) {
      deliveries.push(deliverNotification({ booking, notificationType: "customer_24h", recipient: booking.customerEmail, scheduledFor: pickup - 24 * HOUR, send: () => sendCustomerTripReminder({ ...common, to: booking.customerEmail, name: booking.customerName, hoursBefore: 24 }) }));
    }
    if (remaining > 0 && remaining <= 3 * HOUR) {
      deliveries.push(deliverNotification({ booking, notificationType: "customer_3h", recipient: booking.customerEmail, scheduledFor: pickup - 3 * HOUR, send: () => sendCustomerTripReminder({ ...common, to: booking.customerEmail, name: booking.customerName, hoursBefore: 3 }) }));
      const driver = assignment ? driverById.get(assignment.driverId) : undefined;
      if (assignment && driver?.email && driver.remindersEnabled) deliveries.push(deliverNotification({ booking, assignmentId: assignment.id, notificationType: "driver_3h", recipient: driver.email, scheduledFor: pickup - 3 * HOUR, send: () => sendDriverTripReminder({ ...common, to: driver.email!, driverName: driver.fullName }) }));
    }
    for (const result of await Promise.all(deliveries)) {
      if (result === "sent") summary.notificationsSent += 1;
      if (result === "failed") summary.notificationsFailed += 1;
    }
    const alert = activeAlert(booking, assignment, nowMs);
    if (alert && await openAlert(booking, assignment, alert, now)) summary.alertsOpened += 1;
  }

  const unresolved = await db.select().from(operationsAlerts).where(inArray(operationsAlerts.status, ["open", "acknowledged"]));
  const bookingMap = new Map(bookingRows.map((booking) => [booking.reference, booking]));
  for (const alert of unresolved) {
    const booking = bookingMap.get(alert.bookingReference);
    const assignment = booking ? assignmentByBooking.get(booking.reference) : undefined;
    const current = booking ? activeAlert(booking, assignment, nowMs) : null;
    const currentKey = current && `${current.type}:${booking!.reference}:${assignment?.id ?? "unassigned"}`;
    if (currentKey === alert.dedupeKey) continue;
    await db.update(operationsAlerts).set({ status: "resolved", resolvedAt: now, resolutionNote: "Automatically resolved after the journey state changed.", updatedAt: now }).where(eq(operationsAlerts.id, alert.id));
    summary.alertsResolved += 1;
  }
  return summary;
}
