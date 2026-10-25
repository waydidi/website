# Booking notification delivery

This changes existing booking confirmation email/PDF delivery. It does not introduce a marketing message, charge, refund or automatic resend of an uncertain result. This is an implementation checkpoint; the broader Telegram outbox, storage migration and recovery work remains in progress.

## Behaviour

The guarded booking confirmation and its channel jobs are one D1 batch, before external calls. A failed job insert rolls back that confirmation transition. Existing jobs retain their IDs. Null payment-intent input preserves the stored intent instead of replacing it with an older caller snapshot.

By default `BOOKING_BACKGROUND_DELIVERY=0` preserves inline first attempts. With `1`, only existing confirmation email/PDF jobs are deferred to `runDeliveryRecovery`, reached by the existing five-minute operations cron. Other existing trip/Telegram work still runs through its existing paths. Verify the deployed cron before enabling this flag; an unconfigured cron would leave these jobs queued.

Migration `0113_booking_delivery_payloads.sql` and first-use bootstrap add private message snapshots and blob parts. The envelope freezes the sender, recipients, subject, HTML/text, attachment and ride URL before the first possible provider request. It receives an opaque SHA-256 job key; retries use the same stored envelope. Large envelopes span 900-KiB D1 parts. Competing renderers cannot replace a winning snapshot. Reads verify contiguous parts, byte count and SHA-256 before sending. Message contents and tokens never enter application logs or the operations inbox.

A send records its start before network activity, with a 20-second HTTP timeout. HTTP 200/201 requires a usable provider message ID. `sent` means provider acknowledgment, not inbox delivery. Retryable failures use bounded exponential backoff and honor `Retry-After`. The first provider attempt starts a conservative 23-hour retry window, with at most 12 provider attempts; jobs older than seven days stop. The provider's documented idempotency retention is 24 hours: https://resend.com/changelog/idempotency-keys . This does not guarantee exactly-once email delivery.

Definite permanent rejection becomes `dead_letter`. Unknown outcomes remain sticky across later failed attempts and become `uncertain` when retry safety expires or the provider rejects the key. An interrupted attempt records an unknown outcome. Legacy attempted jobs without a recoverable original body also become `uncertain`; missing current credentials cannot erase that ambiguity. No automatic new-key resend is made. Owner/operations can see these jobs in the existing inbox without recipient details. Manual provider investigation and any deliberate new message remain separate from retrying the old job.

Claim timestamps fence final job and receipt writes. A worker whose lease was replaced cannot overwrite the current result. Expired rendering leases cannot start a provider request. Stored bodies are removed after seven days for sent jobs and 30 days for terminal review jobs; operational hashes/receipts remain. Recovery performs bounded cleanup even when the background flag is off.

## Rollout and outstanding checks

Keep the background flag off until authenticated checks establish the correct Worker/account, D1 binding, deployed five-minute cron, private R2 binding and matching Resend account with a verified sender. This PC's pinned Wrangler CLI currently reports unauthenticated, despite the reported browser sign-in. A connected Resend account returned no domains; it has not been matched to the Worker's secret and is not evidence about production email configuration.

Apply or verify the additive migration in the intended database; the runtime bootstrap is also idempotent. Inspect old attempted jobs before rollout: they may move into review instead of receiving a changed message. Watch Operations for `uncertain`, `dead_letter` and configuration failures. Preserve snapshots during rollback, keep the background flag at `0`, and do not revert to an older consumer that rebuilds previously attempted emails under changed keys/bodies. Disabling this flag alone preserves the new retry protections and returns new first attempts inline.

Tests use local Miniflare/D1, real message rendering and mocked provider HTTP only. No live email is sent. Production provisioning and actual cron invocation are separate, still-pending evidence. Telegram retry bounds, missing legacy job reconciliation and a staff review/audit workflow still need completion before the notification engineering item is checked off.
