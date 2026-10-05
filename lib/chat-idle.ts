import { env } from "cloudflare:workers";
import { addBotMessage } from "@/lib/website-chat";

// "Are you still with us?": when we (staff or Non) replied and the customer has been quiet for
// 10 minutes, one polite check-in is sent. It is never repeated until the customer writes again.
export const NUDGE_AFTER_MS = 10 * 60 * 1000;
/** After this long with no messages at all, the inbox offers "Completed" / "Follow up". */
export const IDLE_ACTIONS_AFTER_MS = 15 * 60 * 1000;

export const NUDGE_TEXT = "Hi, just checking in. Are you still with us? If you have any other questions or would like help with your booking, simply reply here and we'll be happy to help.";

type Row = { id: string; last_id: string; last_sender: string; last_at: string; idle_nudge_msg_id: string | null };

export async function sendIdleNudges(now = new Date(), limit = 50) {
  const db = env.DB as { prepare: (s: string) => { bind: (...v: unknown[]) => { all: <T>() => Promise<{ results: T[] }> } } };
  const before = new Date(now.getTime() - NUDGE_AFTER_MS).toISOString();
  // Only recent chats (last 2 hours) so old conversations never get a sudden message.
  const since = new Date(now.getTime() - 2 * 3600_000).toISOString();
  const rows = (await db.prepare(`SELECT c.id,c.idle_nudge_msg_id,m.id last_id,m.sender last_sender,m.created_at last_at
    FROM website_conversations c JOIN website_chat_messages m ON m.rowid=(SELECT MAX(rowid) FROM website_chat_messages WHERE conversation_id=c.id)
    WHERE c.status='open' AND c.expires_at>? AND m.sender='staff' AND m.created_at<=? AND m.created_at>? LIMIT ?`)
    .bind(now.toISOString(), before, since, limit).all<Row>()).results;
  let sent = 0;
  for (const r of rows) {
    if (r.idle_nudge_msg_id === r.last_id) continue; // the last message is already our check-in
    const id = await addBotMessage(r.id, NUDGE_TEXT);
    if (id) {
      await (env.DB as { prepare: (s: string) => { bind: (...v: unknown[]) => { run: () => Promise<unknown> } } })
        .prepare("UPDATE website_conversations SET idle_nudge_msg_id=? WHERE id=?").bind(id, r.id).run();
      sent++;
    }
  }
  return sent;
}
