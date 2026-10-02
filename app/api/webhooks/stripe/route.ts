import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { reconcileRefunds } from "@/lib/refunds";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { markProviderFailure, reconcileBooking } from "@/lib/payment-reconciliation";
import { claimPaymentProviderEvent, completePaymentProviderEvent, failPaymentProviderEvent } from "@/lib/payment-provider-events";
import { paymentProviderFor } from "@/lib/payments/provider";
import { type StripeWebhookEvent } from "@/lib/payments/stripe-provider";

async function processStripeEvent(event: StripeWebhookEvent) {
  const object = event.data.object;
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
    const reference = object.metadata?.booking_reference;
    if (!reference) return;
    const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!booking) return;
    if (object.id !== booking.checkoutSessionId) return;
    if (event.type === "checkout.session.async_payment_failed") {
      await markProviderFailure(reference, "async_payment_failed", "Stripe reported that the payment failed.", `stripe:${event.id}`);
      return;
    }
    if (object.id !== booking.checkoutSessionId) return;
    await reconcileBooking(reference, "webhook");
    return;
  }
  if (event.type === "payment_intent.payment_failed") {
    const reference = object.metadata?.booking_reference;
    const [bound] = reference ? await getDb().select().from(bookings).where(eq(bookings.reference,reference)).limit(1) : [];
    if (reference && bound?.paymentIntentId === object.id) await markProviderFailure(reference, object.last_payment_error?.code ?? object.failure_code ?? "payment_failed", object.last_payment_error?.message ?? "Stripe reported that the payment failed.", `stripe:${event.id}`);
  } else if (event.type === "payment_intent.succeeded") {
    const reference = object.metadata?.booking_reference;
    if (reference) await reconcileBooking(reference, "webhook");
  } else if (["charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed", "refund.created", "refund.updated", "refund.failed"].includes(event.type) && object.payment_intent) {
    const [b] = await getDb().select().from(bookings).where(eq(bookings.paymentIntentId,object.payment_intent)).limit(1);
    if (b) {
      await reconcileBooking(b.reference,"webhook");
      // Refund records only become "refunded" once Stripe confirms them.
      if (event.type.startsWith("refund.") || event.type === "charge.refunded") await reconcileRefunds(b.reference);
    }
  }
}

export async function POST(request: Request) {
  const raw = await request.text();
  let event: StripeWebhookEvent;
  try {
    const verified = await paymentProviderFor("stripe").verifyWebhook(raw, request.headers.get("stripe-signature") ?? "");
    event = verified.payload as StripeWebhookEvent;
  } catch (error) {
    const unavailable = error instanceof Error && error.message === "STRIPE_WEBHOOK_NOT_CONFIGURED";
    return NextResponse.json({ error: unavailable ? "Webhook unavailable" : "Invalid signature" }, { status: unavailable ? 503 : 400 });
  }
  const claim = await claimPaymentProviderEvent({ provider: "stripe", providerEventId: event.id, eventType: event.type, rawPayload: raw });
  if (!claim.claimed) {
    if (claim.reason === "payload_mismatch") return NextResponse.json({ error: "Event conflict" }, { status: 409 });
    if (claim.reason === "processing") return NextResponse.json({ error: "Event is still processing" }, { status: 503 });
    return NextResponse.json({ received: true, duplicate: true });
  }
  try {
    await processStripeEvent(event);
    await completePaymentProviderEvent(claim.id);
  } catch (error) {
    await failPaymentProviderEvent(claim.id, error);
    return NextResponse.json({ error: "Payment processing will be retried" }, { status: 503 });
  }
  return NextResponse.json({ received: true });
}
