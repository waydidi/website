// Pure: strips secrets and personal data from text before it goes into the AI activity log.
// The log keeps decisions and evidence ids, never customer contact details, card data or keys.

const RULES: [RegExp, string][] = [
  // Bearer tokens and common provider key shapes (Anthropic, Stripe, Meta, Google, Telegram bot).
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [secret]"],
  [/\b(?:sk|pk|rk|whsec)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "[secret]"],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, "[secret]"],
  [/\bEAA[A-Za-z0-9]{20,}\b/g, "[secret]"],
  [/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[secret]"],
  [/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g, "[secret]"],
  [/\b(?:token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, "[secret]"],
  [/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[secret]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  // 13-19 digit runs (spaces/dashes allowed) look like card numbers; checked before phone numbers.
  [/\b(?:\d[ -]?){12,18}\d\b/g, "[card]"],
];
// Phone numbers: 9+ digits with spaces, dashes or brackets. ISO dates ("2026-11-24 09") are kept.
const PHONE = /\+?\d[\d ()-]{7,}\d/g;
const phone = (m: string) => (m.replace(/\D/g, "").length >= 9 && !/^\d{4}-\d{2}-\d{2}/.test(m) ? "[phone]" : m);

/** Redacted, single-line, bounded text for an activity log summary. */
export function redact(text: string | null | undefined, max = 500): string {
  if (!text) return "";
  let out = String(text);
  for (const [re, by] of RULES) out = out.replace(re, by);
  out = out.replace(PHONE, phone);
  out = out.replace(/\s+/g, " ").trim();
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** Redacts every string value in a small JSON-safe object (depth-limited). Keys named like secrets are dropped. */
export function redactDetail(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return redact(value, 300);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactDetail(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/token|secret|password|authorization|api_?key|card|cvv|passport/i.test(k)) continue;
      out[k] = redactDetail(v, depth + 1);
    }
    return out;
  }
  return null;
}
