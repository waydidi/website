# Requested implementation and evidence

This tracks the full requested scope. A checked item requires code, appropriate tests and a reviewable release. Production configuration and migrations must be verified separately; a documented plan alone does not prove a production migration complete.

## Features, in requested order

- [x] 1. Operations exception inbox: unified existing alerts, journey exceptions and failed delivery records; severity ordering; accessible filters; complete pagination; acknowledgment/resolution with server permissions and concurrency protection.
- [x] 2. Payment reconciliation workspace: discrepancies and reasons; review ownership; append-only resolution history; explicit finance permissions; safe retries and concurrent updates; existing provider reconciliation retained.
- [x] 3. Customer trip changes: verified ownership; complete server-priced preview and accepted price difference; existing staff approval retained; immutable paginated status history; guarded/idempotent submission and stale booking/quote protection. No new charge, refund or customer-message path is introduced.
- [x] 4. Driver connectivity recovery: durable queued actions; visible last successful server contact; retry/rejection state; exact acknowledgments; cross-tab leases; preserved event IDs; explicit storage-failure warnings and confirmed local discard.
- [x] 5. Booking funnel measurement: transfer, hourly and custom tour journeys have consented quote/details/payment events, server-confirmed completion, deduplication and owner/finance aggregate drop-off reports, with no customer details or access tokens in funnel tables. Tour itinerary contexts remain separate through reload and all active contexts support withdrawal.

## Engineering improvements, after features

- [ ] Durable background notification delivery with retries, idempotency and dead-letter handling; verify provisioning separately.
- [ ] Private R2 production storage with verified migration of existing D1-backed files and rollback support; verify actual bindings and migrated contents.
- [ ] Disaster recovery procedures and a tested database/file restoration path; verify production recovery capabilities separately.
- [x] Windows-compatible development scripts and verified local install, development, build and selected test commands. Linux helpers are retained; a Windows CI job checks Node 22. Full-suite CI and production work remain separate gates.

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

The remaining engineering work is to strengthen the existing durable notification outboxes and prepare verified private-storage migration and recovery tools. Windows command evidence follows below. Cloudflare CLI authentication has not yet been verified: a local login attempt timed out before receiving the OAuth callback. Production resource/configuration checks remain pending; local code and tests do not prove those checks complete. The full goal remains unfinished.

## Engineering: Windows command verification

The Node launcher removes Bash/environment-assignment requirements from Windows npm commands and enumerates test files without shell globs. Actual `npm.cmd run` checks passed on this PC: clean locked install (720 packages), lint (zero errors; 63 existing warnings), typecheck, production build, 20 booking/funnel/driver rules tests, five shared-source checks and seven desktop/phone browser checks through the new dev launcher. A forced short build timeout returned 124, a missing test returned 1, and the install lock was removed after completion. Existing single-source tests now normalize relative Windows paths while keeping the same assertions. See `docs/windows-development.md`. macOS runtime checks have not been performed.

Checkpoint `c914c4d96b91e0937058effe2e4833837be3068c` passed full CI run `40212404073`: 748 unit/integration tests, 235 browser tests (12 skipped), lint/typecheck/build and the Windows development-command job on Node 22. It fixes the repeated booking-status lists found by the earlier `eb17c7f` run. This checkpoint verified the transfer/hourly funnel slice and Windows support; it did not yet contain tour coverage.

## Tour funnel extension, 26 October 2026

The tour acceptance UI now records displayed bookable quotes, opened customer details and valid payment submissions. Telemetry does not delay tour checkout or change frozen prices/provider payloads. Different private itinerary links use separate random journey IDs; only a tab-local digest separates stored contexts, and neither that digest nor the token is sent to analytics. The authenticated booking transition remains the only source of completion events. Multiple tour checkout attempts share one journey's confirmed stage, and finishing one journey does not finish other open quotes.

Additive migration `0112_booking_funnel_tours.sql` and runtime bootstrap add tour event/link tables while leaving existing tables, constraints and records intact. Reports aggregate both stores; deduplication, service guards, withdrawal and retention cover both. Real-D1 checks exercise concurrent/repeated initialization, schema preservation and rollback after injected initialization/withdrawal failures. A missing hashing secret returns a retryable withdrawal failure rather than falsely acknowledging deletion.

