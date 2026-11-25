// Pure rules for the 3-day quote reminder (Sales Intelligence PR 6). WhatsApp allows a business message more than
// 24 hours after the customer's last message only as an approved template, so the reminder is a template, and it
// goes only to customers who replied YES to "Would you like a reminder in 3 days?" under their quote (owner decision D28).

export const REMINDER_AFTER_DAYS = 3;
/** The YES must come within this time after the quote was sent. */
export const CONSENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A clear yes on its own (English, Thai, Chinese). "Yes, but…" or a question is not consent. */
const YES = /^\s*(yes|y|yes please|yes pls|ok yes|yep|sure|ใช่|ใช่ค่ะ|ใช่ครับ|ได้|ได้ค่ะ|ได้ครับ|ค่ะ|ครับ|เอา|好|好的|是|是的|要)\s*[.!👍🙏]*\s*$/iu;
export const isReminderYes = (body: string | null | undefined) => YES.test(body ?? "");

/**
 * WHATSAPP_TEMPLATE_LANGUAGES="en:en_US,th:th,zh:zh_CN": the language code each template translation was created
 * with in WhatsApp Manager. A locale without a code falls back to English.
 */
export function templateLanguage(locale: "en" | "th" | "zh", value: string | null | undefined): string {
  const map = new Map<string, string>([["en", "en"], ["th", "th"], ["zh", "zh_CN"]]);
  for (const pair of (value ?? "").split(",")) {
    const [loc, code] = pair.split(":").map((s) => s?.trim());
    if (loc && code && /^(en|th|zh)$/.test(loc) && /^[a-z]{2,3}(_[A-Z]{2})?$/.test(code)) map.set(loc, code);
  }
  return map.get(locale) ?? map.get("en")!;
}

/** Template names as WhatsApp Manager allows them: lowercase letters, digits and underscores. */
export const validTemplateName = (name: string | null | undefined): name is string => typeof name === "string" && /^[a-z0-9_]{1,512}$/.test(name);
/** Template states that must not be used (from Meta's message_template_status_update webhook). */
export const BLOCKED_TEMPLATE_STATES = new Set(["REJECTED", "PAUSED", "DISABLED", "PENDING_DELETION", "DELETED", "FLAGGED", "LIMIT_EXCEEDED"]);

export type ReminderState = {
  now: number; flagOn: boolean; templateName: string | null; templateState: string | null; accepted: boolean; optedOut: boolean; declined: boolean;
  repliedSinceConsent: boolean; assignedName: string | null; channelOff: boolean; firstPickupAt: number; sentThisWeek: number; quiet: boolean;
};
export type ReminderDecision = { send: true } | { send: false; outcome: "cancelled" | "suppressed" | "later"; reason: string };

/** Decided when the reminder is due, from the chat as it is then. */
export function reminderDecision(s: ReminderState): ReminderDecision {
  if (!s.flagOn) return { send: false, outcome: "suppressed", reason: "template reminders switched off" };
  if (!validTemplateName(s.templateName)) return { send: false, outcome: "suppressed", reason: "no approved template configured" };
  if (s.templateState && BLOCKED_TEMPLATE_STATES.has(s.templateState)) return { send: false, outcome: "suppressed", reason: `template is ${s.templateState.toLowerCase()} in WhatsApp` };
  if (s.accepted) return { send: false, outcome: "cancelled", reason: "quote accepted" };
  if (s.declined) return { send: false, outcome: "cancelled", reason: "customer declined" };
  if (s.optedOut) return { send: false, outcome: "cancelled", reason: "customer asked not to be contacted" };
  if (s.repliedSinceConsent) return { send: false, outcome: "cancelled", reason: "customer wrote again; the chat continues normally" };
  if (s.firstPickupAt <= s.now) return { send: false, outcome: "cancelled", reason: "trip date passed" };
  if (s.assignedName) return { send: false, outcome: "suppressed", reason: `${s.assignedName} has the chat` };
  if (s.channelOff) return { send: false, outcome: "suppressed", reason: "assistant switched off on WhatsApp" };
  if (s.sentThisWeek >= 1) return { send: false, outcome: "suppressed", reason: "a reminder was already sent this week" };
  if (s.quiet) return { send: false, outcome: "later", reason: "quiet hours" };
  return { send: true };
}
