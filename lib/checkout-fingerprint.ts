/**
 * Fields that define a checkout retry. A retry with the same checkoutAttemptId
 * must hash like the original, including attempts started on an earlier build:
 * newer optional fields are omitted while they hold their implicit default
 * (no stops, Standard cancellation), so pre-deploy payloads keep their hash.
 */
export function checkoutFingerprintInput<T extends { funnelId?: unknown; routeStopIds?: unknown[]; cancellationOption?: string }>(input: T): Partial<T> {
  const fingerprint: Partial<T> = { ...input };
  delete fingerprint.funnelId;
  if (!input.routeStopIds?.length) delete fingerprint.routeStopIds;
  if (input.cancellationOption === undefined || input.cancellationOption === "standard") delete fingerprint.cancellationOption;
  return fingerprint;
}
