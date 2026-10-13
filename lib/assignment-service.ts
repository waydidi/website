import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, drivers, bookingAssignments, driverAvailability } from "@/db/schema";
import { journeyFor, journeysFor, type JourneyLeg } from "@/lib/journey-legs";
import { bookingWindow, rangesOverlap } from "@/lib/operations-calendar";
import { secureToken, sha256 } from "@/lib/security";
import { telegramChatId } from "@/lib/telegram/client";
import { ensureReliabilityTables, reliabilityDb } from "@/lib/telegram/reliability-db";

export type AssignmentInput = { reference:string; leg:JourneyLeg; driverId:string; by:string; overrideConflict?:boolean; expectedVersion?:number; expectedAssignmentId?:string|null; idempotencyKey?:string; telegramHeader?:string; telegramReplyTo?:number; telegramDriverDm?:boolean; offerKey?:string; holderId?:string };
/** Every entry point uses one optimistic dispatch revision. Checks and guarded writes commit together. */
export async function assignDriver(input: AssignmentInput) {
  await ensureReliabilityTables();
  const db = reliabilityDb();
  const id = input.idempotencyKey ? `dispatch:${await sha256(input.idempotencyKey)}` : crypto.randomUUID();
  for (let retry=0; retry<4; retry++) {
    const revision = await db.prepare("SELECT version FROM dispatch_revision WHERE id=1").first<{version:number}>();
    const [[parent],[driver],active,all,unavailable] = await Promise.all([
      getDb().select().from(bookings).where(eq(bookings.reference,input.reference)).limit(1),
      getDb().select().from(drivers).where(eq(drivers.id,input.driverId)).limit(1),
      getDb().select().from(bookingAssignments), getDb().select().from(bookings),
      getDb().select().from(driverAvailability).where(eq(driverAvailability.driverId,input.driverId)),
    ]);
    const previous = active.find(a=>a.id===id);
    if (previous && !previous.revokedAt) {
      const link = await db.prepare("SELECT driver_token FROM booking_links WHERE booking_reference=? AND leg=?").bind(input.reference,input.leg).first<{driver_token:string}>();
      return link && await sha256(link.driver_token)===previous.tokenHash ? {ok:true as const,assignment:previous,token:link.driver_token,duplicate:true,conflicts:[] as string[]} : {ok:false as const,error:"Assignment link changed. Refresh and retry."};
    }
    const booking = parent ? await journeyFor(parent,input.leg) : null;
    if (!parent || !booking || booking.status!=="confirmed" || parent.binnedAt || !driver || driver.status!=="active" || (input.expectedVersion!==undefined && parent.bookingVersion!==input.expectedVersion)) return {ok:false as const,error:"Choose an active driver and a confirmed, unchanged journey."};
    const current=active.find(a=>a.bookingReference===input.reference && a.leg===input.leg && !a.revokedAt);
    if (input.expectedAssignmentId!==undefined && (current?.id??null)!==input.expectedAssignmentId) return {ok:false as const,error:"The assignment changed. Refresh before choosing a driver."};
    const candidate=bookingWindow(booking), map=new Map((await journeysFor(all)).map(b=>[b.journeyId,b]));
    if (!Number.isFinite(candidate.startsAt) || !Number.isFinite(candidate.endsAt)) return {ok:false as const,error:"The journey schedule is invalid."};
    const conflicts:string[]=[];
    for (const a of active.filter(a=>!a.revokedAt && a.driverId===input.driverId && a.id!==current?.id && !["completed","no_show"].includes(a.currentStatus))) {
      const trip=map.get(`${a.bookingReference}:${a.leg}`);
      if (trip?.status!=="confirmed") continue;
      const window=bookingWindow(trip);
      if (rangesOverlap(candidate.startsAt,candidate.endsAt,window.startsAt,window.endsAt)) conflicts.push(`Overlaps ${trip.reference} (${trip.leg}) at ${trip.pickupTime}`);
    }
    for (const period of unavailable) if (rangesOverlap(candidate.startsAt,candidate.endsAt,Date.parse(period.startsAt),Date.parse(period.endsAt))) conflicts.push(period.reason?`Driver unavailable: ${period.reason}`:"Driver unavailable during this journey");
    if (conflicts.length && !input.overrideConflict) return {ok:false as const,error:"This driver has a schedule conflict.",conflicts};
    const at=new Date().toISOString(), token=secureToken(), tokenHash=await sha256(token);
    const expiry=new Date(Math.max(Date.now()+48*3600_000,candidate.pickup+24*3600_000)).toISOString();
    const version=parent.bookingVersion, claim=crypto.randomUUID();
    const owned="EXISTS(SELECT 1 FROM dispatch_revision WHERE id=1 AND claim_id=?)";
    const [claimed] = await db.batch([
      db.prepare(`UPDATE dispatch_revision SET version=version+1,claim_id=? WHERE id=1 AND version=? AND EXISTS(SELECT 1 FROM bookings b WHERE reference=? AND booking_version=? AND status='confirmed' AND binned_at IS NULL) AND NOT EXISTS(SELECT 1 FROM journey_legs WHERE booking_reference=? AND leg=? AND status NOT IN ('confirmed','pending_payment')) AND EXISTS(SELECT 1 FROM drivers WHERE id=? AND status='active') ${input.offerKey?"AND EXISTS(SELECT 1 FROM telegram_driver_jobs WHERE booking_reference=? AND status='signing_up' AND holder_telegram_id=? AND hold_until>=?)":""}`).bind(claim,revision?.version??0,input.reference,version,input.reference,input.leg,input.driverId,...(input.offerKey?[input.offerKey,input.holderId??'',at]:[])),
      db.prepare(`UPDATE booking_assignments SET revoked_at=?,updated_at=? WHERE booking_reference=? AND leg=? AND revoked_at IS NULL AND ${owned}`).bind(at,at,input.reference,input.leg,claim),
      db.prepare(`INSERT INTO booking_links(booking_reference,leg,driver_token,created_at) SELECT ?,?,?,? WHERE ${owned} ON CONFLICT(booking_reference,leg) DO UPDATE SET driver_token=excluded.driver_token,created_at=excluded.created_at`).bind(input.reference,input.leg,token,at,claim),
      db.prepare(`INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) SELECT ?,?,?,?,?,'assigned',?,?,?,? WHERE ${owned}`).bind(id,input.reference,input.leg,input.driverId,tokenHash,input.by,at,expiry,at,claim),
      db.prepare(`INSERT INTO booking_notifications(id,booking_reference,assignment_id,notification_type,channel,recipient,dedupe_key,scheduled_for,status,attempt_count,created_at,updated_at) SELECT ?,?,?,'driver_assignment','telegram',?,?,?,'queued',0,?,? WHERE ${owned}`).bind(crypto.randomUUID(),input.reference,id,telegramChatId(),`telegram-driver-assignment:${id}`,at,at,at,claim),
      db.prepare(`INSERT INTO booking_events(booking_reference,event_type,provider_event_id,created_at) SELECT ?,?,?,? WHERE ${owned}`).bind(input.reference,input.overrideConflict&&conflicts.length?"driver_assigned_conflict_override":"driver_assigned",`assignment:${id}`,at,claim),
      ...(input.telegramHeader!==undefined ? [db.prepare(`INSERT INTO telegram_assignment_messages(assignment_id,header,reply_to,driver_dm) SELECT ?,?,?,? WHERE ${owned}`).bind(id,input.telegramHeader,input.telegramReplyTo??null,input.telegramDriverDm?1:0,claim)] : []),
      db.prepare(`UPDATE telegram_booking_cards SET assignment_posted=1 WHERE booking_reference=? AND ${owned}`).bind(input.reference,claim),
    ]);
    if (claimed.meta.changes) return {ok:true as const,assignment:{id,bookingReference:input.reference,leg:input.leg,driverId:input.driverId,tokenHash,currentStatus:"assigned",assignedBy:input.by,assignedAt:at,tokenExpiresAt:expiry,updatedAt:at},token,duplicate:false,conflicts};
  }
  return {ok:false as const,error:"Dispatch changed concurrently. Refresh and retry."};
}
