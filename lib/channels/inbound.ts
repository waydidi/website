import { scheduleNon } from "@/lib/cee/schedule";
import { sha256 } from "@/lib/security";
import { addVisitorMessage, conversationForChannelUser, createConversation, saveLineReplyToken } from "@/lib/website-chat";
import { CHANNEL_LABEL, showTyping, type Channel } from ".";

/** A customer message from WhatsApp or LINE: same conversation store, inbox, Telegram card and Non. */
export async function receiveChannelMessage(m: { channel: Exclude<Channel, "web">; userId: string; messageId: string; text: string; name?: string | null; phone?: string | null; lineReplyToken?: string | null }) {
  const text = m.text.trim().slice(0, 2000);
  if (!text) return;
  let c = await conversationForChannelUser(m.channel, m.userId);
  // Channel chats have no browser cookie; the token hash is random and never handed out.
  c ??= await createConversation(await sha256(crypto.randomUUID()), {
    channel: m.channel, channelUserId: m.userId, name: m.name ?? null, phone: m.phone ?? null, sourceTitle: CHANNEL_LABEL[m.channel], topic: CHANNEL_LABEL[m.channel],
  });
  const saved = await addVisitorMessage(c, text, `${m.channel}:${m.messageId}`.slice(0, 120));
  // Resume scheduling/token persistence after a partial webhook failure. runCee guards
  // against answering the same visitor message twice.
  if (m.lineReplyToken) await saveLineReplyToken(c.id, m.lineReplyToken);
  if (!saved.duplicate) await showTyping(m.channel, m.userId, m.messageId).catch(() => undefined);
  await scheduleNon(c.id).catch(() => undefined);
}
