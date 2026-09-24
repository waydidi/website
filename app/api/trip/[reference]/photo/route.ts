import { env } from "cloudflare:workers";
import { and, asc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { driverStatusEvents } from "@/db/schema";
import { customerStage, shareLinkActive } from "@/lib/customer-trip-rules";
import { activeAssignment, resolveTripAccess } from "@/lib/trip-access";

// The driver's "waiting at pickup" photo, shown to the customer so they can spot the car.
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const reference = (await context.params).reference.toUpperCase();
  const resolved = await resolveTripAccess(request, reference);
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const assignment = await activeAssignment(reference);
  const stage = customerStage(resolved.booking.status, assignment?.currentStatus);
  if (!assignment || stage !== "waiting") return NextResponse.json({ error: "Not available." }, { status: 404 });
  if (resolved.access === "shared" && !shareLinkActive({ booking: resolved.booking, stage, completedAt: assignment.completedAt, now: Date.now() })) return NextResponse.json({ error: "Expired." }, { status: 410 });
  const [event] = await getDb().select().from(driverStatusEvents)
    .where(and(eq(driverStatusEvents.assignmentId, assignment.id), eq(driverStatusEvents.status, "standby"), ne(driverStatusEvents.verificationStatus, "rejected")))
    .orderBy(asc(driverStatusEvents.createdAt)).limit(1);
  if (!event?.evidenceKey || !env.BUCKET) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const object = await env.BUCKET.get(event.evidenceKey);
  if (!object) return NextResponse.json({ error: "Not available." }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": event.evidenceMime ?? "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
