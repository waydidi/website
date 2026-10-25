# Requested implementation and evidence

This tracks the full requested scope. A checked item requires code, appropriate tests and a reviewable release. Production configuration and migrations must be verified separately; a documented plan alone does not prove a production migration complete.

## Features, in requested order

- [x] 1. Operations exception inbox: unified existing alerts, journey exceptions and failed delivery records; severity ordering; accessible filters; complete pagination; acknowledgment/resolution with server permissions and concurrency protection.
- [x] 2. Payment reconciliation workspace: discrepancies and reasons; review ownership; append-only resolution history; explicit finance permissions; safe retries and concurrent updates; existing provider reconciliation retained.
- [x] 3. Customer trip changes: verified ownership; complete server-priced preview and accepted price difference; existing staff approval retained; immutable paginated status history; guarded/idempotent submission and stale booking/quote protection. No new charge, refund or customer-message path is introduced.
- [x] 4. Driver connectivity recovery: durable queued actions; visible last successful server contact; retry/rejection state; exact acknowledgments; cross-tab leases; preserved event IDs; explicit storage-failure warnings and confirmed local discard.
- [x] 5. Booking funnel measurement for transfer/hourly checkout: consented quote/details/payment events; server-confirmed completion; deduplication; owner/finance aggregate drop-off reports; no customer details or access tokens in funnel tables. Custom tour itineraries are explicitly excluded from these cohorts.

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

Priority 3 is checkpointed at `b77426afab7a2bdcf295178ae00945f7a3b565bd` in PR #243. Full CI run `40196891351` passed both jobs (lint/typecheck/build/unit tests and browser tests). Local evidence includes 18 focused regression/customer-workflow/translation checks and three browser checks (setup plus desktop/phone). Its server preview preserves add-ons/discounts; accepted totals and request IDs survive retries; history is scoped to the verified management session and records the existing Telegram decisions. See `docs/customer-trip-changes-release.md`.

Priority 4 passed 43 browser checks across desktop and phone, 29 focused rules/server-idempotency/staff-security checks, TypeScript, focused ESLint and the production build on Windows. Full CI run `40200107010` passed on checkpoint `6ae33a4d4d1205f6359d679b7d607d37f375d4cf`. It preserves rejected/unverified steps, protects against overwrite and stale acknowledgments, records attempts and last successful server contact, and adds retry/review/discard controls. Storage-disabled fallback is explicitly unsaved until acknowledged or durably stored. See `docs/driver-connectivity-release.md`.

Priority 5 passed 29 funnel/real-checkout integration checks and 20 booking/security regressions. Seven browser checks passed (setup plus three workflows on desktop/phone), covering consent/configuration denial, unchanged retry IDs, reload, withdrawal and staff service/date filtering. TypeScript, focused ESLint and the production build passed during implementation; final checkpoint checks and full CI are tracked separately. Funnel IDs do not participate in financial checkout hashes. New collection defaults off, uses HMAC-only booking links, and never lets public events assert confirmation. Existing Google Analytics no longer sends explicit raw URLs/queries/titles, honors consent/DNT/GPC, and requires separate operational verification before its remote tag loads. See `docs/booking-funnel-release.md`.

Next: engineering improvements above. Inspect and strengthen the existing durable notification outboxes, prepare verified private-storage migration and recovery tools, and make npm commands work on Windows. Cloudflare CLI authentication has not yet been verified: a local login attempt timed out before receiving the OAuth callback. Production resource/configuration checks remain pending; local code and tests do not prove those checks complete. The full goal remains unfinished.
