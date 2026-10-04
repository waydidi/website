import type { SecurityDatabase } from "./worker-db";

const ready = new WeakMap<object, Promise<void>>();
export function ensureChatAssignments(db: SecurityDatabase) {
  let setup = ready.get(db);
  if (!setup) {
    setup = db.prepare(`CREATE TABLE IF NOT EXISTS website_chat_assignments (
      conversation_id TEXT PRIMARY KEY REFERENCES website_conversations(id) ON DELETE CASCADE,
      staff_id TEXT NOT NULL REFERENCES staff_accounts(id), staff_name TEXT NOT NULL, assigned_at TEXT NOT NULL
    )`).run().then(() => undefined).catch(error => { ready.delete(db); throw error; });
    ready.set(db, setup);
  }
  return setup;
}
export const CHAT_MESSAGE_SELECT = `SELECT m.id,m.sender,m.body,m.created_at,
  CASE WHEN m.sender='staff' THEN COALESCE(a.staff_name,s.display_name,'Waydidi team') ELSE NULL END staff_name
  FROM website_chat_messages m LEFT JOIN staff_accounts s ON s.id=m.staff_id
  LEFT JOIN website_chat_assignments a ON a.conversation_id=m.conversation_id AND a.staff_id=m.staff_id`;
