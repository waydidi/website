import { getFile } from "@/lib/file-store";
import { env } from "cloudflare:workers";
import { tg, sendTo, sendPhoto, sendPhotoAlbum, TelegramDeliveryError, type InlineKeyboard } from "./client";
import { ensureReliabilityTables, reliabilityDb } from "./reliability-db";
import { sha256Bytes } from "@/lib/security";
import { TELEGRAM_LEASE_MS, TELEGRAM_MAX_AGE_MS, telegramBudgetExpired, telegramNextAttempt } from "./outbox-rules";
import { telegramLinkedStatements } from "./acknowledgment-db";

export type DeliveryPayload = {
  prompt?:{reference:string;field:string;userId:string;version:number;placeholder:string};
  text:string; keyboard?:InlineKeyboard; replyTo?:number; quote?:string;
  photos?:{key:string;mime:string;contentHash?:string}[];
  target?:{kind:"booking_card"|"driver_offer"|"request_card"|"handover";id:string};
  driverId?:string; assignmentId?:string; activeBooking?:boolean; staffId?:string;
};
export type DeliveryInput = {id:string;reference?:string;leg?:string;destination:string;payload:DeliveryPayload; legacyUncertain?:boolean};
export async function queueTelegram(input:DeliveryInput, attempt=true) {
  await ensureReliabilityTables();
  const at=new Date().toISOString();
  await reliabilityDb().prepare("INSERT OR IGNORE INTO telegram_delivery_jobs(id,booking_reference,leg,destination,payload_json,status,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(input.id,input.reference??null,input.leg??null,input.destination,JSON.stringify(input.payload),input.legacyUncertain?"uncertain":"queued",at,at,at).run();
  await reliabilityDb().prepare("UPDATE telegram_delivery_jobs SET payload_json=?,updated_at=? WHERE id=? AND status='queued' AND attempts=0 AND (destination=? OR destination='')").bind(JSON.stringify(input.payload),at,input.id,input.destination).run();
  if (attempt) return deliverTelegramJob(input.id);
  return "queued";
}


async function validTelegramRecipient(p:DeliveryPayload,job:{booking_reference:string|null;destination:string},at:string){
  const db=reliabilityDb();
  let valid=true;
  if (p.activeBooking && job.booking_reference) valid=Boolean(await db.prepare("SELECT 1 x FROM bookings WHERE reference=? AND status='confirmed' AND binned_at IS NULL").bind(job.booking_reference).first());
  if (valid && p.target?.kind==='request_card') valid=Boolean(await db.prepare("SELECT 1 x FROM telegram_request_cards WHERE id=? AND status='open'").bind(p.target.id).first());
  if (valid && p.target?.kind==='handover') valid=Boolean(await db.prepare("SELECT 1 x FROM website_conversations WHERE id=? AND assigned_name IS NULL AND status!='closed' AND expires_at>?").bind(p.target.id,at).first());
  if (valid && p.prompt) valid=Boolean(await db.prepare("SELECT 1 x FROM bookings WHERE reference=? AND booking_version=? AND status='confirmed'").bind(p.prompt.reference,p.prompt.version).first());
  if (valid && p.assignmentId) valid=Boolean(await db.prepare("SELECT 1 x FROM booking_assignments a JOIN bookings b ON b.reference=a.booking_reference WHERE a.id=? AND a.revoked_at IS NULL AND a.token_expires_at>? AND b.status='confirmed'").bind(p.assignmentId,at).first());
  if (valid && p.driverId) valid=Boolean(await db.prepare("SELECT 1 x FROM telegram_driver_links l JOIN drivers d ON d.id=l.driver_id WHERE l.driver_id=? AND l.telegram_user_id=? AND d.status='active'").bind(p.driverId,job.destination).first());
  if (valid && p.staffId) valid=Boolean(await db.prepare("SELECT 1 x FROM telegram_admins WHERE telegram_user_id=? AND enabled=1").bind(p.staffId).first());
  return valid;
}

export async function deliverTelegramJob(id:string) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),at=new Date().toISOString();
  const job=await db.prepare("SELECT * FROM telegram_delivery_jobs WHERE id=?").bind(id).first<{id:string;booking_reference:string|null;destination:string;payload_json:string;status:string;attempts:number;next_attempt_at:string;created_at:string}>();
  if (!job || !["queued","failed"].includes(job.status) || job.next_attempt_at>at) return job?.status??"unchanged";
  if(telegramBudgetExpired(job)){
    await db.prepare("UPDATE telegram_delivery_jobs SET status='dead_letter',last_error='Retry budget exceeded; review before creating a new message',updated_at=? WHERE id=? AND status IN ('queued','failed') AND attempts=?").bind(at,id,job.attempts).run();
    return "dead_letter";
  }
  if (!env.TELEGRAM_BOT_TOKEN) return "queued";
  if (!job.destination && env.TELEGRAM_CHAT_ID) {
    job.destination=String(env.TELEGRAM_CHAT_ID);
    await db.prepare("UPDATE telegram_delivery_jobs SET destination=? WHERE id=? AND destination=''").bind(job.destination,id).run();
  }
  if (!job.destination) return "queued";
  let p:DeliveryPayload;
  try {p=JSON.parse(job.payload_json) as DeliveryPayload;if(!p||typeof p.text!=="string"||p.photos && (!Array.isArray(p.photos)||p.photos.some(photo=>!photo||typeof photo.key!=="string"||typeof photo.mime!=="string")))throw new Error();}
  catch {await db.prepare("UPDATE telegram_delivery_jobs SET status='dead_letter',last_error='Stored notification payload is invalid',updated_at=? WHERE id=? AND status IN ('queued','failed') AND payload_json=?").bind(at,id,job.payload_json).run();return "dead_letter";}
  const valid=await validTelegramRecipient(p,job,at);
  if (!valid) {const cancelled=await db.prepare("UPDATE telegram_delivery_jobs SET status='cancelled',last_error='Recipient or journey is no longer active',updated_at=? WHERE id=? AND status IN ('queued','failed') AND payload_json=? AND attempts=?").bind(at,id,job.payload_json,job.attempts).run();return cancelled.meta.changes?"cancelled":"unchanged";}
  const claimed=await db.prepare("UPDATE telegram_delivery_jobs SET status='processing',attempts=attempts+1,attempted_at=?,updated_at=? WHERE id=? AND status IN ('queued','failed') AND next_attempt_at<=? AND attempts=? AND payload_json=? AND destination=?").bind(at,at,id,at,job.attempts,job.payload_json,job.destination).run();
  if (!claimed.meta.changes) return "unchanged";
  let sentId:number|null=null;
  try {
    const photos:{bytes:ArrayBuffer;mime:string}[]=[];
    for (const photo of p.photos??[]) {
      const stored=await getFile(photo.key);
      if (!stored) throw new TelegramDeliveryError("Evidence is unavailable; restore the private file before retrying",true);
      const bytes=await new Response(stored.body).arrayBuffer(),hash=await sha256Bytes(new Uint8Array(bytes));
      if(photo.contentHash && photo.contentHash!==hash)throw new TelegramDeliveryError("Private evidence changed; review the original notification",false);
      photo.contentHash=hash;
      photos.push({bytes,mime:photo.mime});
    }
    // Rendering can outlast an assignment or staff authorization.
    if(!await validTelegramRecipient(p,job,new Date().toISOString())){
      await db.prepare("UPDATE telegram_delivery_jobs SET status='cancelled',last_error='Recipient or journey is no longer active',updated_at=? WHERE id=? AND status='processing' AND attempted_at=?").bind(new Date().toISOString(),id,at).run();
      return "cancelled";
    }
    // Preserve media identity before sending and refuse an expired/replaced lease.
    const ready=await db.prepare("UPDATE telegram_delivery_jobs SET payload_json=? WHERE id=? AND status='processing' AND attempted_at=? AND attempted_at>?")
      .bind(JSON.stringify(p),id,at,new Date(Date.now()-TELEGRAM_LEASE_MS/2).toISOString()).run();
    if(!ready.meta.changes){
      await db.prepare("UPDATE telegram_delivery_jobs SET status='failed',last_error='Rendering lease expired before send',updated_at=? WHERE id=? AND status='processing' AND attempted_at=?").bind(new Date().toISOString(),id,at).run();
      return (await db.prepare("SELECT status FROM telegram_delivery_jobs WHERE id=?").bind(id).first<{status:string}>())?.status??"uncertain";
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
    if(!sent || !Number.isSafeInteger(sent.message_id) || sent.message_id<=0)throw new TelegramDeliveryError("Provider acknowledgment is invalid; check Telegram",false);
    sentId=sent.message_id;
    const acknowledged={sql:"EXISTS(SELECT 1 FROM telegram_delivery_jobs WHERE id=? AND status='sent' AND attempted_at=? AND telegram_message_id=?)",values:[id,at,sentId]};
    const statements=[db.prepare("UPDATE telegram_delivery_jobs SET status='sent',telegram_message_id=?,sent_at=?,last_error=NULL,updated_at=? WHERE id=? AND status='processing' AND attempted_at=?").bind(sentId,at,at,id,at),...telegramLinkedStatements(db,p,sentId,acknowledged,at)];
    const saved=await db.batch(statements);
    return saved[0].meta.changes?"sent":(await db.prepare("SELECT status FROM telegram_delivery_jobs WHERE id=?").bind(id).first<{status:string}>())?.status??"uncertain";
  } catch(error) {
    const next=telegramNextAttempt(job.attempts+1,error instanceof TelegramDeliveryError?error.retryAfterMs:0);
    const exhausted=telegramBudgetExpired({...job,attempts:job.attempts+1}) || Date.parse(next)>=Date.parse(job.created_at)+TELEGRAM_MAX_AGE_MS;
    const status=sentId===null && error instanceof TelegramDeliveryError && error.retryable?(exhausted?"dead_letter":"failed"):"uncertain";
    await db.prepare("UPDATE telegram_delivery_jobs SET status=?,telegram_message_id=COALESCE(telegram_message_id,?),last_error=?,next_attempt_at=?,updated_at=? WHERE id=? AND status='processing' AND attempted_at=?").bind(status,sentId,error instanceof TelegramDeliveryError?error.message:"Delivery outcome unknown; check Telegram",next,new Date().toISOString(),id,at).run();
    return status;
  }
}
export async function retryTelegramOutbox(limit=15) {
  await ensureReliabilityTables();
  const db=reliabilityDb(),at=new Date().toISOString();
  await db.prepare("UPDATE telegram_delivery_jobs SET status='uncertain',last_error='Interrupted send; check Telegram before retrying',updated_at=? WHERE status='processing' AND attempted_at<?").bind(at,new Date(Date.now()-120000).toISOString()).run();
  const rows=(await db.prepare("SELECT id FROM telegram_delivery_jobs WHERE status IN ('queued','failed') AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT ?").bind(at,limit).all<{id:string}>()).results;
  for (const row of rows) await deliverTelegramJob(row.id).catch(()=>console.error("Telegram outbox job recovery failed"));
}
