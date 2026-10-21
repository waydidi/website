import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { MAX_CHAT_CHARS, SYSTEM_PROMPT, parseChatPlan, userPrompt, type ChatDraft, type PlaceOption } from "@/lib/trip-chat-rules";

const MODEL = "claude-haiku-4-5";
export const chatPlanConfigured = () => Boolean((env as unknown as Record<string, string | undefined>).ANTHROPIC_API_KEY);

export type ModelCall = (system: string, user: string) => Promise<string>;
const callClaude: ModelCall = async (system, user) => {
  const client = new Anthropic({ apiKey: (env as unknown as Record<string, string | undefined>).ANTHROPIC_API_KEY, timeout: 40_000, maxRetries: 1 });
  const res = await client.messages.create({ model: MODEL, max_tokens: 3000, system, messages: [{ role: "user", content: user }] });
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
};

/** Customer chat text → a checked draft trip. Errors are plain sentences for staff. */
export async function draftFromChat(chat: string, places: PlaceOption[], today: string, call: ModelCall = callClaude): Promise<{ ok: true; draft: ChatDraft } | { ok: false; error: string }> {
  const text = chat.trim();
  if (text.length < 10) return { ok: false, error: "Paste the customer's chat first." };
  if (text.length > MAX_CHAT_CHARS * 3) return { ok: false, error: `That is too long. Paste the last part of the chat (up to ${MAX_CHAT_CHARS} characters).` };
  let raw: string;
  try { raw = await call(SYSTEM_PROMPT, userPrompt(text.slice(-MAX_CHAT_CHARS), places, today)); } catch { return { ok: false, error: "The planner could not read the chat just now. Try again in a moment." }; }
  const draft = parseChatPlan(raw, places, today, () => crypto.randomUUID().slice(0, 8));
  return draft ? { ok: true, draft } : { ok: false, error: "The planner's answer could not be read. Try again, or add stops by hand." };
}
