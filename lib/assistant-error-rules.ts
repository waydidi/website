// Why a Claude call failed, in words the team can act on (Telegram /c and /ask). Pure: unit tested directly.
// Reads only the Anthropic SDK error's status, error type, class name and our own markers; never the request,
// the post or the key, so the reason is safe to show in the group.
export type AssistantFailure = { code: string; reason: string };

export function assistantFailure(error: unknown): AssistantFailure {
  const e = (error && typeof error === "object" ? error : {}) as { name?: unknown; message?: unknown; status?: unknown; error?: unknown };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const body = (e.error && typeof e.error === "object" ? e.error : {}) as { error?: { type?: unknown; message?: unknown }; type?: unknown };
  const type = typeof body.error?.type === "string" ? body.error.type : typeof body.type === "string" ? body.type : "";
  const detail = typeof body.error?.message === "string" ? body.error.message : message;

  if (message.startsWith("Telegram: ")) return { code: "telegram", reason: `The draft was ready but Telegram refused to post it (${message.slice(10)}). Tell the developer.` };
  if (message === "UNREADABLE") return { code: "unreadable", reason: "Claude's answer couldn't be read. Try again." };
  // SDK connection errors carry a "status" property that is empty (class names can be minified away).
  const sdkConnection = "status" in e && e.status === undefined;
  if (name === "TimeoutError" || name === "AbortError" || (sdkConnection && /timed out/i.test(message))) return { code: "timeout", reason: "Claude didn't answer in time. Try again in a minute." };
  if (sdkConnection) return { code: "connection", reason: "The website couldn't reach Anthropic. Try again in a minute." };
  if (status === 401 || type === "authentication_error") return { code: "auth", reason: "Anthropic refused the API key. The owner should check ANTHROPIC_API_KEY in Cloudflare." };
  if (status === 403 || type === "permission_error") return { code: "permission", reason: "The API key isn't allowed to use this model or tool. The owner should check the Anthropic Console." };
  if (/credit balance/i.test(detail)) return { code: "credit", reason: "The Anthropic account is out of credit. The owner should add credit in the Anthropic Console (Billing)." };
  if (status === 404 || type === "not_found_error") return { code: "model", reason: "The AI model isn't available on this Anthropic account." };
  if (status === 429 || type === "rate_limit_error") return { code: "rate_limited", reason: "Anthropic's rate limit was reached. Try again in a minute." };
  if (status === 529 || type === "overloaded_error" || status >= 500) return { code: "busy", reason: "Anthropic is busy right now. Try again in a minute." };
  if (status === 400 || type === "invalid_request_error") return { code: "invalid_request", reason: "Anthropic rejected the request (invalid_request_error). Tell the developer." };
  return { code: "unknown", reason: "Something went wrong. Try again in a moment." };
}
