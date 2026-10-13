import { getFile } from "@/lib/file-store";
import { env } from "cloudflare:workers";
import { tg, sendTo, sendPhoto, sendPhotoAlbum, TelegramDeliveryError, type InlineKeyboard } from "./client";
import { ensureReliabilityTables, reliabilityDb } from "./reliability-db";

export type DeliveryPayload = {
  prompt?:{reference:string;field:string;userId:string;version:number;placeholder:string};
  text:string; keyboard?:InlineKeyboard; replyTo?:number; quote?:string;
  photos?:{key:string;mime:string}[];
  target?:{kind:"booking_card"|"driver_offer"|"request_card"|"handover";id:string};
  driverId?:string; assignmentId?:string; activeBooking?:boolean; staffId?:string;
};
export type DeliveryInput = {id:string;reference?:string;leg?:string;destination:string;payload:DeliveryPayload; legacyUncertain?:boolean};
export async function queueTelegram(input:DeliveryInput, attempt=true) {
  await ensureReliabilityTables();
  const at=new Date().toISOString();
  await reliabilityDb().prepare("INSERT OR IGNORE INTO telegram_delivery_jobs(id,booking_reference,leg,destination,payload_json,status,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(input.id,input.reference??null,input.leg??null,input.destination,JSON.stringify(input.payload),input.legacyUncertain?"uncertain":"queued",at,at,at).run();
  await reliabilityDb().prepare("UPDATE telegram_delivery_jobs SET payload_json=?,updated_at=? WHERE id=? AND status IN ('queued','failed') AND (destination=? OR destination='')").bind(JSON.stringify(input.payload),at,input.id,input.destination).run();
  if (attempt) return deliverTelegramJob(input.id);
  return "queued";
}

export async function deliverTelegramJob(id:string) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),at=new Date().toISOString();
  const job=await db.prepare("SELECT * FROM telegram_delivery_jobs WHERE id=?").bind(id).first<{id:string;booking_reference:string|null;destination:string;payload_json:string;status:string;attempts:number;next_attempt_at:string}>();
  if (!job || !["queued","failed"].includes(job.status) || job.next_attempt_at>at) return job?.status??"unchanged";
  if (!env.TELEGRAM_BOT_TOKEN) return "queued";
  if (!job.destination && env.TELEGRAM_CHAT_ID) {
    job.destination=String(env.TELEGRAM_CHAT_ID);
    await db.prepare("UPDATE telegram_delivery_jobs SET destination=? WHERE id=? AND destination=''").bind(job.destination,id).run();
  }
  if (!job.destination) return "queued";
  const p=JSON.parse(job.payload_json) as DeliveryPayload;
  let valid=true;
  if (p.activeBooking && job.booking_reference) valid=Boolean(await db.prepare("SELECT 1 x FROM bookings WHERE reference=? AND status='confirmed' AND binned_at IS NULL").bind(job.booking_reference).first());
  if (valid && p.target?.kind==='request_card') valid=Boolean(await db.prepare("SELECT 1 x FROM telegram_request_cards WHERE id=? AND status='open'").bind(p.target.id).first());
  if (valid && p.target?.kind==='handover') valid=Boolean(await db.prepare("SELECT 1 x FROM website_conversations WHERE id=? AND assigned_name IS NULL AND status!='closed' AND expires_at>?").bind(p.target.id,at).first());
  if (valid && p.prompt) valid=Boolean(await db.prepare("SELECT 1 x FROM bookings WHERE reference=? AND booking_version=? AND status='confirmed'").bind(p.prompt.reference,p.prompt.version).first());
  if (valid && p.assignmentId) valid=Boolean(await db.prepare("SELECT 1 x FROM booking_assignments a JOIN bookings b ON b.reference=a.booking_reference WHERE a.id=? AND a.revoked_at IS NULL AND a.token_expires_at>? AND b.status='confirmed'").bind(p.assignmentId,at).first());
  if (valid && p.driverId) valid=Boolean(await db.prepare("SELECT 1 x FROM telegram_driver_links l JOIN drivers d ON d.id=l.driver_id WHERE l.driver_id=? AND l.telegram_user_id=? AND d.status='active'").bind(p.driverId,job.destination).first());
  if (valid && p.staffId) valid=Boolean(await db.prepare("SELECT 1 x FROM telegram_admins WHERE telegram_user_id=? AND enabled=1").bind(p.staffId).first());
  if (!valid) {await db.prepare("UPDATE telegram_delivery_jobs SET status='cancelled',last_error='Recipient or journey is no longer active',updated_at=? WHERE id=? AND status IN ('queued','failed')").bind(at,id).run();return "cancelled";}
  const claimed=await db.prepare("UPDATE telegram_delivery_jobs SET status='processing',attempts=attempts+1,attempted_at=?,updated_at=? WHERE id=? AND status IN ('queued','failed') AND next_attempt_at<=?").bind(at,at,id,at).run();
  if (!claimed.meta.changes) return "unchanged";
  let sentId:number|null=null;
  try {
    const photos:{bytes:ArrayBuffer;mime:string}[]=[];
    for (const photo of p.photos??[]) {
      const stored=await getFile(photo.key);
      if (!stored) throw new TelegramDeliveryError("Evidence is unavailable; restore the private file before retrying",true);
      photos.push({bytes:await new Response(stored.body).arrayBuffer(),mime:photo.mime});
    }
    const send=async(quote?:string)=>photos.length>=2 ? (await sendPhotoAlbum(photos,p.text,p.replyTo,quote,job.destination))[0]
      : photos.length===1 ? await sendPhoto(photos[0].bytes,p.text,p.replyTo,p.keyboard,quote,job.destination)
      : p.prompt ? await tg<{message_id:number}>("sendMessage",{chat_id:job.destination,text:p.text,parse_mode:"HTML",reply_markup:{force_reply:true,selective:true,input_field_placeholder:p.prompt.placeholder},...(p.replyTo?{reply_parameters:{message_id:p.replyTo,allow_sending_without_reply:true}}:{})}) : await sendTo(job.destination,p.text,p.keyboard,p.replyTo,quote);
    let sent;
    try {sent=await send(p.quote);} catch(error) {
      // Only a definite quote rejection is safe to fall back. Timeouts never trigger a second send.
      if (!p.quote || !(error instanceof TelegramDeliveryError && error.retryable && /quote/i.test(error.message))) throw error;
      sent=await send();
    }
    sentId=sent.message_id;
    const statements=[db.prepare("UPDATE telegram_delivery_jobs SET status='sent',telegram_message_id=?,sent_at=?,last_error=NULL,updated_at=? WHERE id=? AND status='processing'").bind(sentId,at,at,id)];
    if (p.prompt) {
      statements.push(db.prepare("INSERT OR IGNORE INTO telegram_booking_prompts(telegram_message_id,booking_reference,field,telegram_user_id,created_at) VALUES(?,?,?,?,?)").bind(sentId,p.prompt.reference,p.prompt.field,p.prompt.userId,at));
      statements.push(db.prepare("INSERT OR IGNORE INTO telegram_prompt_context(message_id,booking_version) VALUES(?,?)").bind(sentId,p.prompt.version));
    }
    const target=p.target;
    if (target?.kind==="booking_card") statements.push(db.prepare("UPDATE telegram_booking_cards SET telegram_message_id=? WHERE booking_reference=? AND telegram_message_id=0").bind(sentId,target.id));
    if (target?.kind==="driver_offer") statements.push(db.prepare("UPDATE telegram_driver_jobs SET telegram_message_id=?,updated_at=? WHERE booking_reference=? AND telegram_message_id=0").bind(sentId,at,target.id));
    if (target?.kind==="request_card") statements.push(db.prepare("UPDATE telegram_request_cards SET telegram_message_id=? WHERE id=? AND telegram_message_id=0").bind(sentId,target.id));
    if (target?.kind==="handover") statements.push(db.prepare("UPDATE website_conversations SET bot_state=json_set(COALESCE(bot_state,'{}'),'$.card',?,'$.waitUntil',NULL) WHERE id=?").bind(sentId,target.id));
    await db.batch(statements);
    return "sent";
  } catch(error) {
    const status=sentId===null && error instanceof TelegramDeliveryError && error.retryable?"failed":"uncertain";
    await db.prepare("UPDATE telegram_delivery_jobs SET status=?,last_error=?,next_attempt_at=?,updated_at=? WHERE id=? AND status='processing'").bind(status,error instanceof TelegramDeliveryError?error.message:"Delivery outcome unknown; check Telegram",new Date(Date.now()+Math.min(3600,60*2**Math.min(job.attempts,6))*1000).toISOString(),at,id).run();
    return status;
  }
}
export async function retryTelegramOutbox(limit=15) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),at=new Date().toISOString();
  await db.prepare("UPDATE telegram_delivery_jobs SET status='uncertain',last_error='Interrupted send; check Telegram before retrying',updated_at=? WHERE status='processing' AND attempted_at<?").bind(at,new Date(Date.now()-120000).toISOString()).run();
  const rows=(await db.prepare("SELECT id FROM telegram_delivery_jobs WHERE status IN ('queued','failed') AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?").bind(at,limit).all<{id:string}>()).results;
  for (const row of rows) await deliverTelegramJob(row.id);
}
