import type { SecurityDatabase } from "@/lib/worker-db";
import type { DeliveryPayload } from "./outbox";

export type AcknowledgmentGuard = { sql: string; values: unknown[] };
export function telegramLinkedStatements(db: SecurityDatabase, p: DeliveryPayload, messageId: number, guard: AcknowledgmentGuard, at = new Date().toISOString()) {
  const statements = [];
  if(p.prompt){
    statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_booking_prompts(telegram_message_id,booking_reference,field,telegram_user_id,created_at) SELECT ?,?,?,?,? WHERE ${guard.sql}`).bind(messageId,p.prompt.reference,p.prompt.field,p.prompt.userId,at,...guard.values));
    statements.push(db.prepare(`INSERT OR IGNORE INTO telegram_prompt_context(message_id,booking_version) SELECT ?,? WHERE ${guard.sql}`).bind(messageId,p.prompt.version,...guard.values));
  }
  const target=p.target;
  if(target?.kind==="booking_card")statements.push(db.prepare(`UPDATE telegram_booking_cards SET telegram_message_id=? WHERE booking_reference=? AND telegram_message_id=0 AND ${guard.sql}`).bind(messageId,target.id,...guard.values));
  if(target?.kind==="driver_offer")statements.push(db.prepare(`UPDATE telegram_driver_jobs SET telegram_message_id=?,updated_at=? WHERE booking_reference=? AND telegram_message_id=0 AND ${guard.sql}`).bind(messageId,at,target.id,...guard.values));
  if(target?.kind==="request_card")statements.push(db.prepare(`UPDATE telegram_request_cards SET telegram_message_id=? WHERE id=? AND telegram_message_id=0 AND ${guard.sql}`).bind(messageId,target.id,...guard.values));
  if(target?.kind==="handover")statements.push(db.prepare(`UPDATE website_conversations SET bot_state=json_set(COALESCE(bot_state,'{}'),'$.card',?,'$.waitUntil',NULL) WHERE id=? AND ${guard.sql}`).bind(messageId,target.id,...guard.values));
  return statements;
}
export function chatLinkedStatements(db: SecurityDatabase, input: { conversationId: string; destination: string; messageId: number; group: boolean; root: boolean }, guard: AcknowledgmentGuard, at = new Date().toISOString()) {
  if(!input.group)return [db.prepare(`INSERT OR IGNORE INTO telegram_dm_messages(chat_id,message_id,conversation_id,created_at) SELECT ?,?,?,? WHERE ${guard.sql}`).bind(input.destination,input.messageId,input.conversationId,at,...guard.values)];
  const statements=[db.prepare(`INSERT OR IGNORE INTO telegram_message_routes(chat_id,message_id,conversation_id) SELECT ?,?,? WHERE ${guard.sql}`).bind(input.destination,input.messageId,input.conversationId,...guard.values)];
  if(input.root)statements.push(db.prepare(`UPDATE website_conversations SET telegram_message_id=? WHERE id=? AND telegram_message_id IS NULL AND ${guard.sql}`).bind(input.messageId,input.conversationId,...guard.values));
  return statements;
}
