export type EmailFailureCode = "configuration" | "network_unknown" | "unverified_response" | "rate_limited" | "provider_unavailable" | "request_in_progress" | "payload_conflict" | "request_rejected" | "conflict_unknown";
export type EmailDelivery = {
  status: "sent" | "failed" | "pending_configuration";
  providerMessageId?: string;
  retryable?: boolean;
  outcomeUnknown?: boolean;
  failureCode?: EmailFailureCode;
  retryAfterMs?: number;
};

export function emailRetryAfter(value: string | null, now: number) {
  if (!value) return undefined;
  const delay = /^\d{1,8}$/.test(value.trim()) ? Number(value.trim()) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 86400000) : undefined;
}

/** Classify only bounded, allowlisted metadata; never retain provider messages. */
export function emailProviderOutcome(status: number, body: unknown, retryAfter: string | null = null, now = Date.now()): EmailDelivery {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as { id?: unknown; name?: unknown } : {};
  if ((status === 200 || status === 201) && typeof payload.id === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(payload.id)) {
    return { status: "sent", providerMessageId: payload.id };
  }
  const retryAfterMs = emailRetryAfter(retryAfter, now);
  if (status === 0) return { status: "failed", retryable: true, outcomeUnknown: true, failureCode: "network_unknown" };
  if (status >= 200 && status < 300) return { status: "failed", retryable: true, outcomeUnknown: true, failureCode: "unverified_response" };
  if (status === 429) return { status: "failed", retryable: true, outcomeUnknown: false, failureCode: "rate_limited", retryAfterMs };
  if (status === 409) {
    if (payload.name === "concurrent_idempotent_requests") return { status: "failed", retryable: true, outcomeUnknown: true, failureCode: "request_in_progress", retryAfterMs };
    if (payload.name === "invalid_idempotent_request") return { status: "failed", retryable: false, outcomeUnknown: true, failureCode: "payload_conflict" };
    return { status: "failed", retryable: false, outcomeUnknown: true, failureCode: "conflict_unknown" };
  }
  if (status === 408 || status === 425 || status >= 500) return { status: "failed", retryable: true, outcomeUnknown: true, failureCode: "provider_unavailable", retryAfterMs };
  return { status: "failed", retryable: false, outcomeUnknown: false, failureCode: "request_rejected" };
}
