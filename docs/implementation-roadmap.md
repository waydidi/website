# Requested implementation and evidence

This tracks the full requested scope. A checked item requires code, appropriate tests and a reviewable release. Production configuration and migrations must be verified separately; a documented plan alone does not prove a production migration complete.

## Features, in requested order

- [x] 1. Operations exception inbox: unified existing alerts, journey exceptions and failed delivery records; severity ordering; accessible filters; complete pagination; acknowledgment/resolution with server permissions and concurrency protection.
- [x] 2. Payment reconciliation workspace: discrepancies and reasons; review ownership; append-only resolution history; explicit finance permissions; safe retries and concurrent updates; existing provider reconciliation retained.
- [x] 3. Customer trip changes: verified ownership; complete server-priced preview and accepted price difference; existing staff approval retained; immutable paginated status history; guarded/idempotent submission and stale booking/quote protection. No new charge, refund or customer-message path is introduced.
- [ ] 4. Driver connectivity recovery: durable queued actions; last successful sync; clear retry/rejection state; no lost steps or duplicate side effects when reconnecting.
- [ ] 5. Booking funnel measurement: privacy-preserving quote/details/payment/completion events; deduplication; staff reporting of drop-off; no customer details or access tokens in telemetry.

## Engineering improvements, after features

- [ ] Durable background notification delivery with retries, idempotency and dead-letter handling; verify provisioning separately.
- [ ] Private R2 production storage with verified migration of existing D1-backed files and rollback support; verify actual bindings and migrated contents.
- [ ] Disaster recovery procedures and a tested database/file restoration path; verify production recovery capabilities separately.
- [ ] Windows-compatible development scripts and working local development/build/test commands.

## Baseline

PR #242 contains the initial read-only operations inbox and safe error-code logging. Its final baseline commit is `522f57e9d2bd778d6605f1fccc708428b5d55530`: CI passed build, lint, typecheck, 713 unit/integration tests and 201 browser tests (12 skipped). This is baseline evidence, not evidence that the full roadmap is complete.

The Windows checkout is `C:\Users\lenovo\projects\waydidi-website`. Main automatically deploys; implementation proceeds on a feature branch. No production changes are implied by preparing a branch or PR.

## Local verification, 25 October 2026

Priorities 1 and 2 are implemented in draft PR #243 on `codex/travel-platform-priorities`. Full CI passed on `8b9641a43aab2b3f611153822e9dafcc39ec1874`: build, lint/typecheck, 726 unit/integration tests and 207 browser tests (12 skipped). Verification also used the actual Windows checkout, local emulated D1 and Chromium:

- TypeScript and focused ESLint passed.
- 41 focused operations/payment/journey integration tests passed, including denied roles, concurrent retries, immutable financial history/observations, transaction rollback, exact minor units, stale actions and history pagination.
- Nine operations browser checks passed (setup plus four flows on desktop/phone).
- Three payment review browser checks passed (setup plus the complete workflow on desktop/phone).
- The direct vinext production build passed; repository npm scripts still need the planned Windows portability work.

Priority 3 is implemented locally, with 18 focused regression/customer-workflow/translation checks passing and three browser checks passing (setup plus desktop/phone). Its server preview preserves add-ons/discounts; accepted totals and request IDs survive retries; history is scoped to the verified management session and records the existing Telegram decisions. See `docs/customer-trip-changes-release.md`. The latest priority 3 changes still need to be checkpointed to PR #243 and pass full CI.

Next: priority 4, driver connectivity recovery. Inspection found that rejected steps are currently deleted from the queue, local storage reads hide failures, and successful synchronization is not recorded visibly. Extend the existing one-step-per-assignment IndexedDB queue: preserve rejected/unverified steps, protect against overwrite/stale acknowledgment, record attempts and last successful sync, and add clear retry/review/discard controls with tests. Then implement priority 5 and every engineering item above. The goal remains active.