The final additive storage design and checkout response integration passed 49 focused funnel/itinerary/hourly/shared-source checks. All 17 desktop/phone browser checks passed, including actual redirect binding, completing the correct booking's journey, leaving another quote active, withdrawal of both contexts and blocked-cookie failure handling. Booking associations in browser analytics state use local hashes and never persist raw references or URLs. The real Stripe request builder was exercised with a mocked provider and asserted the unchanged 250000-satang price. TypeScript, the production build and full lint passed (zero errors, 63 existing warnings). Full CI for the tour extension is tracked separately from the green `c914c4d` baseline. See `docs/booking-funnel-release.md`.

Next: durable notification delivery, verified private R2 migration and restoration/recovery. Inspection found existing D1 delivery records and cron retries, but customer email retries can exceed provider idempotency retention and render a changed payload; do not claim exactly-once delivery or complete engineering based only on the presence of an outbox. The connected Resend account returned no configured domains, which does not establish whether it is the same account as the production Worker's secret. Cloudflare resource checks and provider-account matching still need authenticated evidence. The full goal remains active and unfinished.

The tour checkpoint `9bc1e5a` subsequently passed full CI run `40218427772`: 752 unit/integration tests, 239 browser tests (12 skipped), lint/typecheck/build and the Windows development-command job. These results cover the tour extension as well as the earlier priorities; production flags remain off.

## Notification engineering checkpoint, 26 October 2026

Booking confirmation and channel intents now use one guarded D1 batch before network work. Email provider acknowledgments are verified, errors expose only allowlisted metadata, and immutable-by-use rendered envelopes are stored in chunked private D1 snapshots before the first provider attempt. Retries preserve the full wire body and opaque key, fence stale result writes, persist provider receipts, honor rate holds and stop within 23 hours/12 provider attempts. Older ambiguous attempts and exhausted unknown outcomes require review instead of a new-key resend. Operations lists failed, uncertain, stopped and configuration jobs without recipient details. Retention purges old message bodies while preserving operational hashes/receipts.

`BOOKING_BACKGROUND_DELIVERY=0` keeps existing inline first attempts. The optional `1` mode defers existing email/PDF jobs to the existing five-minute recovery consumer, pending verified production cron/configuration. Additive migration `0113` has matching runtime bootstrap. See `docs/notification-delivery-release.md` for limits, rollout and remaining work. The notification engineering checkbox remains open: Telegram retry bounds, reconciliation of missing legacy jobs, staff review/audit workflow and actual production prerequisites are still unfinished. Private R2 migration and recovery remain pending as separate engineering items.

The Windows checkout passed 56 focused delivery/provider/inbox/security/shared-source/evidence checks, including real D1 rollback, concurrent confirmation, chunked snapshot races, stale leases/receipts, timeout ambiguity, rate holds, legacy review, retention and opt-in background consumption. The actual email retry retained identical bytes/key after sender and booking changes. After the final summary-write race fix, all 31 affected delivery/security/shared-source checks passed again. Full lint has zero errors and 63 existing warnings; final TypeScript and production build checks passed. New checkpoint CI and production verification remain separate gates.

Email checkpoint `4cee5e8` subsequently passed full CI run `40221628852`: 771 unit/integration tests, 239 browser tests (12 skipped), lint/typecheck/build and the Windows development-command job.

The general Telegram job outbox now stops after 12 claims/seven days, preserves attempted payloads and rate holds, verifies message acknowledgments, checks photo hashes, revalidates authorization after private-file reads and fences late linked-record writes. Provider descriptions are replaced with fixed safe errors. General booking failures/review jobs appear in Operations without private destinations or payloads; support settings label stopped retries. Local verification passed 71 Telegram/resend/photo/chat regressions, including nine added queue/provider/lease/media scenarios, and 27 delivery/inbox/shared-source checks. The separate assignment/chat consumers, audited review path and missing legacy-job reconciliation still require work; the notification checkbox stays open. See `docs/notification-delivery-release.md`.

The final 26-case Telegram reliability rerun also passed after strengthening the recovery-sweep test to prove that a corrupt job does not stop the following healthy job. Final TypeScript and production build checks passed. Full lint has zero errors and the same 63 existing warnings. These checks use mocked provider requests and local D1; new branch CI and production verification remain separate.
