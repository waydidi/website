import { env } from "cloudflare:workers";
import { paysoConfigured } from "@/lib/chat-pay";
import { SUPPORT_EMAIL, WHATSAPP } from "@/lib/contact";
import { getMessages, translate } from "@/lib/i18n";
import { slipConfig } from "@/lib/payment-slip-rules";
import { paymentProviderFor } from "@/lib/payments/provider";
import { fixedQuestion } from "./fixed-reply-rules";
import { publicHoursReply } from "./knowledge";

export const fixedRepliesOn = () => (env as unknown as Record<string, unknown>).ASSISTANT_FIXED_REPLIES === "1";

export async function fixedReply(text: string, channel: string) {
  const question = fixedQuestion(text);
  if (!question) return null;
  const { kind, locale } = question;
  const messages = getMessages(locale);
  if (kind === "hours") {
    const reply = await publicHoursReply(locale);
    return reply ? { kind, reply } : null;
  }
  if (kind === "contact") {
    return { kind, reply: translate(messages, "assistant.faq.contact", { email: SUPPORT_EMAIL, whatsapp: WHATSAPP }) };
  }
  const methods: string[] = [];
  if (paymentProviderFor("stripe").enabled) methods.push(messages["assistant.faq.card"]);
  if (paymentProviderFor("cash").enabled) methods.push(messages["assistant.faq.cash"]);
  if (slipConfig(env as unknown as Record<string, unknown>)) methods.push(messages["assistant.faq.transfer"]);
  if (channel === "web" && paysoConfigured()) methods.push(messages["assistant.faq.payso"]);
  if (!methods.length) return null;
  const list = new Intl.ListFormat(locale, { type: "disjunction" }).format(methods);
  return { kind, reply: translate(messages, "assistant.faq.payment", { methods: list }) };
}
