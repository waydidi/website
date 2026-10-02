import { toSatang, assertSatang } from "./money";
import { env } from "cloudflare:workers";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
export { VEHICLES, type VehicleId } from "@/lib/vehicles";

export async function createCheckoutSession(input: {
  reference: string;
  accessToken: string;
  customerEmail: string;
  vehicle: VehicleId;
  total: number;
  origin: string;
  idempotencyKey: string;
}) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const selected = VEHICLES[input.vehicle];
  const params = new URLSearchParams({
    mode: "payment",
    expires_at: String(Math.floor(Date.now()/1000)+30*60),
    customer_email: input.customerEmail,
    // Embedded Checkout: the card form sits on Waydidi's own /pay page.
    ui_mode: "embedded",
    return_url: `${input.origin}/booking/confirmation/${input.reference}?token=${input.accessToken}&session_id={CHECKOUT_SESSION_ID}`,
    "line_items[0][price_data][currency]": "thb",
    "line_items[0][price_data][unit_amount]": String(toSatang(input.total)),
    "line_items[0][price_data][product_data][name]": `Waydidi · ${selected.name}`,
    "line_items[0][quantity]": "1",
    "metadata[booking_reference]": input.reference,
    "payment_intent_data[metadata][booking_reference]": input.reference,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `checkout-${input.idempotencyKey}`,
    },
    body: params,
    signal: AbortSignal.timeout(8000),
  });
  const result = (await response.json()) as {
    id?: string;
    client_secret?: string;
    error?: { message?: string };
  };
  if (!response.ok || !result.id || !result.client_secret)
    throw new Error(
      result.error?.message ?? "Stripe Checkout could not start.",
    );
  return { id: result.id, url: payPageUrl(input.origin, input.reference, input.accessToken, result.id) };
}

/** Waydidi's own payment page that shows the embedded Stripe form. */
export function payPageUrl(origin: string, reference: string, accessToken: string, sessionId: string) {
  return `${origin}/pay/${encodeURIComponent(reference)}?token=${encodeURIComponent(accessToken)}&session_id=${encodeURIComponent(sessionId)}`;
}

export type StripeCheckoutSession = {
  id?: string;
  client_secret?: string;
  ui_mode?: string;
  payment_intent?: string;
  payment_status?: string;
  status?: string;
  url?: string | null;
  amount_total?: number;
  currency?: string;
  metadata?: { booking_reference?: string };
  error?: { message?: string };
};

export async function retrieveCheckoutSession(sessionId: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("INVALID_SESSION");
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(8000),
    },
  );
  const result = (await response.json()) as StripeCheckoutSession;
  if (!response.ok || !result.id)
    throw new Error(result.error?.message ?? "Stripe session unavailable.");
  return result;
}

export async function refundPayment(
  paymentIntentId: string,
  reference: string,
  options: { amountMinor?: number; idempotencyKey?: string } = {},
) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const body = new URLSearchParams({ payment_intent: paymentIntentId, reason: "requested_by_customer", "metadata[booking_reference]": reference });
  body.set("metadata[refund_key]", options.idempotencyKey ?? `refund-${reference}`);
  if (options.amountMinor != null) body.set("amount", String(assertSatang(options.amountMinor)));
  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // One key per refund record, so a retry never refunds twice.
      "Idempotency-Key": options.idempotencyKey ?? `refund-${reference}`,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const result = (await response.json()) as {
    id?: string;
    status?: string;
    error?: { message?: string };
  };
  if (!response.ok || !result.id)
    throw new Error(result.error?.message ?? "Refund could not be started.");
  return result;
}

export async function retrieveRefund(refundId: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const response = await fetch(`https://api.stripe.com/v1/refunds/${encodeURIComponent(refundId)}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(8000) });
  const result = (await response.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "Refund status unavailable.");
  return result;
}

/** Recover a lost POST response by matching the immutable refund metadata and amount. */
export async function findRefund(input: { paymentId: string; reference: string; amountMinor: number; idempotencyKey: string }) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  let cursor = "";
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ payment_intent: input.paymentId, limit: "100" });
    if (cursor) query.set("starting_after", cursor);
    const response = await fetch(`https://api.stripe.com/v1/refunds?${query}`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("STRIPE_REFUND_LOOKUP_UNAVAILABLE");
    const result = await response.json() as { data: Array<{ id: string; status: string; amount: number; currency: string; metadata?: { booking_reference?: string; refund_key?: string } }>; has_more: boolean };
    if (!Array.isArray(result.data)) throw new Error("STRIPE_REFUND_LOOKUP_INVALID");
    const match = result.data.find(r => r.metadata?.refund_key === input.idempotencyKey && r.metadata.booking_reference === input.reference && r.amount === input.amountMinor && r.currency === "thb");
    if (match) return { id: match.id, status: match.status };
    if (!result.has_more) return null;
    const next = result.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error("STRIPE_REFUND_HISTORY_INCOMPLETE");
    cursor = next;
  }
  throw new Error("STRIPE_REFUND_HISTORY_INCOMPLETE");
}
