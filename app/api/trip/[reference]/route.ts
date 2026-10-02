import { asc, desc, eq } from "drizzle-orm";
import { journeyFor, journeysFor, parseLeg } from "@/lib/journey-legs";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookings, driverStatusEvents, journeyLocations, drivers } from "@/db/schema";
import { CUSTOMER_STAGES, customerStage, etaTarget, freshLocation, locationVisible, shareLinkActive, STAGE_DRIVER_STATUSES, type CustomerStage } from "@/lib/customer-trip-rules";
import { activeAssignment, resolveTripAccess } from "@/lib/trip-access";
import { tripEta } from "@/lib/trip-eta";

type Booking = typeof bookings.$inferSelect;

function point(latitude: number | null, longitude: number | null) {
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const reference = (await context.params).reference.toUpperCase();
  const resolved = await resolveTripAccess(request, reference);
  if (!resolved) return NextResponse.json({ error: "We could not find this trip. Check the link in your email." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { access } = resolved;
  const now = Date.now();
  const leg = parseLeg(new URL(request.url).searchParams.get("leg"));
  const journey = await journeyFor(resolved.booking,leg);
  if (!journey) return NextResponse.json({error:"Journey not found."},{status:404});
  const assignment = await activeAssignment(reference,leg);
  const booking = journey;
  const stage = customerStage(booking.status, assignment?.currentStatus);
  if (access === "shared" && !shareLinkActive({ booking, stage, completedAt: assignment?.completedAt, now })) {
    return NextResponse.json({ error: "This shared trip link has expired." }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }

  const events = assignment
    ? await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.assignmentId, assignment.id)).orderBy(asc(driverStatusEvents.createdAt))
    : [];
  const accepted = events.filter((event) => event.verificationStatus !== "rejected");
  const timeline = CUSTOMER_STAGES.map((item) => ({ stage: item, at: stageTime(item, booking, assignment, accepted) }));

  let location: { latitude: number; longitude: number; accuracyMetres: number; at: string } | null = null;
  let eta = null;
  let freshness: {at:string;ageSeconds:number;stale:boolean}|null=null;
  if (assignment && locationVisible(stage)) {
    const [latest] = await getDb().select().from(journeyLocations).where(eq(journeyLocations.assignmentId, assignment.id)).orderBy(desc(journeyLocations.serverTimestamp)).limit(1);
    if(latest) freshness={at:latest.serverTimestamp,ageSeconds:Math.max(0,Math.floor((now-Date.parse(latest.serverTimestamp))/1000)),stale:!freshLocation(latest,now)};
    const fresh = freshLocation(latest, now);
    if (fresh) location = { latitude: fresh.latitude, longitude: fresh.longitude, accuracyMetres: fresh.accuracyMetres, at: fresh.serverTimestamp };
    const target = etaTarget(stage);
    const destination = target === "pickup" ? point(booking.pickupLatitude, booking.pickupLongitude) : target === "dropoff" ? point(booking.dropoffLatitude, booking.dropoffLongitude) : null;
    if (location && target && destination) eta = await tripEta({ assignmentId: assignment.id, target, from: location, to: destination }).catch(() => null);
  }

  const [assignedDriver]=assignment?await getDb().select({name:drivers.fullName,phone:drivers.phone}).from(drivers).where(eq(drivers.id,assignment.driverId)).limit(1):[];
  const owner = access === "owner";
  const standby = accepted.find((event) => event.status === "standby");
  return NextResponse.json({
    leg, legs: (await journeysFor([resolved.booking])).map(j => ({leg:j.leg,status:j.status,pickupDate:j.pickupDate,pickupTime:j.pickupTime})),
    reference: booking.reference,
    access,
    stage,
    serviceType: booking.serviceType,
    bookedHours: booking.bookedHours,
    pickup: booking.pickup,
    dropoff: booking.dropoff,
    pickupDate: booking.pickupDate,
    pickupTime: booking.pickupTime,
    flightNumber: booking.flightNumber,
    pickupPoint: point(booking.pickupLatitude, booking.pickupLongitude),
    dropoffPoint: point(booking.dropoffLatitude, booking.dropoffLongitude),
    meetingPoint: booking.pickupInstructions,
    pickupSign: owner ? booking.pickupSign || booking.customerName : null,
    timeline,
    location,
    freshness,
    driver: owner ? assignedDriver ?? null : null,
    eta,
    standbyPhoto: stage === "waiting" && Boolean(standby?.evidenceKey),
    canShare: owner && !["cancelled", "no_show"].includes(stage) && shareLinkActive({ booking, stage, completedAt: assignment?.completedAt, now }),
    updatedAt: new Date(now).toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

function stageTime(
  stage: CustomerStage,
  booking: Booking,
  assignment: typeof bookingAssignments.$inferSelect | null,
  events: Array<typeof driverStatusEvents.$inferSelect>,
) {
  if (stage === "confirmed") return booking.fulfillmentStartedAt ?? booking.createdAt;
  if (stage === "assigned") return assignment?.assignedAt ?? null;
  const statuses = STAGE_DRIVER_STATUSES[stage] ?? [];
  const event = events.find((item) => statuses.includes(item.status));
  if (event) return event.createdAt;
  return stage === "arrived" && booking.status === "completed" ? booking.updatedAt : null;
}
