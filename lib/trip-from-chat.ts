import Anthropic from "@anthropic-ai/sdk";
import { env } from "cloudflare:workers";
import { assistantFailure, type AssistantFailure } from "@/lib/assistant-error-rules";
import { MAX_CHAT_CHARS, SYSTEM_PROMPT, parseChatPlan, userPrompt, type ChatDraft, type PlaceOption } from "@/lib/trip-chat-rules";

// Claude Haiku 5.5 at medium effort (a chat into a trip plan is more work than reading fields). It thinks before it
// answers and that counts toward max_tokens, so the cap leaves room for both; a refusal or a cut-off plan is an error.
const MODEL = "claude-haiku-5-5";
export const chatPlanConfigured = () => Boolean((env as unknown as Record<string, string | undefined>).ANTHROPIC_API_KEY);

export type ModelCall = (system: string, user: string) => Promise<string>;
const callClaude: ModelCall = async (system, user) => {
  const client = new Anthropic({ apiKey: (env as unknown as Record<string, string | undefined>).ANTHROPIC_API_KEY, timeout: 40_000, maxRetries: 1 });
  const res = await client.messages.create({ model: MODEL, max_tokens: 8000, output_config: { effort: "medium" }, system, messages: [{ role: "user", content: user }] });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`trip planner stopped: ${res.stop_reason}`);
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
};

/**
 * Customer chat text → a checked draft trip. Errors are plain sentences for staff; `failure` says why the AI call
 * failed (e.g. "credit" when the Anthropic account is out of credit), from the SDK error only, never the text.
 */
export async function draftFromChat(chat: string, places: PlaceOption[], today: string, call: ModelCall = callClaude): Promise<{ ok: true; draft: ChatDraft } | { ok: false; error: string; failure?: AssistantFailure }> {
  const text = chat.trim();
  if (text.length < 10) return { ok: false, error: "Paste the customer's chat first." };
  if (text.length > MAX_CHAT_CHARS * 3) return { ok: false, error: `That is too long. Paste the last part of the chat (up to ${MAX_CHAT_CHARS} characters).` };
  let raw: string;
  try { raw = await call(SYSTEM_PROMPT, userPrompt(text.slice(-MAX_CHAT_CHARS), places, today)); }
  catch (error) {
    const failure = assistantFailure(error);
    return { ok: false, error: failure.code === "credit" ? failure.reason : "The planner could not read the chat just now. Try again in a moment.", failure };
  }
  const draft = parseChatPlan(raw, places, today, () => crypto.randomUUID().slice(0, 8));
  return draft ? { ok: true, draft } : { ok: false, error: "The planner's answer could not be read. Try again, or add stops by hand." };
}
