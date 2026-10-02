import { env } from "cloudflare:workers";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { contactEmails } from "@/lib/booking-contacts";
import { bookingExtras } from "@/lib/booking-extras";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { sendConfirmationEmail } from "@/lib/email";
import { sha256 } from "@/lib/security";
type Booking=typeof bookings.$inferSelect;
type Delivery={id:string;channel:string;recipient:string|null;attempts:number};

export async function fulfillBooking(booking:Booking,paymentIntentId?:string|null) {
 const now=new Date().toISOString();
 if(["completed","cancelled","no_show","binned"].includes(booking.status)) return {emailStatus:booking.emailStatus,pdfKey:booking.pdfKey};
 // Confirmation is a durable booking transition; delivery failures cannot undo it.
 const [confirmed]=await getDb().update(bookings).set({status:"confirmed",paymentIntentId:paymentIntentId??booking.paymentIntentId,updatedAt:now}).where(and(eq(bookings.reference,booking.reference),inArray(bookings.status,["pending_payment","expired","confirmed"]),or(inArray(bookings.paymentStatus,["paid","partially_refunded"]),and(eq(bookings.paymentMethod,"cash"),eq(bookings.paymentStatus,"cash_due"))))).returning();
 if(!confirmed) return {emailStatus:booking.emailStatus,pdfKey:booking.pdfKey};
 booking=confirmed;
 const legacy=booking.fulfillmentStatus==="complete";
 const channels=[{channel:"confirmation",recipient:null},{channel:"pdf",recipient:null},{channel:"customer_email",recipient:booking.customerEmail},{channel:"office_email",recipient:env.BOOKING_ALERT_EMAIL??null},...(await contactEmails(booking.reference)).filter(to=>to.toLowerCase()!==booking.customerEmail.toLowerCase()).map(recipient=>({channel:"copy_email",recipient}))];
 for(const job of channels) {
  const id=job.channel==="office_email"?`${booking.reference}:office_email`:`${booking.reference}:${job.channel}:${(await sha256(job.recipient??"")).slice(0,16)}`;
  const status=job.channel==="confirmation"?"sent":legacy?(job.channel==="customer_email"&&booking.emailStatus==="sent"||job.channel==="pdf"&&booking.pdfKey?"sent":job.channel==="customer_email"?"pending":"legacy_unknown"):"pending";
  await env.DB.prepare("INSERT OR IGNORE INTO booking_deliveries(id,booking_reference,channel,recipient,status,sent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,booking.reference,job.channel,job.recipient,status,status==="sent"?now:null,now,now).run();
 }
 await deliverBooking(booking);
 const [fresh]=await getDb().select().from(bookings).where(eq(bookings.reference,booking.reference)).limit(1);
 return {emailStatus:fresh.emailStatus,pdfKey:fresh.pdfKey};
}

async function deliverBooking(booking:Booking) {
 if(!["confirmed","completed"].includes(booking.status)) return;
 const now=new Date(),stale=new Date(now.getTime()-5*60000).toISOString();
 const {results}=await env.DB.prepare("SELECT id FROM booking_deliveries WHERE booking_reference=? AND channel<>'confirmation' AND (status IN ('pending','failed','pending_configuration') OR (status='processing' AND attempted_at<?)) AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY channel").bind(booking.reference,stale,now.toISOString()).all();
 let pdfPromise:Promise<Uint8Array>|null=null;
 const pdf=()=>pdfPromise??=(async()=>createConfirmationPdf(booking,await bookingExtras(booking)))();
 for(const candidate of results) {
  const at=new Date().toISOString();
  const job=await env.DB.prepare("UPDATE booking_deliveries SET status='processing',attempts=attempts+1,attempted_at=?,updated_at=? WHERE id=? AND (status IN ('pending','failed','pending_configuration') OR (status='processing' AND attempted_at<?)) AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING *").bind(at,at,candidate.id,stale,at).first() as Delivery|null;
  if(!job) continue;
  if(job.channel==="office_email"&&!job.recipient&&env.BOOKING_ALERT_EMAIL){job.recipient=env.BOOKING_ALERT_EMAIL;await env.DB.prepare("UPDATE booking_deliveries SET recipient=? WHERE id=?").bind(job.recipient,job.id).run();}
  let status="sent",error:string|null=null;
  try {
   if(job.channel==="pdf") {
    if(!env.BUCKET) {status="pending_configuration";error="PDF storage is not configured.";}
    else {const key=`confirmations/${booking.reference}.pdf`;await env.BUCKET.put(key,await pdf(),{httpMetadata:{contentType:"application/pdf"}});await getDb().update(bookings).set({pdfKey:key,updatedAt:at}).where(eq(bookings.reference,booking.reference));}
   } else if(!job.recipient) {status="pending_configuration";error="Office notification email is not configured.";}
   else {
    const delivery=await sendConfirmationEmail({to:job.recipient,name:booking.customerName,reference:booking.reference,pdf:await pdf(),pickup:booking.pickup,dropoff:booking.dropoff,pickupDate:booking.pickupDate,pickupTime:booking.pickupTime,vehicle:booking.vehicle,customerPhone:booking.customerPhone,passengers:booking.passengers,luggage:booking.luggage,total:booking.total,paymentMethod:booking.paymentMethod,serviceType:booking.serviceType,bookedHours:booking.bookedHours,pricingArea:booking.pricingArea,returnPickup:booking.returnPickup,returnDropoff:booking.returnDropoff,returnDate:booking.returnDate,returnTime:booking.returnTime,outboundTotal:booking.outboundTotal,returnTotal:booking.returnTotal,extras:await bookingExtras(booking),surname:booking.customerSurname,flightNumber:booking.flightNumber});
    status=delivery.status;if(status!=="sent")error="Email delivery has not been confirmed.";
   }
  } catch {status="failed";error="Delivery failed and will be retried independently.";}
  const retry=new Date(Date.now()+Math.min(6*3600000,5*60000*2**Math.min(job.attempts-1,6))).toISOString();
  await env.DB.prepare("UPDATE booking_deliveries SET status=?,sent_at=?,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?").bind(status,status==="sent"?new Date().toISOString():null,status==="sent"?null:retry,error,new Date().toISOString(),job.id).run();
 }
 const counts=await env.DB.prepare("SELECT SUM(CASE WHEN status NOT IN ('sent','legacy_unknown') THEN 1 ELSE 0 END) pending,MAX(CASE WHEN channel='customer_email' THEN status END) email FROM booking_deliveries WHERE booking_reference=?").bind(booking.reference).first() as {pending:number;email:string}|null;
 await getDb().update(bookings).set({fulfillmentStatus:counts?.pending?"failed":"complete",emailStatus:counts?.email??"pending",updatedAt:new Date().toISOString()}).where(eq(bookings.reference,booking.reference));
}
export async function runDeliveryRecovery() {
 const {results}=await env.DB.prepare("SELECT d.booking_reference FROM booking_deliveries d JOIN bookings b ON b.reference=d.booking_reference WHERE b.status IN ('confirmed','completed') AND d.status IN ('pending','failed','pending_configuration','processing') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=?) GROUP BY d.booking_reference ORDER BY MIN(d.updated_at) LIMIT 20").bind(new Date().toISOString()).all();
 for(const row of results) {const [booking]=await getDb().select().from(bookings).where(eq(bookings.reference,String(row.booking_reference))).limit(1);if(booking)await deliverBooking(booking);}
}
