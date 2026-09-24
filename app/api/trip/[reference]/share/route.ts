import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingEvents } from "@/db/schema";
import { customerStage, shareLinkActive } from "@/lib/customer-trip-rules";
import { activeAssignment, createShareToken, resolveTripAccess } from "@/lib/trip-access";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Owner-only: create a view-only link for family or friends, or stop every link shared so far.
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const reference = (await context.params).reference.toUpperCase();
  const resolved = await resolveTripAccess(request, reference);
  if (!resolved || resolved.access !== "owner") return NextResponse.json({ error: "Only the person who booked can share this trip." }, { status: 403 });
  const input = (await request.json().catch(() => ({}))) as { action?: string };
  const now = new Date();
  if (input.action === "revoke") {
    await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "trip_share_revoked", providerEventId: `trip-share-revoked:${reference}:${now.getTime()}`, createdAt: now.toISOString() });
    return NextResponse.json({ ok: true });
  }
  if (input.action !== "create") return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const assignment = await activeAssignment(reference);
  const stage = customerStage(resolved.booking.status, assignment?.currentStatus);
  if (stage === "cancelled" || stage === "no_show" || !shareLinkActive({ booking: resolved.booking, stage, completedAt: assignment?.completedAt, now: now.getTime() })) {
    return NextResponse.json({ error: "This trip can no longer be shared." }, { status: 409 });
  }
  const token = await createShareToken(reference, now.getTime() + 1);
  await getDb().insert(bookingEvents).values({ bookingReference: reference, eventType: "trip_share_created", providerEventId: `trip-share-created:${reference}:${now.getTime()}`, createdAt: now.toISOString() });
  return NextResponse.json({ ok: true, url: `${new URL(request.url).origin}/trip/${reference}?share=${token}` });
}
