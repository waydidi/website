import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { journeyExceptions, journeyStopDeclarations } from "@/db/schema";
import { activeAssignmentForToken } from "@/lib/driver-operations";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const REASONS = new Set(["rest_stop", "fuel", "passenger_request", "traffic_police", "other"]);

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json() as { token?: string; action?: string; reason?: string; note?: string };
  const assignment = await activeAssignmentForToken(input.token ?? "");
  if (!assignment) return NextResponse.json({ error: "Driver session unavailable." }, { status: 404 });
  if (!["trip_started", "passenger_picked_up"].includes(assignment.currentStatus)) return NextResponse.json({ error: "Stops can only be reported during an active trip." }, { status: 409 });
  const now = new Date().toISOString();
  if (input.action === "clear") {
    await getDb().update(journeyStopDeclarations).set({ clearedAt: now }).where(and(eq(journeyStopDeclarations.assignmentId, assignment.id), isNull(journeyStopDeclarations.clearedAt)));
    return NextResponse.json({ ok: true });
  }
  const reason = input.reason ?? "";
  const note = input.note?.trim() ?? "";
  if (!REASONS.has(reason) || note.length > 300 || (reason === "other" && note.length < 3)) return NextResponse.json({ error: "Choose a stop reason and add a short note when selecting Other." }, { status: 400 });
  const declarationId = crypto.randomUUID();
  const [openException] = await getDb().select().from(journeyExceptions).where(and(eq(journeyExceptions.assignmentId, assignment.id), eq(journeyExceptions.exceptionType, "abnormal_stop"), eq(journeyExceptions.status, "open"))).limit(1);
  const statements = [
    env.DB.prepare(`UPDATE journey_stop_declarations SET cleared_at = ? WHERE assignment_id = ? AND cleared_at IS NULL`).bind(now, assignment.id),
    env.DB.prepare(`INSERT INTO journey_stop_declarations (id, booking_reference, assignment_id, reason, note, declared_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(declarationId, assignment.bookingReference, assignment.id, reason, note || null, now),
    env.DB.prepare(`INSERT INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'driver_stop_declared', ?, ?)`).bind(assignment.bookingReference, `driver-stop:${declarationId}`, now),
  ];
  if (openException) {
    statements.push(
      env.DB.prepare(`UPDATE journey_exceptions SET status = 'resolved', stop_reason = ?, last_seen_at = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'open'`).bind(reason, now, now, now, openException.id),
      env.DB.prepare(`INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'abnormal_stop_resolved', ?, ?)`).bind(assignment.bookingReference, `abnormal-stop-explained:${openException.id}`, now),
    );
  }
  await env.DB.batch(statements);
  return NextResponse.json({ ok: true, declaration: { id: declarationId, reason, note: note || null, declaredAt: now } });
}
