import { env } from "cloudflare:workers";
import type { SecurityDatabase } from "@/lib/worker-db";
import { deleteFile } from "@/lib/file-store";
import type { EvidencePolicy } from "@/lib/evidence-rules";
export const evidenceDb = () => env.DB as SecurityDatabase;
export type EvidenceRow = { id: string; assignment_id: string; booking_reference: string; leg: string; driver_id: string; event_type: "pickup" | "dropoff"; status_event_id: string | null; device_captured_at: string; received_at: string; confirmed_at: string | null; latitude: number | null; longitude: number | null; accuracy_metres: number | null; original_key: string; stamped_key: string; expires_at: string; deleted_at: string | null };
export async function evidencePolicy() {
  const policy = await evidenceDb().prepare("SELECT * FROM driver_evidence_policy WHERE id=1").first<EvidencePolicy>();
  if (!policy) throw new Error("Evidence migration required");
  return policy;
}
export async function evidenceOverride(assignmentId: string, type: string) {
  return evidenceDb().prepare("SELECT reason,actor,created_at FROM driver_evidence_overrides WHERE assignment_id=? AND event_type=?").bind(assignmentId,type).first<{reason:string;actor:string;created_at:string}>();
}
export function safeEvidence(row: EvidenceRow) {
  const { original_key, stamped_key, ...safe } = row;
  void original_key; void stamped_key;
  return safe;
}
export async function cleanupTripEvidence() {
  const db = evidenceDb();
  const now = new Date().toISOString();
  const {results} = await db.prepare("SELECT * FROM driver_trip_evidence WHERE expires_at<=? AND deleted_at IS NULL LIMIT 20").bind(now).all<EvidenceRow>();
  for (const row of results) {
    await deleteFile(row.original_key); await deleteFile(row.stamped_key);
    await db.prepare("UPDATE driver_trip_evidence SET deleted_at=?,latitude=NULL,longitude=NULL,accuracy_metres=NULL WHERE id=? AND deleted_at IS NULL").bind(now,row.id).run();
  }
}
