# Payment reconciliation reviews

The Financials page now includes a finance-only review workspace. It shows current mismatches, disputed payments, missing card sessions, card payments awaiting recovery, and manually opened reviews. Reviewers can claim/release a case, append notes, check the existing provider reconciliation workflow, and resolve a review after the underlying discrepancy is cleared. Resolved cases and their histories remain available through the status filter. Provider observations store specific reason codes, the expected amount, provider amount and currency; no raw provider payload or customer contact details are included.

## Safety and deployment

- Review metadata never changes a payment, receipt, cash collection, refund or customer message. The existing Check provider action retains its existing reconciliation and fulfillment behavior.
- Owner and finance roles are checked at the route itself; operations, support and editor are denied independently of the Worker gate. Responses are private and not cached.
- A client action UUID is retained across failed requests. Version and owner checks prevent conflicting claims and notes. The metadata change and append-only event commit in one D1 batch. Reusing an action ID with another payload is rejected.
- Resolution is blocked while the booking is mismatched, disputed, pending, processing, failed, or missing a required card checkout session. Review resolution does not mean money has been received.
- Migration `0109_payment_reviews.sql` adds review state, immutable history and immutable provider observation tables. Runtime bootstrap creates the same tables, indexes and protections because Workers Builds does not apply D1 migrations. No new secrets or Worker variables are required.

## Verification

`tests/payment-reviews.test.mjs` exercises independent finance permissions, input/origin validation, specific discrepancy reasons, competing claims, identical concurrent retries, payload conflicts, unresolved-payment rejection, immutable history/observations, rollback after a history insert failure, precise minor units and runtime bootstrap.

The existing journey/payment integration suite verifies that reconciliation still preserves refunds/disputes and exact satang values. Browser coverage checks claim, timed-out note retries with the same action UUID, rejected premature resolution, provider check, successful resolution and later history lookup on desktop and phone.

Before merging, run lint/typecheck, the focused tests, the full test/build gates and browser suite. Main deploys automatically. Rollback should retain the additive tables and immutable records and revert only the application code; do not delete review or observation history.
