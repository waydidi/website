import type { SecurityDatabase } from "./worker-db";
import { sha256 } from "./security";
import { deliveryKinds, deliveryFailureLabel, REVIEW_PAGE_SIZE, type DeliveryKind, type DeliveryReviewInput } from "./delivery-review-rules";
import { ensureDeliveryPayloads, readDeliveryEmail, bookingDeliverySummary, EMAIL_MAX_SEND_ATTEMPTS, EMAIL_RETRY_WINDOW_MS } from "./booking-delivery-db";
import { ensureTelegramMessages, readTelegramMessage } from "./telegram/message-store";
import { telegramBudgetExpired } from "./telegram/outbox-rules";
import { RELIABILITY_SCHEMA } from "./telegram/reliability-db";
import { telegramLinkedStatements, chatLinkedStatements } from "./telegram/acknowledgment-db";
import type { DeliveryPayload } from "./telegram/outbox";

export const deliveryReviewDdl=[
  `CREATE TABLE IF NOT EXISTS notification_delivery_reviews (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK(kind IN ('booking','telegram','assignment','chat')),job_id TEXT NOT NULL,expected_version TEXT NOT NULL,payload_hash TEXT NOT NULL,
    actor_id TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN ('retry','confirm_delivered','close')),reason TEXT NOT NULL,
    previous_status TEXT NOT NULL,previous_attempts INTEGER NOT NULL,previous_attempted_at TEXT,previous_next_attempt_at TEXT,
    confirmed_absent INTEGER NOT NULL,provider_message_id TEXT,created_at TEXT NOT NULL,destination_type TEXT,destination_id TEXT,use_as_root INTEGER NOT NULL DEFAULT 0,
    applied_count INTEGER NOT NULL CHECK(applied_count=1),UNIQUE(kind,job_id,expected_version))`,
  "CREATE INDEX IF NOT EXISTS notification_delivery_review_history ON notification_delivery_reviews(kind,job_id,sequence)",
  "CREATE TRIGGER IF NOT EXISTS notification_delivery_reviews_no_update BEFORE UPDATE ON notification_delivery_reviews BEGIN SELECT RAISE(ABORT,'Delivery review history is immutable'); END",
  "CREATE TRIGGER IF NOT EXISTS notification_delivery_reviews_no_delete BEFORE DELETE ON notification_delivery_reviews BEGIN SELECT RAISE(ABORT,'Delivery review history is immutable'); END",
];
export async function ensureDeliveryReviews(db:SecurityDatabase){
  await db.batch([...RELIABILITY_SCHEMA,...deliveryReviewDdl].map(sql=>db.prepare(sql)));
  await ensureDeliveryPayloads(db);
  await ensureTelegramMessages(db,"assignment");await ensureTelegramMessages(db,"chat");
}
type SourceValue=string|number|null;
type State=Record<string,SourceValue> & {kind:DeliveryKind;id:string;status:string;attempts:number;created_at:string;review_sequence:number;channel:string;reference:string|null;raw_payload:string|null;provider_message_id:string|null};
const fields=["id","reference","channel","destination","status","attempts","attempted_at","next_attempt_at","created_at","updated_at","last_error","provider_message_id","payload_version","first_attempt_at","send_attempts","raw_payload","raw_body","conversation_id","claim_id","root_id","root_owner"] as const;
const sources:Record<DeliveryKind,{table:string;from:string;columns:Record<string,string>}>= {
  booking:{table:"booking_deliveries",from:"booking_deliveries d LEFT JOIN booking_delivery_payloads p ON p.delivery_id=d.id",columns:{id:"d.id",reference:"d.booking_reference",channel:"d.channel",destination:"d.recipient",status:"d.status",attempts:"d.attempts",attempted_at:"d.attempted_at",next_attempt_at:"d.next_attempt_at",created_at:"d.created_at",updated_at:"d.updated_at",last_error:"d.last_error",provider_message_id:"p.provider_message_id",payload_version:"p.snapshot_id||':'||p.content_hash",first_attempt_at:"p.first_attempt_at",send_attempts:"p.send_attempts"}},
  telegram:{table:"telegram_delivery_jobs",from:"telegram_delivery_jobs d",columns:{id:"d.id",reference:"d.booking_reference",channel:"'telegram'",destination:"d.destination",status:"d.status",attempts:"d.attempts",attempted_at:"d.attempted_at",next_attempt_at:"d.next_attempt_at",created_at:"d.created_at",updated_at:"d.updated_at",last_error:"d.last_error",provider_message_id:"CASE WHEN d.telegram_message_id>0 THEN CAST(d.telegram_message_id AS TEXT) END",raw_payload:"d.payload_json"}},
  assignment:{table:"booking_notifications",from:"booking_notifications d LEFT JOIN telegram_assignment_payloads p ON p.id=d.id",columns:{id:"d.id",reference:"d.booking_reference",channel:"d.channel",destination:"d.recipient",status:"d.status",attempts:"d.attempt_count",attempted_at:"d.last_attempt_at",next_attempt_at:"d.scheduled_for",created_at:"d.created_at",updated_at:"d.updated_at",last_error:"d.error_message",provider_message_id:"CASE WHEN p.provider_message_id>0 THEN CAST(p.provider_message_id AS TEXT) END",payload_version:"p.content_hash",raw_payload:"p.payload_json"}},
  chat:{table:"website_chat_messages",from:"website_chat_messages d JOIN website_conversations c ON c.id=d.conversation_id LEFT JOIN telegram_chat_delivery_attempts a ON a.message_id=d.id LEFT JOIN telegram_chat_payloads p ON p.id=d.id",columns:{id:"d.id",reference:"c.public_id",channel:"'telegram'",destination:"a.destination",status:"d.telegram_status",attempts:"COALESCE(a.attempts,0)",attempted_at:"a.attempted_at",next_attempt_at:"p.next_attempt_at",created_at:"d.created_at",updated_at:"d.created_at",last_error:"p.last_error",provider_message_id:"CASE WHEN p.provider_message_id>0 THEN CAST(p.provider_message_id AS TEXT) END",payload_version:"p.content_hash",raw_payload:"p.payload_json",raw_body:"d.body",conversation_id:"d.conversation_id",claim_id:"a.claim_id",root_id:"c.telegram_message_id",root_owner:"(SELECT r.message_id FROM telegram_chat_card_claims r WHERE r.conversation_id=c.id)"}},
};
function selectSource(kind:DeliveryKind){const spec=sources[kind];return `SELECT '${kind}' kind,${fields.map(field=>`${spec.columns[field]??"NULL"} AS ${field}`).join(",")} FROM ${spec.from}${kind==="booking"?" WHERE d.channel<>'confirmation'":kind==="assignment"?" WHERE d.channel='telegram' AND d.notification_type='driver_assignment'":kind==="chat"?" WHERE d.sender='visitor' OR d.is_bot=1":""}`;}
const openStatuses=["pending","queued","failed","uncertain","dead_letter","pending_configuration","legacy_unknown"];
export async function deliveryReviewJob(db:SecurityDatabase,kind:DeliveryKind,id:string){
  return db.prepare(`SELECT s.*,COALESCE((SELECT MAX(sequence) FROM notification_delivery_reviews r WHERE r.kind=s.kind AND r.job_id=s.id),0) review_sequence FROM (${selectSource(kind)}) s WHERE s.id=?`).bind(id).first<State>();
}
async function version(job:State){return sha256(JSON.stringify(job));}
function retryBlock(job:State,retryEnabled:boolean,now=Date.now()){
  if(!openStatuses.includes(job.status))return "This delivery is already resolved or in progress.";
  if(job.provider_message_id)return "An acknowledgment is recorded. Check the receipt instead of retrying.";
  if(!retryEnabled)return "Owner retry is disabled in Worker settings.";
  if(telegramBudgetExpired({attempts:job.kind==="booking"?0:job.attempts,created_at:job.created_at},now))return "The original retry budget expired. It cannot be reset here.";
  if(job.next_attempt_at && Date.parse(String(job.next_attempt_at))>now)return "The saved retry delay has not elapsed.";
  if(job.kind==="booking"){
    if(job.channel==="pdf")return null;
    if(!job.payload_version && !(job.attempts===0&&["pending","queued","pending_configuration"].includes(job.status) || job.status==="pending_configuration"&&job.last_error==="configuration"))return "The original email is unavailable. It cannot safely be rebuilt.";
    if(Number(job.send_attempts??0)>=EMAIL_MAX_SEND_ATTEMPTS || job.first_attempt_at && now>=Date.parse(String(job.first_attempt_at))+EMAIL_RETRY_WINDOW_MS)return "The provider deduplication window or attempt budget expired.";
  }else if(job.kind!=="telegram" && job.attempts>0 && !job.raw_payload)return "The original message is unavailable. It cannot safely be rebuilt.";
  return null;
}
export async function publicDeliveryJob(job:State,retryEnabled:boolean){
  let context:Record<string,unknown>|null=null;try{const candidate=job.raw_payload?JSON.parse(job.raw_payload).context:null;context=candidate&&typeof candidate==="object"&&!Array.isArray(candidate)?candidate:null;}catch{/* no untrusted preview */}
  return {kind:job.kind,id:job.id,reference:job.reference,channel:job.channel,destination:job.destination,status:job.status,attempts:job.attempts,attemptedAt:job.attempted_at,nextAttemptAt:job.next_attempt_at,createdAt:job.created_at,lastError:deliveryFailureLabel(job.last_error),providerMessageId:job.provider_message_id,version:await version(job),canReview:openStatuses.includes(job.status),canRetry:!retryBlock(job,retryEnabled),retryBlockedReason:retryBlock(job,retryEnabled),canClose:openStatuses.includes(job.status)&&!job.provider_message_id,canConfirm:openStatuses.includes(job.status)&&job.channel!=="pdf",receiptDestinationType:context&&job.destination?context.group===job.destination?"group":"private":null,hasRoot:Boolean(job.root_id),needsRoot:job.kind==="chat"&&!job.root_id};
}
export async function listDeliveryReviews(db:SecurityDatabase,input:{kind:DeliveryKind|"all";offset:number;state:"open"|"all"},retryEnabled:boolean){
  const sql=deliveryKinds.map(selectSource).join(" UNION ALL ");
  const {results}=await db.prepare(`SELECT s.*,COALESCE((SELECT MAX(sequence) FROM notification_delivery_reviews r WHERE r.kind=s.kind AND r.job_id=s.id),0) review_sequence FROM (${sql}) s
    WHERE (?='all' OR kind=?) AND (?='all' OR status IN ('pending','queued','failed','uncertain','dead_letter','pending_configuration','legacy_unknown','processing')) ORDER BY created_at DESC,kind,id LIMIT 51 OFFSET ?`).bind(input.kind,input.kind,input.state,input.offset).all<State>();
  return {items:await Promise.all(results.slice(0,REVIEW_PAGE_SIZE).map(job=>publicDeliveryJob(job,retryEnabled))),hasMore:results.length>REVIEW_PAGE_SIZE,offset:input.offset};
}
export async function deliveryReviewHistory(db:SecurityDatabase,kind:DeliveryKind,id:string,offset=0){
  const {results}=await db.prepare("SELECT sequence,request_id,actor_id,action,reason,previous_status,previous_attempts,previous_attempted_at,previous_next_attempt_at,confirmed_absent,provider_message_id,created_at,destination_type,destination_id,use_as_root FROM notification_delivery_reviews WHERE kind=? AND job_id=? ORDER BY sequence DESC LIMIT 51 OFFSET ?").bind(kind,id,offset).all();
  return {items:results.slice(0,REVIEW_PAGE_SIZE),hasMore:results.length>REVIEW_PAGE_SIZE,offset};
}
export class DeliveryReviewError extends Error{constructor(readonly status:number,message:string){super(message);}}
export async function applyDeliveryReview(db:SecurityDatabase,actorId:string,input:DeliveryReviewInput,retryEnabled:boolean){
  const payloadHash=await sha256(JSON.stringify({actorId,requestId:input.requestId,kind:input.kind,jobId:input.jobId,expectedVersion:input.expectedVersion,action:input.action,reason:input.reason,confirmedAbsent:input.confirmedAbsent,providerMessageId:input.providerMessageId,destinationType:input.destinationType??null,destinationId:input.destinationId,useAsRoot:input.useAsRoot}));
  const replay=async()=>{const row=await db.prepare("SELECT request_id,payload_hash,action,created_at FROM notification_delivery_reviews WHERE request_id=?").bind(input.requestId).first<{request_id:string;payload_hash:string;action:string;created_at:string}>();if(row&&row.payload_hash!==payloadHash)throw new DeliveryReviewError(409,"This request ID was already used for a different decision.");return row;};
  if(await replay())return {ok:true,replayed:true,requestId:input.requestId};
  const job=await deliveryReviewJob(db,input.kind,input.jobId);
  if(!job)throw new DeliveryReviewError(404,"Delivery not found.");
  if(await version(job)!==input.expectedVersion)throw new DeliveryReviewError(409,"This delivery changed. Refresh it before reviewing.");
  if(!openStatuses.includes(job.status))throw new DeliveryReviewError(409,"This delivery is already resolved or in progress.");
  if(input.action==="retry"){
    const blocked=retryBlock(job,retryEnabled);if(blocked)throw new DeliveryReviewError(409,blocked);
    try{
      if(input.kind==="booking"&&job.channel!=="pdf"&&job.payload_version)await readDeliveryEmail(db,job.id);
      if(input.kind==="assignment"||input.kind==="chat")await readTelegramMessage(db,input.kind,job.id);
      if(input.kind==="telegram" && typeof JSON.parse(job.raw_payload??"null")?.text!=="string")throw new Error();
    }catch{throw new DeliveryReviewError(409,"The original stored message is invalid. It cannot be retried.");}
  }
  if(input.action!=="confirm_delivered"&&job.provider_message_id)throw new DeliveryReviewError(409,"An acknowledgment is already recorded. Review that receipt first.");
  const receipt=input.action==="confirm_delivered"?input.providerMessageId:null;
  if(receipt && (job.channel==="pdf" || input.kind!=="booking" && (!/^\d{1,16}$/.test(receipt)||!Number.isSafeInteger(Number(receipt))||Number(receipt)<=0)))throw new DeliveryReviewError(400,"Enter a valid observed message ID for this provider.");
  if(receipt&&job.provider_message_id&&receipt!==job.provider_message_id)throw new DeliveryReviewError(409,"The receipt differs from the recorded acknowledgment.");
  const receiptConflict=async()=>input.kind==="chat"&&receipt?Boolean(await db.prepare("SELECT 1 x FROM (SELECT conversation_id FROM telegram_message_routes WHERE chat_id=? AND message_id=? UNION ALL SELECT conversation_id FROM telegram_dm_messages WHERE chat_id=? AND message_id=?) WHERE conversation_id<>? LIMIT 1").bind(input.destinationId,Number(receipt),input.destinationId,Number(receipt),job.conversation_id).first()):false;
  if(await receiptConflict())throw new DeliveryReviewError(409,"That receipt is already routed to another conversation.");
  if(input.kind==="chat"&&receipt){
    if(job.destination&&input.destinationId!==job.destination)throw new DeliveryReviewError(409,"The observed destination differs from the attempted destination.");
    let prepared=null;try{prepared=await readTelegramMessage(db,"chat",job.id);}catch{/* explicit legacy routing evidence is required */}
    if(prepared&&job.destination&&(prepared.context.group===job.destination)!==(input.destinationType==="group"))throw new DeliveryReviewError(409,"The observed destination type differs from the stored route.");
    if(input.useAsRoot&&(job.root_id || job.root_owner&&job.root_owner!==job.id))throw new DeliveryReviewError(409,"Another root card or claim already exists.");
    if(!job.root_id && input.destinationType==="group" && !input.useAsRoot)throw new DeliveryReviewError(400,"Confirm that this receipt establishes the conversation card.");
  }
  const at=new Date().toISOString(),target=input.action==="retry"?input.kind==="booking"||input.kind==="chat"?"pending":"queued":input.action==="confirm_delivered"?"sent":input.kind==="chat"?"skipped":"cancelled";
  const evidence=receipt?"Owner confirmed provider receipt":input.action==="close"?"Owner closed after confirming absence":null;
  const set=input.kind==="booking"?{sql:"status=?,next_attempt_at=?,sent_at=?,last_error=?,updated_at=?",values:[target,input.action==="retry"?at:null,receipt?at:null,evidence,at]}
    :input.kind==="telegram"?{sql:"status=?,next_attempt_at=?,sent_at=?,last_error=?,updated_at=?,telegram_message_id=COALESCE(?,telegram_message_id)",values:[target,at,receipt?at:null,evidence,at,receipt?Number(receipt):null]}
    :input.kind==="assignment"?{sql:"status=?,scheduled_for=?,sent_at=?,error_message=?,updated_at=?",values:[target,at,receipt?at:null,evidence,at]}
    :{sql:"telegram_status=?,telegram_message_id=CASE WHEN ?=1 THEN ? ELSE telegram_message_id END",values:[target,input.destinationType==="group"&&receipt?1:0,receipt?Number(receipt):null]};
  const comparisons=fields.map(field=>`s.${field} IS ?`).join(" AND "),expected=fields.map(field=>job[field]);
  const routeGuard=input.kind==="chat"&&receipt?{sql:" AND NOT EXISTS(SELECT 1 FROM (SELECT conversation_id FROM telegram_message_routes WHERE chat_id=? AND message_id=? UNION ALL SELECT conversation_id FROM telegram_dm_messages WHERE chat_id=? AND message_id=?) WHERE conversation_id<>?)",values:[input.destinationId,Number(receipt),input.destinationId,Number(receipt),job.conversation_id]}:{sql:"",values:[]};
  const statements=[
    db.prepare(`UPDATE ${sources[input.kind].table} SET ${set.sql} WHERE id IN(SELECT s.id FROM (${selectSource(input.kind)}) s WHERE ${comparisons})
      AND (SELECT COALESCE(MAX(sequence),0) FROM notification_delivery_reviews WHERE kind=? AND job_id=?)=? AND NOT EXISTS(SELECT 1 FROM notification_delivery_reviews WHERE request_id=?)${routeGuard.sql}`)
      .bind(...set.values,...expected,input.kind,job.id,job.review_sequence,input.requestId,...routeGuard.values),
    // changes() belongs to the immediately preceding guarded update. CHECK=1
    // aborts the entire batch on a stale decision; no false audit event commits.
    db.prepare(`INSERT INTO notification_delivery_reviews(request_id,kind,job_id,expected_version,payload_hash,actor_id,action,reason,previous_status,previous_attempts,previous_attempted_at,previous_next_attempt_at,confirmed_absent,provider_message_id,created_at,destination_type,destination_id,use_as_root,applied_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,changes())`).bind(input.requestId,input.kind,job.id,input.expectedVersion,payloadHash,actorId,input.action,input.reason,job.status,job.attempts,job.attempted_at,job.next_attempt_at,input.confirmedAbsent?1:0,receipt,at,input.destinationType??null,input.destinationId||null,input.useAsRoot?1:0),
  ];
  if(input.kind==="booking"){
    statements.push(db.prepare("UPDATE booking_delivery_payloads SET provider_message_id=COALESCE(?,provider_message_id) WHERE delivery_id=?").bind(receipt,job.id));
    statements.push(bookingDeliverySummary(db,String(job.reference),at));
  }else if(input.kind==="assignment"||input.kind==="chat")statements.push(db.prepare(`UPDATE ${input.kind==="assignment"?"telegram_assignment_payloads":"telegram_chat_payloads"} SET next_attempt_at=?,provider_message_id=COALESCE(?,provider_message_id),last_error=? WHERE id=?`).bind(input.action==="retry"?at:null,receipt?Number(receipt):null,evidence,job.id));
  const guard={sql:"EXISTS(SELECT 1 FROM notification_delivery_reviews WHERE request_id=? AND payload_hash=?)",values:[input.requestId,payloadHash]};
  if(input.kind==="telegram"&&receipt){
    let payload:DeliveryPayload;try{payload=JSON.parse(job.raw_payload??"null");if(!payload||typeof payload.text!=="string")throw new Error();}catch{throw new DeliveryReviewError(409,"The stored Telegram route is unavailable.");}
    statements.push(...telegramLinkedStatements(db,payload,Number(receipt),guard,at));
  }
  if(input.kind==="chat"){
    if(receipt)statements.push(...chatLinkedStatements(db,{conversationId:String(job.conversation_id),destination:input.destinationId,messageId:Number(receipt),group:input.destinationType==="group",root:input.useAsRoot},guard,at));
    if(input.action!=="retry")statements.push(db.prepare("DELETE FROM telegram_chat_card_claims WHERE message_id=?").bind(job.id));
  }
  try{await db.batch(statements);}catch{
    if(await replay())return {ok:true,replayed:true,requestId:input.requestId};
    if(await receiptConflict())throw new DeliveryReviewError(409,"That receipt is already routed to another conversation.");
    const fresh=await deliveryReviewJob(db,input.kind,input.jobId);
    if(!fresh||await version(fresh)!==input.expectedVersion)throw new DeliveryReviewError(409,"This delivery changed. Refresh it before reviewing.");
    throw new DeliveryReviewError(503,"The review was not committed. Retry the same request ID.");
  }
  return {ok:true,replayed:false,requestId:input.requestId};
}
