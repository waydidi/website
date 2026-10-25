# Requested implementation and evidence

This tracks the full requested scope. A checked item requires code, appropriate tests and a reviewable release. Production configuration and migrations must be verified separately; a documented plan alone does not prove a production migration complete.

## Features, in requested order

- [x] 1. Operations exception inbox: unified existing alerts, journey exceptions and failed delivery records; severity ordering; accessible filters; complete pagination; acknowledgment/resolution with server permissions and concurrency protection.
- [x] 2. Payment reconciliation workspace: discrepancies and reasons; review ownership; append-only resolution history; explicit finance permissions; safe retries and concurrent updates; existing provider reconciliation retained.
- [ ] 3. Customer trip changes: verified ownership; quote and price difference; approval status and history; stale booking protection; money/customer messaging changes disabled until explicitly enabled.
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

Priorities 1 and 2 are implemented on `codex/security-and-operations-inbox`, pending the updated PR/CI gates and merge. Verification used the actual Windows checkout, local emulated D1 and Chromium:

- TypeScript and focused ESLint passed.
- 41 focused operations/payment/journey integration tests passed, including denied roles, concurrent retries, immutable financial history/observations, transaction rollback, exact minor units, stale actions and history pagination.
- Nine operations browser checks passed (setup plus four flows on desktop/phone).
- Three payment review browser checks passed (setup plus the complete workflow on desktop/phone).
- The direct vinext production build passed; repository npm scripts still need the planned Windows portability work.

Next: priority 3, customer trip changes. Existing request submission and Telegram approval are present. Remaining work includes a trustworthy pre-submission price-difference preview, visible status/history, guarded submission/retries, and a reviewable staff workflow without enabling new financial or messaging side effects by default. Priorities 4/5 and all engineering items remain in scope.
