# Telegram reliability release

## Changes

- One dispatch service for Admin and Telegram: optimistic transaction guard, active booking/leg/version/driver checks, schedule overlap and unavailability checks; token replacement, assignments, notification jobs and audit events commit atomically.
- Chat message mappings include chat ID; disabled/removed staff stop receiving private customer messages. Revocation clears assignments and private reply mappings.
- Durable Telegram outbox for cards, offers, driver jobs, request cards, photos, completion albums, prompts and handovers. Definitive failures retry; transport ambiguity and interrupted sends require review.
- Cancellation requests are persisted before notification and retain receipt time/policy version. Later requests after Keep use a new ID. Cancellation revokes links atomically and updates driver offers.
- Prompt answers validate user, expiry and booking version. Prompt consumption and booking/driver changes are one transaction; retries recover the next prompt without applying the answer twice.
- Return offers have independent identities and separately entered costs. Reschedules rotate and notify both affected assignments. Conflicting reschedules require dispatch review rather than a hidden override.
- Admin address edits invalidate corresponding saved navigation links atomically. Expired bin entries are archived, preserving immutable financial/policy records and evidence references.
- Assistant usage is atomically charged per provider call, including partial turns; concurrent calls reserve budget before requests. Unknown outcomes retain reservations. Long answers are split without losing text.

## Configuration

Existing bot token/chat/webhook configuration is reused. No secrets are committed.

New flows are off until the owner explicitly enables them:

- `TELEGRAM_DRIVER_UPDATES=1`: private cancellation/change/Admin-assignment updates to linked drivers. Existing job DMs for driver-group dispatch retain their behavior.
- `TELEGRAM_RETURN_DRIVER_JOBS=1`: independent return job offers. A return cost must be entered; outbound cost is not reused.

The owner should keep the Telegram allowlist limited to trusted owner-equivalent users, as already documented in README. The assistant retains this intentional access model.

## Data migration

`drizzle/0105_telegram_reliability.sql` is additive and idempotent. Runtime bootstrap uses the same definitions. It does not delete historical financial or policy records. Existing unfinished zero-ID cards/offers become uncertain; check the actual chat before choosing Confirm missing and retry.

## Review and validation

Use the isolated D1 tests first. For a production test, use an explicitly labelled test booking and verify:

1. Booking card, driver cost, group offer, Take job, private job/link; two simultaneous takes still yield one driver.
2. A driver cannot take another overlapping job. An expired signup reopens without overwriting a staff assignment.
3. Separate return price/offer/driver/link when enabled; one leg's assignment and completion do not assign or finish the other.
4. Visitor and Non messages mirror to Telegram; staff replies reach only their assigned customer. Disable/remove a staff member and verify no new private customer message reaches them.
5. Standby/Pickup/Drop photos and completion albums go to configured groups. Retry a definite rejection once; do not automatically resend uncertain sends.
6. Cancellation request remains recorded with Telegram disconnected. Keep followed by a new request creates a distinct review card. Cancellation revokes driver links and optional driver notices arrive when enabled.
7. An address change clears old navigation; both affected assigned legs receive updated links. Conflicts are surfaced for operations review.
8. Archived bin entries preserve policy and financial records; unrelated restore actions work.

## Recovery

Admin → Website chat → Telegram lists outbox records and pending cancellation requests. Only the owner can retry reviewed missing deliveries. Confirm a message is absent in its actual Telegram destination first. Retry sends remain protected by current booking/assignment/recipient checks.

Assignment and chat delivery queues separately expose uncertain counts. Do not bulk-reset them to queued. Inspect provider outcome before manual recovery. Assistant unknown-call reservations remain reserved for safety; compare provider usage before releasing any reserved budget through a controlled database reconciliation.

## Rollback

Disable the two new feature flags before reverting application code. Keep additive tables and historical outbox/financial records. Do not drop migration tables or delete notification records to simulate a retry.
