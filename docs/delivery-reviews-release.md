# Owner delivery reviews

Owners can inspect booking email/PDF, general Telegram, driver-assignment and website-chat jobs at `/admin/delivery-reviews`. Other staff roles cannot read or write this workspace/API. The existing Telegram settings list links the owner to the selected job. Support/operations keep their existing diagnostic views.

## Decisions and limits

`NOTIFICATION_DELIVERY_RETRY=0` leaves reviewed retries disabled. Set `1` only after verifying the intended Worker/account, existing cron consumers, D1, provider accounts/senders and private storage. This flag does not enable a new message category. Existing `BOOKING_BACKGROUND_DELIVERY=0` still controls only deferred first email/PDF attempts.

Owners can queue the original message, record an observed provider receipt, or close a delivery after confirming it did not succeed. Retrying and closing require an explicit provider/storage absence attestation and a structured reason. Receipt confirmation requires the observed provider message ID. Chat receipts also require the observed destination/type and, when no group card is known, an explicit choice to establish that observed group message as the card. Known acknowledgments cannot be replaced with a different receipt or treated as absent. A receipt already routed to another conversation cannot be reassigned.

Reviews never contact a provider. An accepted retry makes the existing job due for its existing consumer; that consumer still validates booking status, driver links, booking versions, assignee permissions, payload integrity and its remaining budget. Attempts, first-send timestamps, frozen content and email provider keys are preserved. Provider holds cannot be bypassed, and expired/exhausted messages cannot receive a new budget. Missing/corrupt originals remain held; a review does not rebuild an attempted message or create a new provider key. A deliberate new-message business operation remains separate from reviewing the original job.

The workspace shows current status, destination, timing, counters and review history without returning rendered message bodies or access tokens. Unknown legacy provider errors are replaced with fixed diagnostic text. History contains actor ID, structured reason, previous status/counters/timing, observed receipt/routing evidence and the request/version identifiers. There are no free-form customer notes in this immutable log.

## Atomicity and history

Additive migration `0115_notification_delivery_reviews.sql` and first-use bootstrap create the audit table, index and update/delete rejection triggers. Existing queue rows keep their IDs. Worker builds still need the normal base schema; first-use bootstrap supplies the new review dependencies.

Each proposal includes a random request UUID and the version returned by the server. The version covers current source state and its latest review sequence. A stable canonical payload hash binds the UUID to the actor and decision. Replaying an accepted proposal returns its stored result without changing the queue again; reusing its UUID for another proposal conflicts. Two owners proposing against one version have one winner, even if queue fields later return to their earlier values.

The guarded source update is immediately followed by an audit insert that checks SQLite `changes()=1`; a stale proposal or failed insert aborts the D1 batch. Metadata, booking summaries and receipt-based card/route repairs follow in that same batch. This uses D1's transactional batch semantics and SQLite's previous-statement change count: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch and https://www.sqlite.org/lang_corefunc.html#changes . Local Miniflare tests exercise rollback and races; production migration/configuration is a separate gate.

Observed receipts reuse the normal delivery acknowledgment helpers to repair booking cards, prompts and chat routes. A confirmed or absent chat decision releases its held first-card claim as appropriate. A closure does not claim successful delivery. Actual booking/payment status and money records are unchanged. Audit triggers prevent rewriting or deleting accepted decisions; private payload cleanup remains governed by the existing snapshot retention/cascade rules.

The old Telegram `review_delivery` action now uses this same owner/version/UUID/reason/flag guard. Unversioned legacy requests are rejected. It queues work rather than sending inline. There is no unguarded retry fallback on that route.

## Operator flow

Select a delivery and check the provider/storage using its destination, booking/chat reference and recorded acknowledgment. Choose the matching decision and reason, then provide the required evidence/attestation. An unknown response retains the exact proposal and UUID for retry. A successful HTTP response alone is insufficient: the client checks HTTP 200, `ok`, the matching request UUID and the replay-result type before clearing the proposal. A stale-version response requires a refresh and a new review; refreshing clears the earlier absence/root attestations. Failed data refreshes stop showing a loading state and do not expose a stale decision form. Confirmation decisions record owner-observed provider evidence, not an independent provider verification or proof that a person read the message.

Keep the audit table and snapshots during rollback. Switching off the retry flag stops new retry decisions; accepted queued intents continue through existing consumers and original limits. Replaying an already accepted request remains safe even with the flag off. Do not restore the old unversioned retry handler or reset counters to work around a held job.

Local verification and branch CI are recorded in `docs/implementation-roadmap.md`. No live email/Telegram message is sent by the test suite. Production Cloudflare authentication/configuration, missing legacy-job reconciliation, private R2 migration and disaster recovery remain separate unfinished work.
