import { evidenceDb } from "@/lib/trip-evidence";
import { completeJourney, parseLeg } from "@/lib/journey-legs";
import { verifyTripCompletion } from "@/lib/trip-completion";
import { postJobCompleted, REPAIR_WINDOW_MS } from "@/lib/telegram/trip-photos";

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

/** Completes the journey if all three photos are in. Returns true when it was completed now; the Telegram
 * group then gets a "Completed job" message with the three photos. */
export async function completeIfEvidenceFilled(reference: string, legValue: string, by: string): Promise<boolean> {
  const done = await closeIfFilled(reference, parseLeg(legValue), by);
  if (done) await postJobCompleted(reference, parseLeg(legValue)).catch((e) => console.error("Telegram completed job message failed", e));
  return done;
}

/** Journeys whose three photos were all in before this check existed (or whose check failed): every few minutes. */
export async function completeFilledJourneys(now = Date.now()) {
  const { results } = await evidenceDb().prepare(`SELECT x.booking_reference AS reference, x.leg FROM (
      SELECT booking_reference, leg, step FROM admin_evidence_photos
      UNION SELECT e.booking_reference, e.leg, COALESCE(s.status, CASE WHEN e.event_type='dropoff' THEN 'completed' END)
        FROM driver_trip_evidence e LEFT JOIN driver_status_events s ON s.id=e.status_event_id WHERE e.deleted_at IS NULL
    ) x JOIN bookings b ON b.reference=x.booking_reference AND b.status='confirmed'
    WHERE x.step IN ('standby','trip_started','completed')
      AND NOT EXISTS(SELECT 1 FROM journey_legs j WHERE j.booking_reference=x.booking_reference AND j.leg=x.leg AND j.status IN ('completed','no_show'))
    GROUP BY x.booking_reference, x.leg HAVING COUNT(DISTINCT x.step)=3 LIMIT 20`).all<{ reference: string; leg: string }>();
  for (const j of results) await completeIfEvidenceFilled(j.reference, j.leg, "auto:evidence").catch((e) => console.error("Auto-complete failed", j.reference, e));
  // Completed journeys whose "Completed job" message may not have been queued: only recent ones (older ones are history).
  const finished=(await evidenceDb().prepare("SELECT booking_reference AS reference,leg FROM journey_legs WHERE status='completed' AND updated_at>? ORDER BY updated_at DESC LIMIT 20").bind(new Date(now - REPAIR_WINDOW_MS).toISOString()).all<{reference:string;leg:string}>()).results;
  for (const j of finished) await postJobCompleted(j.reference,j.leg).catch(()=>undefined);
}

async function closeIfFilled(reference: string, leg: "outbound" | "return", by: string): Promise<boolean> {
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

/** The driver's step: complete without the album yet (the Drop photo is posted first). Returns the leg when completed now. */
export async function closeEvidenceJourney(reference: string, legValue: string): Promise<"outbound" | "return" | null> {
  const leg = parseLeg(legValue);
  return (await closeIfFilled(reference, leg, "auto:evidence")) ? leg : null;
}
