import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { contactEmails } from "@/lib/booking-contacts";
import { bookingExtras } from "@/lib/booking-extras";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { prepareConfirmationEmail, sendPreparedEmail } from "@/lib/email";
import { ensureDeliveryPayloads, readDeliveryEmail, freezeDeliveryEmail, beginDeliverySend, finishDeliverySend, closeDeliveryClaim, purgeDeliveryPayloads, bookingDeliverySummary, DELIVERY_MAX_AGE_MS, DELIVERY_LEASE_MS, type DeliveryClaim } from "@/lib/booking-delivery-db";
import { sha256 } from "@/lib/security";
import { SITE_URL, publicSiteUrl } from "@/lib/site";
import { rideUrl } from "@/lib/trip-access";
import { COMMITTED_SQL, isCommittedStatus } from "@/lib/booking-status";
import { observeFunnelConfirmation } from "@/lib/booking-funnel";
type Booking=typeof bookings.$inferSelect;
type Delivery=DeliveryClaim & {channel:string;recipient:string|null};

export async function fulfillBooking(booking:Booking,paymentIntentId?:string|null) {
 const now=new Date().toISOString();
 const [current]=await getDb().select().from(bookings).where(eq(bookings.reference,booking.reference)).limit(1);
 if(!current)return {emailStatus:booking.emailStatus,pdfKey:booking.pdfKey};
 booking=current;
 if(["completed","cancelled","no_show","binned"].includes(booking.status)) return {emailStatus:booking.emailStatus,pdfKey:booking.pdfKey};
 const legacy=booking.fulfillmentStatus==="complete";
 const channels=[{channel:"confirmation",recipient:null},{channel:"pdf",recipient:null},{channel:"customer_email",recipient:booking.customerEmail},{channel:"office_email",recipient:env.BOOKING_ALERT_EMAIL??null},...(await contactEmails(booking.reference)).filter(to=>to.toLowerCase()!==booking.customerEmail.toLowerCase()).map(recipient=>({channel:"copy_email",recipient}))];
 // The transition and all durable intents commit together, before network work.
 const statements=[env.DB.prepare("UPDATE bookings SET status='confirmed',payment_intent_id=COALESCE(?,payment_intent_id),updated_at=? WHERE reference=? AND customer_email=? AND fulfillment_status=? AND email_status=? AND COALESCE(pdf_key,'')=? AND status IN ('pending_payment','expired','confirmed') AND (payment_status IN ('paid','partially_refunded') OR (payment_method='cash' AND payment_status='cash_due'))")
  .bind(paymentIntentId??null,now,booking.reference,booking.customerEmail,booking.fulfillmentStatus,booking.emailStatus,booking.pdfKey??"")];
 for(const job of channels) {
  const id=job.channel==="office_email"?`${booking.reference}:office_email`:`${booking.reference}:${job.channel}:${(await sha256(job.recipient??"")).slice(0,16)}`;
  const status=job.channel==="confirmation"?"sent":legacy?(job.channel==="customer_email"&&booking.emailStatus==="sent"||job.channel==="pdf"&&booking.pdfKey?"sent":job.channel==="customer_email"?"pending":"legacy_unknown"):"pending";
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO booking_deliveries(id,booking_reference,channel,recipient,status,sent_at,created_at,updated_at)
   SELECT ?,reference,?,?,?,?,?,? FROM bookings WHERE reference=? AND status='confirmed' AND updated_at=?
   AND customer_email=? AND fulfillment_status=? AND email_status=? AND COALESCE(pdf_key,'')=?
   AND (?<>'copy_email' OR EXISTS(SELECT 1 FROM booking_contacts c WHERE c.booking_reference=bookings.reference AND c.email=?))`)
   .bind(id,job.channel,job.recipient,status,status==="sent"?now:null,now,now,booking.reference,now,booking.customerEmail,booking.fulfillmentStatus,booking.emailStatus,booking.pdfKey??"",job.channel,job.recipient));
 }
 const committed=await env.DB.batch(statements);
 if(!committed[0].meta.changes)return {emailStatus:booking.emailStatus,pdfKey:booking.pdfKey};
 [booking]=await getDb().select().from(bookings).where(eq(bookings.reference,booking.reference)).limit(1);
 await observeFunnelConfirmation(booking.reference);
 await import("@/lib/trip-booking").then((m)=>m.markTripPaid(booking.reference,publicSiteUrl(env.WAYDIDI_PUBLIC_URL))).catch(()=>console.error("smart trip close failed"));
 await import("@/lib/telegram/bookings").then((m)=>m.notifyBookingTelegram(booking.reference)).catch(()=>console.error("telegram booking card failed"));
 if(env.BOOKING_BACKGROUND_DELIVERY!=="1")await deliverBooking(booking);
 const [fresh]=await getDb().select().from(bookings).where(eq(bookings.reference,booking.reference)).limit(1);
 return {emailStatus:fresh.emailStatus,pdfKey:fresh.pdfKey};
}

async function deliverBooking(booking:Booking) {
 if(!isCommittedStatus(booking.status)) return;
 await ensureDeliveryPayloads(env.DB);
 const now=new Date(),stale=new Date(now.getTime()-5*60000).toISOString();
 const {results}=await env.DB.prepare("SELECT id FROM booking_deliveries WHERE booking_reference=? AND channel<>'confirmation' AND (status IN ('pending','failed','pending_configuration') OR (status='processing' AND attempted_at<?)) AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY channel").bind(booking.reference,stale,now.toISOString()).all();
 let pdfPromise:Promise<Uint8Array>|null=null;
 const pdf=()=>pdfPromise??=(async()=>createConfirmationPdf(booking,await bookingExtras(booking)))();
 for(const candidate of results) {
  const at=new Date().toISOString();
  const job=await env.DB.prepare("UPDATE booking_deliveries SET status='processing',attempts=attempts+1,attempted_at=?,updated_at=? WHERE id=? AND (status IN ('pending','failed','pending_configuration') OR (status='processing' AND attempted_at<?)) AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING *").bind(at,at,candidate.id,stale,at).first() as Delivery|null;
  if(!job) continue;
  if(Date.now()-Date.parse(job.created_at)>=DELIVERY_MAX_AGE_MS){await closeDeliveryClaim(env.DB,job,job.channel==="pdf"?"dead_letter":"uncertain","queue_age_exceeded");continue;}
  if(job.channel==="office_email"&&!job.recipient&&env.BOOKING_ALERT_EMAIL){job.recipient=env.BOOKING_ALERT_EMAIL;await env.DB.prepare("UPDATE booking_deliveries SET recipient=? WHERE id=? AND status='processing' AND attempted_at=?").bind(job.recipient,job.id,at).run();}
  let status="sent",error:string|null=null;
  try {
   if(job.channel==="pdf") {
    if(!env.BUCKET) {status="pending_configuration";error="PDF storage is not configured.";}
    else {const key=`confirmations/${booking.reference}.pdf`;await env.BUCKET.put(key,await pdf(),{httpMetadata:{contentType:"application/pdf"}});await getDb().update(bookings).set({pdfKey:key,updatedAt:at}).where(eq(bookings.reference,booking.reference));}
   } else {
    let frozen=await readDeliveryEmail(env.DB,job.id);
    // Check old ambiguity before configuration, so a missing key cannot erase it.
    if(!frozen && job.attempts>1 && !["configuration","prepare_failed","Office notification email is not configured."].includes(job.last_error??"")){await closeDeliveryClaim(env.DB,job,"uncertain","legacy_payload_missing");continue;}
    if(!job.recipient || !env.RESEND_API_KEY || (!frozen && !env.BOOKING_FROM_EMAIL)){status="pending_configuration";error="configuration";}
    else {
    if(!frozen){
     const prepared=prepareConfirmationEmail({to:job.recipient,name:booking.customerName,reference:booking.reference,pdf:await pdf(),pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:booking.pickupDate,pickupTime:booking.pickupTime,vehicle:booking.vehicle,customerPhone:booking.customerPhone,passengers:booking.passengers,luggage:booking.luggage,total:booking.total,paymentMethod:booking.paymentMethod,paymentStatus:booking.paymentStatus,serviceType:booking.serviceType,bookedHours:booking.bookedHours,pricingArea:booking.pricingArea,returnPickup:booking.returnPickup,returnDropoff:booking.returnDropoff,returnDate:booking.returnDate,returnTime:booking.returnTime,outboundTotal:booking.outboundTotal,returnTotal:booking.returnTotal,extras:await bookingExtras(booking),surname:booking.customerSurname,flightNumber:booking.flightNumber,rideUrl:job.channel==="customer_email"?await rideUrl(SITE_URL,booking).catch(()=>undefined):undefined});
     await freezeDeliveryEmail(env.DB,job,prepared);
     frozen=await readDeliveryEmail(env.DB,job.id);
    }
    if(!frozen){await closeDeliveryClaim(env.DB,job,"failed","lease_expired");continue;}
    const state=await beginDeliverySend(env.DB,job);
    if(!state){await closeDeliveryClaim(env.DB,job,Date.now()-Date.parse(job.attempted_at)>=DELIVERY_LEASE_MS?"failed":frozen.state.outcome_unknown?"uncertain":"dead_letter","retry_budget_exceeded");continue;}
    const delivery=await sendPreparedEmail(frozen.prepared);
    await finishDeliverySend(env.DB,job,delivery,state);
    continue;
    }
   }
  } catch(errorCaught) {
   if(errorCaught instanceof Error && errorCaught.message==="delivery_snapshot_invalid"){await closeDeliveryClaim(env.DB,job,"uncertain","snapshot_invalid");continue;}
   status="failed";error="prepare_failed";
  }
  const retry=new Date(Date.now()+Math.min(6*3600000,5*60000*2**Math.min(job.attempts-1,6))).toISOString();
  await env.DB.prepare("UPDATE booking_deliveries SET status=?,sent_at=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=? AND status='processing' AND attempted_at=?").bind(status,status==="sent"?new Date().toISOString():null,status==="sent"?null:retry,error,new Date().toISOString(),job.id,at).run();
 }
 // Derive the summary at write time; an older worker cannot write stale counts.
 await bookingDeliverySummary(env.DB,booking.reference).run();
}
export async function runDeliveryRecovery() {
 await purgeDeliveryPayloads(env.DB);
 const {results}=await env.DB.prepare(`SELECT d.booking_reference FROM booking_deliveries d JOIN bookings b ON b.reference=d.booking_reference WHERE b.status IN (${COMMITTED_SQL}) AND d.status IN ('pending','failed','pending_configuration','processing') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=?) GROUP BY d.booking_reference ORDER BY MIN(d.updated_at) LIMIT 20`).bind(new Date().toISOString()).all();
 for(const row of results) {const [booking]=await getDb().select().from(bookings).where(eq(bookings.reference,String(row.booking_reference))).limit(1);if(booking)await deliverBooking(booking);}
}
