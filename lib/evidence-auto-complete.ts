import { evidenceDb } from "@/lib/trip-evidence";
import { completeJourney, parseLeg } from "@/lib/journey-legs";
import { verifyTripCompletion } from "@/lib/trip-completion";

// When a journey has a photo for all three steps (Stand by, Pick up, Drop), from the driver or added
// by staff, it is completed automatically. For a round trip that moves the card to the second trip.
const STEPS = ["standby", "trip_started", "completed"] as const;

/** Steps of one journey that have a photo, counted the same way as the admin Evidence sheet. */
export async function filledSteps(reference: string, leg: string): Promise<Set<string>> {
  const driver = await evidenceDb().prepare(`SELECT DISTINCT COALESCE(s.status, CASE WHEN e.event_type='dropoff' THEN 'completed' END) AS step
    FROM driver_trip_evidence e LEFT JOIN driver_status_events s ON s.id=e.status_event_id
    WHERE e.booking_reference=? AND e.leg=? AND e.deleted_at IS NULL`).bind(reference, leg).all<{ step: string | null }>();
  const staff = await evidenceDb().prepare("SELECT DISTINCT step FROM admin_evidence_photos WHERE booking_reference=? AND leg=?").bind(reference, leg).all<{ step: string }>().catch(() => ({ results: [] as { step: string }[] }));
  return new Set([...driver.results, ...staff.results].map((r) => r.step).filter((s): s is string => Boolean(s)));
}

/** Completes the journey if all three photos are in. Returns true when it was completed now. */
export async function completeIfEvidenceFilled(reference: string, legValue: string, by: string): Promise<boolean> {
  const leg = parseLeg(legValue);
  const filled = await filledSteps(reference, leg);
  if (!STEPS.every((s) => filled.has(s))) return false;
  // The driver sent Drop: confirm it like "Completed job" (also tells the driver about payment).
  const drop = await evidenceDb().prepare(`SELECT s.id FROM driver_status_events s JOIN booking_assignments a ON a.id=s.assignment_id
    WHERE a.booking_reference=? AND a.leg=? AND a.revoked_at IS NULL AND s.status='completed' AND s.verification_status='pending_review'
    ORDER BY s.created_at DESC LIMIT 1`).bind(reference, leg).first<{ id: string }>();
  if (drop) return (await verifyTripCompletion(drop.id, by)).result === "done";
  // Otherwise staff filled the missing photos: close the journey and the driver's job.
  const open = await evidenceDb().prepare(`SELECT 1 AS n FROM bookings b WHERE b.reference=? AND b.status='confirmed'
    AND NOT EXISTS(SELECT 1 FROM journey_legs j WHERE j.booking_reference=b.reference AND j.leg=? AND j.status IN ('completed','no_show'))`).bind(reference, leg).first<{ n: number }>();
  if (!open) return false;
  const now = new Date().toISOString();
  await evidenceDb().prepare("UPDATE booking_assignments SET current_status='completed', completed_at=COALESCE(completed_at, ?), updated_at=? WHERE booking_reference=? AND leg=? AND revoked_at IS NULL AND current_status NOT IN ('completed','no_show')").bind(now, now, reference, leg).run();
  await completeJourney(reference, leg, "completed");
  await evidenceDb().prepare("INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'trip_completed_evidence', ?, ?)").bind(reference, `evidence:${reference}:${leg}`, now).run();
  return true;
}
