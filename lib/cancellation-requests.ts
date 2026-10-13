import { ensureReliabilityTables, reliabilityDb } from "@/lib/telegram/reliability-db";
export async function requestCancellation(reference:string) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),id=crypto.randomUUID(),at=new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO booking_cancellation_requests(id,booking_reference,requested_at,policy_version)
    SELECT ?,?,?,(SELECT version FROM booking_policy_snapshots WHERE booking_reference=?) FROM bookings WHERE reference=? AND status='confirmed' AND binned_at IS NULL`).bind(id,reference,at,reference,reference).run();
  return db.prepare("SELECT * FROM booking_cancellation_requests WHERE booking_reference=? AND status='pending'").bind(reference).first<{id:string;booking_reference:string;requested_at:string;policy_version:string|null;status:string}>();
}
export async function recoverCancellationCards() {
  await ensureReliabilityTables();
  const rows=(await reliabilityDb().prepare("SELECT booking_reference FROM booking_cancellation_requests WHERE status='pending' ORDER BY requested_at LIMIT 20").all<{booking_reference:string}>()).results;
  const {notifyCancellationRequest}=await import("@/lib/telegram/booking-changes");
  for (const row of rows) await notifyCancellationRequest(row.booking_reference);
}
