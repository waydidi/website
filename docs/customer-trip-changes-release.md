# Customer journey changes

The customer management page now obtains its complete revised price from the same server calculation used for submission. Add-ons and discounts are retained. Submission stays disabled until that preview is verified; the accepted amount in integer satang is sent back and rejected if it has changed. Changing the route, vehicle or booking version invalidates the previous preview immediately.

The browser retains a request UUID across failed responses. The server returns an existing matching request even after it has been approved or declined, and rejects reuse with different details. A guarded D1 insert checks the confirmed booking/version/total, existing pending requests, started driver journeys and quote expiry. The request and its operations alert commit together. Retries do not create duplicate requests, alerts or staff notifications.

## Approval and history

The existing Telegram staff review/approval workflow is retained. This release adds no new charge, refund, automatic approval or customer-messaging path. Existing approval still uses the guarded transactional route/ledger update and manual handling of any price difference. Approval does not itself confirm collection of additional money or a refund.

Customer history is available only through a valid management session; the endpoint derives the booking from that session and refuses a caller-supplied reference. It records submitted, approved, declined and expired outcomes, with original/revised/difference snapshots in integer satang. History is append-only and fully paginated. Requests handled through the existing Telegram workflow generate the same history, in the same transaction as their status changes.

Migration `0110_booking_change_history.sql` and its runtime bootstrap add the table, status triggers and append-only protections. Bootstrap backfills a submitted snapshot and any current terminal outcome for legacy requests once. It does not invent intermediate history that was never recorded. No new secrets or feature flags are needed because no new financial or messaging operation is introduced.

## Language and verification

New customer wording lives in `messages/en.json` with Thai and Chinese entries marked `machine`. The existing `payment.*` review gate keeps English visible until those translations are reviewed. Customer details and notes are not sent for translation.

Focused integration tests cover exact preview totals, ownership, conflicting/retried requests, stale versions/quotes, rollback, immutable/legacy/paginated history, and atomic approval including failure/retry. Browser tests cover server-priced totals, blocked unverified submission, retained request IDs and visible history on desktop and phone. Run the full build, lint, typecheck and CI suites before merging. Roll back application code while retaining the additive history and its immutable records.
