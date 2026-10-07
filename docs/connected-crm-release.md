# Connected CRM release

Waydidi's `/admin/crm` connects guest and registered customer records, enquiries, quotes, dated follow-up tasks, agency teams and retention automation. `/admin/users` remains the registered-member directory, with server pagination, full-database search, separate aggregate statistics and full matching CSV exports.

## Deploy

The CRM and reliability changes from PRs #30 and #31 are merged. This follow-up includes the unmerged PR #32 review fixes plus CRM, partner and referral security/reliability fixes; apply only migrations that are still pending. The only live origin is `https://waydidi.com`.

1. Take a D1 backup/export before upgrading. Apply pending migrations in numeric order, including 0092, 0093, 0094 **0095_connected_crm.sql**, **0096_affiliates.sql**, **0096_crm_review_fixes.sql** and **0097_crm_security_reliability.sql**. Both 0096 files are distinct migrations and are required. Use the actual production D1 database binding/name from Cloudflare.
   After building the reviewed commit, the existing release configuration supports:
   ```sh
   npx wrangler d1 execute waydidi-website-db --remote --config dist/server/wrangler.json --file drizzle/0095_connected_crm.sql
   ```
   Apply `drizzle/0096_crm_review_fixes.sql` with the same command after 0095. Run each migration once after all preceding migrations. Then apply `drizzle/0097_crm_security_reliability.sql` using the same command. Its reminder columns and consent triggers are required by this code.
2. Deploy this commit through the existing Cloudflare Worker workflow. Do not serve the new CRM code against an unmigrated database.
3. Sign in as owner. Open `/admin/crm`, `/admin/users` and `/agency` with a verified agency manager email.
4. Confirm the existing operations cron remains enabled: it now runs CRM scheduling, quote reconciliation and queued email recovery. Email requires the existing `RESEND_API_KEY` and verified `BOOKING_FROM_EMAIL`. Telegram reminders use existing `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` when configured; the admin notification bell also shows due tasks.
5. Retention rules start disabled. Create and review a rule, then enable it deliberately. No live emails are sent by the development tests.

## Workflows

- **Customers:** search guest/member records; open a profile with booking/payment/refund status, conversations, enquiries, quotes, task history and staff activity. Add internal notes and assign an owner. Member consent continues to be managed through account settings; guest consent requires an explicit source recorded by staff.
- **Pipeline:** create enquiries; move through new, quoted and awaiting payment; record reasons for lost enquiries. Only confirmed bookings produce “won”. Booking-linked stages follow the booking itself.
- **Tasks:** choose a customer, optional enquiry, due date/time in Thailand and active staff member. Complete or reopen tasks; completion timestamps and history are preserved. Chat follow-ups require a date and create the same tasks. Booking confirmation cancels related open payment/sales follow-ups.
- **Quotes:** save a whole-baht transfer quote, revise it, share a private expiring link. Issuing/revising links invalidates older links. Acceptance opens the existing booking request form with route, schedule, vehicle and agreed price preset. Acceptance does not create a paid/confirmed booking. Staff can link a confirmed booking; cron also reconciles booked forms. One booking cannot be attributed to multiple CRM quotes.
- **Matching:** suggestions use email or normalized phone; only the owner can merge after review. CRM references move, but accounts, sign-ins, driver access and customer booking permissions never change. Consent is cleared on consolidation and must be re-established.
- **Partners:** operations/owner can assign account staff, record agreed-rate notes, add/revoke verified-email portal members and view booking totals. Rates here are notes; executable fare rules stay in Fare management. Agency managers manage their own team; bookers cannot administer access. Existing trip commission workflows remain in Financials.
- **Retention:** no-repeat-booking and upcoming-transfer-without-return triggers can create staff tasks or opted-in emails. Rules deduplicate per originating booking, suppress offers after a newer booking and recheck current consent before sending. Promotional emails include a token-based unsubscribe confirmation, without requiring an account. GET requests never unsubscribe (safe for link scanners).
- **Dashboard:** full CRM record counts, pipeline values, enquiry conversion by recorded source, quote outcomes, repeat-customer record counts, measured average first staff response, due tasks and queued-email delivery states. “Revenue” is confirmed booking value before refunds, not net profit. Imported historical bookings are included. Guest records are imported separately until matched/reviewed; record counts are not a count of unique people.

## Audit fixes and release checks

- Member session activity preserves cleared CRM consent; only an explicit preference change restores it. Email changes clear existing consent.
- Follow-up chat associations must belong to the selected customer. Pipeline stage and event writes commit together.
- Telegram reminders record delivery after acknowledgement, recover abandoned claims after 15 minutes and stop after five attempts. Rescheduling resets delivery attempts. Without configuration they stay pending. At-least-once delivery may duplicate a reminder if the process fails after provider acknowledgement but before the database update.
- All enabled retention rules are scanned in ordered batches; rules beyond the first 30 are no longer permanently skipped.
- Operations can manage agency/storefront/affiliate partners. Only owner/finance can record storefront settlements and affiliate payouts; finance cannot edit commercial partner settings. Financial buttons follow these permissions.
- Affiliate payout CSV uses the shared spreadsheet-formula escaping, including newline-prefixed input.
- Affiliate totals and tier counts query all bookings; recent history remains bounded.
- Referral reward issuance atomically enforces the annual cap and saves the coupon, account association and retryable email job. Legacy `rewarding` rows become `needs_review`; inspect their provider/coupon history before resolving them. These legacy rows are deliberately not blindly reissued.
- Email provider requests abort after ten seconds rather than holding a worker indefinitely.

