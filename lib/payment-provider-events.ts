import { and, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentProviderEvents } from "@/db/schema";
import { safeErrorCode } from "@/lib/observability";
import { sha256 } from "@/lib/security";

export type PaymentEventClaim =
  | { claimed: true; id: string }
  | { claimed: false; reason: "processed" | "processing" | "payload_mismatch" };

export async function claimPaymentProviderEvent(input: {
  provider: "stripe" | "payso";
  providerEventId: string;
  eventType: string;
  rawPayload: string;
}): Promise<PaymentEventClaim> {
  const now = new Date().toISOString();
  const payloadHash = await sha256(input.rawPayload);
  const id = crypto.randomUUID();
  const inserted = await getDb().insert(paymentProviderEvents).values({
    id,
    provider: input.provider,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    payloadHash,
    receivedAt: now,
    updatedAt: now,
  }).onConflictDoNothing().returning({ id: paymentProviderEvents.id });
  if (inserted.length) return { claimed: true, id };

  const [existing] = await getDb().select().from(paymentProviderEvents).where(and(
    eq(paymentProviderEvents.provider, input.provider),
    eq(paymentProviderEvents.providerEventId, input.providerEventId),
  )).limit(1);
  if (!existing || existing.payloadHash !== payloadHash) return { claimed: false, reason: "payload_mismatch" };
  if (existing.processingStatus === "processed") return { claimed: false, reason: "processed" };
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  if (existing.processingStatus === "processing" && existing.updatedAt >= staleBefore) return { claimed: false, reason: "processing" };

  const retried = await getDb().update(paymentProviderEvents).set({
    processingStatus: "processing",
    processingAttempts: sql`${paymentProviderEvents.processingAttempts} + 1`,
    failureCode: null,
    updatedAt: now,
  }).where(and(
    eq(paymentProviderEvents.id, existing.id),
    or(
      eq(paymentProviderEvents.processingStatus, "failed"),
      and(eq(paymentProviderEvents.processingStatus, "processing"), lt(paymentProviderEvents.updatedAt, staleBefore)),
    ),
  )).returning({ id: paymentProviderEvents.id });
  return retried.length ? { claimed: true, id: existing.id } : { claimed: false, reason: "processing" };
}

export async function completePaymentProviderEvent(id: string) {
  const now = new Date().toISOString();
  await getDb().update(paymentProviderEvents).set({
    processingStatus: "processed",
    processedAt: now,
    failureCode: null,
    updatedAt: now,
  }).where(eq(paymentProviderEvents.id, id));
}

export async function failPaymentProviderEvent(id: string, error: unknown) {
  await getDb().update(paymentProviderEvents).set({
    processingStatus: "failed",
    failureCode: safeErrorCode(error),
    updatedAt: new Date().toISOString(),
  }).where(eq(paymentProviderEvents.id, id));
}
