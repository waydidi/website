import { env } from "cloudflare:workers";
import { SITE_URL } from "./site";
import { ensureChatAssignments } from "./website-chat";
import type { SecurityDatabase } from "./worker-db";

const schemas = [
 `CREATE TABLE IF NOT EXISTS website_telegram_staff (telegram_user_id TEXT PRIMARY KEY, staff_id TEXT NOT NULL UNIQUE REFERENCES staff_accounts(id))`,
 `CREATE TABLE IF NOT EXISTS website_telegram_deliveries (
  website_message_id TEXT PRIMARY KEY REFERENCES website_chat_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES website_conversations(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL, telegram_message_id INTEGER, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT NOT NULL, lease_until TEXT,
  UNIQUE(chat_id,telegram_message_id))`,
];
const ready = new WeakMap<object, Promise<void>>();
export async function ensureTelegramChat(db: SecurityDatabase = env.DB) {
  await ensureChatAssignments(db);
  let promise = ready.get(db);
  if (!promise) { promise = db.batch(schemas.map(sql=>db.prepare(sql))).then(()=>undefined).catch(error=>{ready.delete(db);throw error;}); ready.set(db,promise); }
  return promise;
}
export function telegramChatConfig() {
  const token = typeof env.TELEGRAM_BOT_TOKEN === "string" ? env.TELEGRAM_BOT_TOKEN.trim() : "";
  const chatId = typeof env.TELEGRAM_CHAT_ID === "string" ? env.TELEGRAM_CHAT_ID.trim() : "";
  const secret = typeof env.TELEGRAM_WEBHOOK_SECRET === "string" ? env.TELEGRAM_WEBHOOK_SECRET : "";
  return {token,chatId,secret,configured:/^\d+:[A-Za-z0-9_-]+$/.test(token)&&/^-?\d+$/.test(chatId)&&/^[A-Za-z0-9_-]{32,256}$/.test(secret)};
}
export async function telegramCall(method: "sendMessage" | "setWebhook", input: Record<string, unknown>) {
  const {token,configured}=telegramChatConfig(); if(!configured)throw new Error("Telegram chat is not configured.");
  // Never log fetch errors: the bot token is part of the provider URL.
  let response:Response;
  try {response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(8000)});} catch {throw new Error("Telegram request failed.");}
  const data=await response.json().catch(()=>null) as {ok?:boolean;result?:{message_id?:number}}|null;
  if(!response.ok||data?.ok!==true)throw new Error("Telegram request was rejected.");
  return data.result;
}
export async function flushTelegramChatDelivery() {
  const config=telegramChatConfig();if(!config.configured)return;
  await ensureTelegramChat();const now=new Date().toISOString();
  const pending=(await env.DB.prepare(`SELECT d.website_message_id,d.conversation_id,d.chat_id,m.body
   FROM website_telegram_deliveries d JOIN website_chat_messages m ON m.id=d.website_message_id
   JOIN website_conversations c ON c.id=d.conversation_id
   WHERE d.chat_id=? AND d.telegram_message_id IS NULL AND d.attempts<8 AND d.retry_at<=? AND (d.lease_until IS NULL OR d.lease_until<?)
   AND c.expires_at>? ORDER BY m.rowid LIMIT 10`).bind(config.chatId,now,now,now).all()).results as {website_message_id:string;conversation_id:string;chat_id:string;body:string}[];
  await Promise.all(pending.map(async row=>{
   const lease=new Date(Date.now()+60000).toISOString();
   const claimed=await env.DB.prepare(`UPDATE website_telegram_deliveries SET status='sending',attempts=attempts+1,lease_until=?
    WHERE website_message_id=? AND telegram_message_id IS NULL AND attempts<8 AND retry_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING attempts`).bind(lease,row.website_message_id,now,now).first() as {attempts:number}|null;
   if(!claimed)return;
   try {
    const result=await telegramCall("sendMessage",{chat_id:row.chat_id,text:`Waydidi · Website chat\nCustomer ${row.conversation_id.slice(0,8)}\n\n${row.body}\n\nReply to THIS Telegram message to answer this customer.\n${SITE_URL}/admin/chat?id=${encodeURIComponent(row.conversation_id)}`,link_preview_options:{is_disabled:true}});
    if(!Number.isSafeInteger(result?.message_id))throw new Error("Invalid Telegram message response.");
    await env.DB.prepare("UPDATE website_telegram_deliveries SET status='sent',telegram_message_id=?,lease_until=NULL WHERE website_message_id=?").bind(result!.message_id,row.website_message_id).run();
   } catch {
    await env.DB.prepare("UPDATE website_telegram_deliveries SET status='pending',retry_at=?,lease_until=NULL WHERE website_message_id=?").bind(new Date(Date.now()+Math.min(3600000,30000*2**claimed.attempts)).toISOString(),row.website_message_id).run();
   }
  }));
}
export type TelegramUpdate={update_id?:number;message?:{message_id?:number;chat?:{id?:number};from?:{id?:number;is_bot?:boolean};text?:string;reply_to_message?:{message_id?:number}}};
export async function acceptTelegramChatReply(update:TelegramUpdate) {
 const config=telegramChatConfig(),message=update.message;
 if(!Number.isSafeInteger(update.update_id)||!Number.isSafeInteger(message?.message_id)||!Number.isSafeInteger(message?.from?.id)||message?.from?.is_bot||String(message?.chat?.id)!==config.chatId)return {status:"ignored" as const};
 if(typeof message?.text!=="string"||!message.text.trim()||message.text.length>2000||!Number.isSafeInteger(message.reply_to_message?.message_id))return {status:"ignored" as const};
 await ensureTelegramChat();
 const staff=await env.DB.prepare(`SELECT a.id,a.display_name FROM website_telegram_staff t JOIN staff_accounts a ON a.id=t.staff_id
  WHERE t.telegram_user_id=? AND a.active=1 AND a.role IN ('owner','operations','support')`).bind(String(message.from!.id)).first() as {id:string;display_name:string}|null;
 if(!staff)return {status:"ignored" as const};
 const chat=await env.DB.prepare(`SELECT d.conversation_id FROM website_telegram_deliveries d JOIN website_conversations c ON c.id=d.conversation_id
  WHERE d.chat_id=? AND d.telegram_message_id=? AND c.expires_at>?`).bind(config.chatId,message.reply_to_message!.message_id,new Date().toISOString()).first() as {conversation_id:string}|null;
 if(!chat)return {status:"unavailable" as const};
 const id=`telegram:${update.update_id}`,now=new Date().toISOString();
 if(await env.DB.prepare("SELECT id FROM website_chat_messages WHERE id=?").bind(id).first())return {status:"duplicate" as const};
 const result=await env.DB.batch([
  env.DB.prepare(`INSERT INTO website_chat_assignments(conversation_id,staff_id,staff_name,assigned_at) VALUES(?,?,?,?) ON CONFLICT(conversation_id) DO NOTHING`).bind(chat.conversation_id,staff.id,staff.display_name,now),
  env.DB.prepare(`INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at)
   SELECT ?,c.id,'staff',?,?,? FROM website_conversations c JOIN website_chat_assignments a ON a.conversation_id=c.id
   WHERE c.id=? AND c.expires_at>? AND a.staff_id=? ON CONFLICT(id) DO NOTHING`).bind(id,message.text.trim(),staff.id,now,chat.conversation_id,now,staff.id),
  env.DB.prepare("UPDATE website_conversations SET updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM website_chat_messages WHERE id=?)").bind(now,chat.conversation_id,id),
 ]);
 return {status:result[1].meta.changes?"delivered" as const:await env.DB.prepare("SELECT id FROM website_chat_messages WHERE id=?").bind(id).first()?"duplicate" as const:"assigned_elsewhere" as const};
}