## Dependency security updates

The audit updates Next.js to 16.4.0, React/React DOM/RSC to 19.2.8, Vite to 8.0.16, the Cloudflare Vite plugin to 1.63.0 and Wrangler to 4.148.0. Compatible transitive fixes are locked; targeted overrides select patched image-size, sharp, esbuild and undici versions. Tests explicitly pin the supported Miniflare 4 API; the Cloudflare deployment tooling retains its own current simulator.

`braces` has no published upstream fix for GHSA-vfj7-8cjw-p6xm. The MIT-licensed local fork in `vendor/braces` adds iterative depth and size validation before recursive walkers, including caller-supplied ASTs. npm overrides install it for all consumers. Keep the security regression tests and replace the fork when a verified upstream fix is available. This local fix is explicitly tracked rather than represented as a published upstream patch.

## Email recovery

The shared D1 outbox stores stable structured email requests. Conditional claims prevent concurrent sends. Up to five attempts use exponential delay; abandoned processing leases recover after 15 minutes. Configuration absence does not consume attempts. Stable provider keys/payloads are reused. Resend retains idempotency keys for 24 hours; jobs ambiguous after 23 hours move to `needs_review` instead of risking another send. Older legacy failed/processing reward records also need review when delivery cannot be determined safely. Failed jobs and review totals appear on the CRM dashboard and Emails queue; the owner can cancel a job or record provider-verified delivery with an audit reason. Review never blindly resends an ambiguous job; there is no automatic unbounded resend.

## Account deletion and retention

Owner-only deletion runs one database batch.

| Records | Action |
|---|---|
| Customer profile, login identities/codes/sessions, saved places/passengers/billing profiles | Delete |
| Personal referral code | Delete; it can no longer earn discounts or rewards |
| Referral uses | Replace deleted referrer ID with a deletion identifier, clear personal contact fields and void pending rewards; retain transaction/reward history |
| Referral reward email jobs | Cancel unsent jobs and erase recipient/payload, including jobs without a CRM contact mapping |
| Member spins, gifts, boxes, reward-email ledger, coupons | Delete; unlink partner voucher references first |
| Customer booking links | Delete; operational booking records remain |
| Booking member discount ledger | Replace member ID with a fresh deletion identifier; retain receipt amounts/tier |
| Website conversations and support reviews | Remove account ID; retain service/dispute conversation and review records |
| Agency team membership | Disable email-based membership; retain business account/application records |
| CRM marketing tokens and queued email payloads | Delete tokens; erase email payload/recipient and cancel unsent jobs |
| CRM member association, notes and consent | Remove member ID, notes and consent; anonymize contact details when no booking/chat source needs operational retention |
| Bookings, payments, refunds, invoice evidence, booking events, service chats and business partner records | Retain for service, accounting and dispute purposes; account deletion is not deletion of the business transaction |

For a broader personal-data erasure request, operations must review retained transaction/service records separately. No universal retention duration is assumed by this release.

## Scope and limitations

CRM merges are operational consolidation, not login-account merges. Duplicate guest records require human review. Quote acceptance uses the existing transfer request/booking workflow; it does not implement a new payment gateway. PaySolutions remains disabled until its real provider integration is completed. Partner agreed rates are recorded notes rather than dynamic pricing. CRM conversion reporting uses recorded enquiry/booking sources, not advertising attribution. The release does not send bulk campaigns to unconsented guests.

## Review regression checks

`node --test tests/crm.test.mjs` covers concurrent member merges, verified-link consolidation, booking detail synchronization, rebooking cancellation, isolated quote conversion failures and literal CSV search/filter matching. CSV streams use 100-row keyset pages, respect consumer demand and cancellation, and do not recalculate dashboard totals. Exported data reflects live records during consumption rather than a database snapshot.

GitHub CI runs these CRM component workflows alongside the desktop/mobile browser and accessibility suites. Playwright and its test runner are pinned to the same version. The local browser server binds to `127.0.0.1`.

For the Chromium component workflows, run `npx playwright install chromium --with-deps`, then `npm run test:crm:browser`. These tests mount the actual CRM workspace with mocked API responses, including delayed and failed enquiry loads. They verify quote revision, task rescheduling, customer switching and prevention of accidental enquiry unlinking. They do not contact production or send emails. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing compatible Chromium binary.

Migration 0096 preserves imported contacts with notes or CRM history for human review, while hiding empty imported shells after verified association. Member compatibility is checked at write time. Scheduler failures are logged individually, and email recovery runs independently of quote and retention scheduling.
