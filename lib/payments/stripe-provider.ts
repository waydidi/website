import { env } from "cloudflare:workers";
import type { PaymentProviderAdapter, ProviderPaymentSession, VerifiedProviderWebhook } from "@/lib/payments/types";
import { constantTimeEqual } from "@/lib/security";
import { createCheckoutSession, refundPayment, retrieveCheckoutSession, type StripeCheckoutSession } from "@/lib/stripe";
import { classifyCheckoutSession } from "@/lib/payment-status";

export type StripeWebhookObject = StripeCheckoutSession & {
  amount?: number;
  amount_refunded?: number;
  failure_code?: string;
  last_payment_error?: { code?: string; message?: string };
};
export type StripeWebhookEvent = { id: string; type: string; data: { object: StripeWebhookObject } };

function signatureParts(header: string) {
  const parts = header.split(",").map((part) => part.split("="));
  return { timestamp: parts.find(([key]) => key === "t")?.[1], signatures: parts.filter(([key]) => key === "v1").map(([, value]) => value) };
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const result = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeStripeSession(session: StripeCheckoutSession): ProviderPaymentSession {
  return {
    provider: "stripe",
    sessionId: session.id,
    transactionId: session.payment_intent,
    status: classifyCheckoutSession(session),
    providerStatus: session.payment_status ?? session.status,
    checkoutUrl: session.url,
    amountMinor: session.amount_total,
    currency: session.currency,
    bookingReference: session.metadata?.booking_reference,
  };
}

export const stripePaymentProvider: PaymentProviderAdapter = {
  name: "stripe",
  get enabled() { return Boolean(env.STRIPE_SECRET_KEY); },
  async createPayment(input) {
    const session = await createCheckoutSession(input);
    return { provider: "stripe", sessionId: session.id, checkoutUrl: session.url, status: "pending", providerStatus: "open", amountMinor: input.total * 100, currency: "thb", bookingReference: input.reference };
  },
  async retrievePayment(sessionId) { return normalizeStripeSession(await retrieveCheckoutSession(sessionId)); },
  async refundPayment(transactionId, reference) {
    const refund = await refundPayment(transactionId, reference);
    if (!refund.id) throw new Error("STRIPE_REFUND_INVALID");
    return { id: refund.id, status: refund.status ?? "processing" };
  },
  async verifyWebhook(rawBody, signatureHeader): Promise<VerifiedProviderWebhook<StripeWebhookEvent>> {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_NOT_CONFIGURED");
    const { timestamp, signatures } = signatureParts(signatureHeader);
    if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("INVALID_WEBHOOK_SIGNATURE");
    const expected = await hmac(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
    if (!signatures.some((signature) => constantTimeEqual(signature, expected))) throw new Error("INVALID_WEBHOOK_SIGNATURE");
    let event: StripeWebhookEvent;
    try { event = JSON.parse(rawBody) as StripeWebhookEvent; }
    catch { throw new Error("INVALID_WEBHOOK_EVENT"); }
    if (!event.id || !event.type || !event.data?.object) throw new Error("INVALID_WEBHOOK_EVENT");
    return { id: event.id, type: event.type, payload: event };
  },
};
