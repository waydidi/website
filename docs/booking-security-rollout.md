# Booking and staff security rollout

This branch requires D1 migrations 0059–0061 **before** publishing the new Worker. Build and test on a review branch first. Production remains the Cloudflare Worker connected to GitHub main; this is not a ChatGPT Sites deployment.

## Staff access

- Existing seven-day signed cookies are rejected. Sessions are now hashed database tokens, expire after eight hours and after 30 minutes idle, and can be revoked individually or by staff account.
- Provision the first, individually named owner through the database administrator before publishing: `node scripts/provision-staff-owner.mjs <staff-id> <email> > /tmp/waydidi-owner.sql`. The script prompts for a hidden password, generates a random salted PBKDF2-SHA256 hash (100,000 iterations), and outputs SQL that refuses to create a second initial account. Apply this temporary SQL to the intended D1 database, then delete it. Enroll the owner’s authenticator at `/admin` after publishing. A password alone never produces a staff session. The old shared credential and bare `key` path are not accepted, including for bootstrap.
- Keep `WAYDIDI_ADMIN_SESSION_SECRET` stable, private, and at least 32 characters. It encrypts MFA secrets with AES-GCM; rotating it requires controlled MFA reenrollment. Remove the obsolete `WAYDIDI_ADMIN_KEY_HASH` and `WAYDIDI_ADMIN_USERNAME` settings.
- The owner creates individual staff accounts at `/admin/staff`, choosing operations, finance, editor, or support permissions. Each employee enrolls their own authenticator on first login. Give initial passwords through a private channel; never post them in an issue or PR.
- Authorization fails closed for unknown admin routes, including encoded paths. Finance controls payments/refunds; support can reply to website chat and read bookings; editors manage blog content; operations manage booking and driver workflows. Only the owner manages staff and configuration.
- If an authenticator is lost, an authorized database administrator must verify the staff member, revoke every session/challenge for that account, reset its MFA secret and replay counter, then require enrollment. No password-only bypass exists.

## Customer and driver access

- Reference and surname no longer grant management. Customers verify their booking email through the existing account sign-in before management access is issued. Migration 0059 clears pre-verification management sessions.
- Owner trip keys last 24 hours and are revocable from booking management. Permanent owner HMAC keys are rejected. Confirmation/PDF bearer links also stop after 24 hours or owner revocation; customers retain access through their verified account.
- Owner/shared tracking links and driver trip links exchange their credentials for Secure, HttpOnly, SameSite=Strict cookies. Browser URLs are cleaned after exchange. Every request continues checking expiry/revocation. Driver cookies last at most 12 hours and never outlive an assignment. Incoming links necessarily still contain a credential until their first exchange; existing integrations remain compatible.
- Driver trip responses do not contain bank details. Bank updates require authenticated finance/owner staff access. Existing staff reports provide financial access; trip-link users must contact finance for bank changes.
- Driver location reporting now starts on the approach to pickup. Ride-deviation and abnormal-stop analysis starts after pickup. Customer maps use positions no more than 90 seconds old, with timestamp/staleness indicators and pickup ETA.

## Quotes, money, and delivery

- Transfer and sample quotes last 30 minutes. Both legs are checked for expiry, itinerary consistency and current transfer pricing before creating/resuming payment or opening embedded checkout. Stripe payment sessions last 30 minutes. Hourly quotes retain their existing 30-minute locked-price policy and vehicle availability checks.
- New payment ledger amounts use integer satang (`amount_expected_minor`, `amount_paid_minor`). The migration converts historic baht amounts. Legacy baht mirrors remain for existing screens; provider requests, reconciliation, refund entitlement and dashboards use satang.
- New checkout bookings save immutable accepted cancellation policy JSON/version/time in a separate table. Existing bookings with no accepted-policy snapshot require review of original terms before a customer-cancellation refund; their historic policy is not invented. Staff may issue an explicitly recorded goodwill refund after review.
- Refund reservations are capped at entitlement minus completed/external refunds, and a pending refund blocks a replacement. Unknown network results remain processing/reserved. Recovery retries with the same provider key during the first 23 hours. After that, recovery checks provider refund history using the original metadata; unmatched results require staff review; do not clear the reservation or create a replacement key without evidence. Stripe may prune idempotency keys after 24 hours: https://docs.stripe.com/api/idempotent_requests
- Booking confirmation, customer email, office email, copy emails and stored PDF each have independent durable delivery records and retry leases. A delivery failure does not unconfirm a paid booking. The five-minute cron retries failed delivery jobs with backoff without resending already successful channels.
- `RESEND_API_KEY` and `BOOKING_FROM_EMAIL` are required for email; `BOOKING_ALERT_EMAIL` for the office copy; a provisioned R2 bucket bound as `BUCKET` for stored PDFs. Missing configuration remains explicitly pending; PDF attachments can still be generated for email without R2. Historic untracked office/copy delivery is marked `legacy_unknown`, not falsely marked sent.
- Website chat is a first-party visitor conversation plus `/admin/chat` staff inbox, not an external messaging service or an AI chatbot. Replies appear while staff use the inbox. Visitor access expires after seven days; cron deletes expired conversations and messages. Urgent-contact alternatives remain visible.

## Payso gate

Payso remains disabled and is no longer advertised as operational. Its current adapter contains no implementation. Enabling it requires the merchant's documented creation and inquiry APIs, authenticated postback/verification contract, refund and refund-status APIs, sandbox credentials, and passing provider-contract tests for creation, amount/currency/reference mismatches, duplicate events, delayed callbacks, reconciliation, refunds, lost responses and retries. Do not guess signature or refund behavior from a marketing badge.

## Validation

The test suite uses a real SQLite/D1 runtime and mocked external providers. It covers MFA challenge races, TOTP replay, session revocation/idle expiry, concurrent email-code guesses, verified booking ownership, owner link expiry and cookie revocation, conversation isolation, independent delivery recovery, satang creation/reconciliation/refunds, refund reservation races, unknown submissions and stable retry keys. Provider mocks do not establish live merchant readiness.

Unknown Stripe submissions are reconciled against provider refund history using the original refund key, booking reference, currency, and satang amount. Recovery continues after the automatic POST retry window ends; an unmatched result stays reserved for manual review.
