import { env } from "cloudflare:workers";

export const VEHICLES = {
  economy_sedan: {
    name: "Economy sedan",
    total: 1250,
    capacity: 3,
    luggageCapacity: 2,
  },
  comfort_bmw: {
    name: "Comfort BMW",
    total: 1800,
    capacity: 3,
    luggageCapacity: 3,
  },
  comfort_suv: {
    name: "Comfort SUV",
    total: 2200,
    capacity: 4,
    luggageCapacity: 4,
  },
  premium_minivan: {
    name: "Premium Minivan",
    total: 2850,
    capacity: 9,
    luggageCapacity: 8,
  },
} as const;

export type VehicleId = keyof typeof VEHICLES;

export async function createCheckoutSession(input: {
  reference: string;
  accessToken: string;
  customerEmail: string;
  vehicle: VehicleId;
  total: number;
  origin: string;
}) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const selected = VEHICLES[input.vehicle];
  const params = new URLSearchParams({
    mode: "payment",
    customer_email: input.customerEmail,
    success_url: `${input.origin}/booking/confirmation/${input.reference}?token=${input.accessToken}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/?payment=cancelled`,
    "line_items[0][price_data][currency]": "thb",
    "line_items[0][price_data][unit_amount]": String(input.total * 100),
    "line_items[0][price_data][product_data][name]": `Waydidi · ${selected.name}`,
    "line_items[0][quantity]": "1",
    "metadata[booking_reference]": input.reference,
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `checkout-${input.reference}`,
    },
    body: params,
  });
  const result = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !result.id || !result.url)
    throw new Error(
      result.error?.message ?? "Stripe Checkout could not start.",
    );
  return { id: result.id, url: result.url };
}

export async function retrieveCheckoutSession(sessionId: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("INVALID_SESSION");
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    },
  );
  const result = (await response.json()) as {
    id?: string;
    payment_intent?: string;
    payment_status?: string;
    amount_total?: number;
    currency?: string;
    metadata?: { booking_reference?: string };
    error?: { message?: string };
  };
  if (!response.ok || !result.id)
    throw new Error(result.error?.message ?? "Stripe session unavailable.");
  return result;
}

export async function refundPayment(
  paymentIntentId: string,
  reference: string,
) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `refund-${reference}`,
    },
    body: new URLSearchParams({
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
    }),
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
