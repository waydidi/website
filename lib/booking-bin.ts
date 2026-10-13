import { ensureReliabilityTables, reliabilityDb } from "@/lib/telegram/reliability-db";

/** Expired bin entries are archived. Financial documents, policies and their parent identity stay immutable. */
export async function permanentlyDeleteBooking(reference:string) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),at=new Date().toISOString();
  const [saved]=await db.batch([
    db.prepare("INSERT OR IGNORE INTO booking_archives(booking_reference,archived_at) SELECT reference,? FROM bookings WHERE reference=? AND status='binned' AND purge_after<=?").bind(at,reference,at),
    db.prepare("UPDATE bookings SET purge_after=NULL,updated_at=? WHERE reference=? AND EXISTS(SELECT 1 FROM booking_archives WHERE booking_reference=?)").bind(at,reference,reference),
    db.prepare("UPDATE booking_assignments SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE booking_reference=? AND EXISTS(SELECT 1 FROM booking_archives WHERE booking_reference=?)").bind(at,at,reference,reference),
  ]);
  return Boolean(saved.meta.changes);
}
export async function purgeExpiredBookings() {
  await ensureReliabilityTables();
  const rows=(await reliabilityDb().prepare("SELECT reference FROM bookings WHERE status='binned' AND purge_after<=? LIMIT 50").bind(new Date().toISOString()).all<{reference:string}>()).results;
  let archived=0;
  for (const row of rows) {
    try {if(await permanentlyDeleteBooking(row.reference)) archived++;} catch {console.error("Booking archival failed; retained for retry");}
  }
  return archived;
}
