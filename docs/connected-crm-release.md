# Connected CRM release

Waydidi's `/admin/crm` connects guest and registered customer records, enquiries, quotes, dated follow-up tasks, agency teams and retention automation. `/admin/users` remains the registered-member directory, with server pagination, full-database search, separate aggregate statistics and full matching CSV exports.

## Deploy

This branch includes the reliability changes from PR #30. Merge that PR first, or merge this complete branch once; do not apply migrations from overlapping branches twice. The only live origin is `https://waydidi.com`.

1. Take a D1 backup/export before upgrading. Apply pending migrations in numeric order, including 0092, 0093, 0094 and **0095_connected_crm.sql**. Use the actual production D1 database binding/name from Cloudflare.
   After building the reviewed commit, the existing release configuration supports:
   ```sh
   npx wrangler d1 execute waydidi-website-db --remote --config dist/server/wrangler.json --file drizzle/0095_connected_crm.sql
   ```
   Run this migration once after all preceding migrations. Its triggers and indexes are required for safe quote conversion and identity associations.
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

## Email recovery

The shared D1 outbox stores stable structured email requests. Conditional claims prevent concurrent sends. Up to five attempts use exponential delay; abandoned processing leases recover after 15 minutes. Configuration absence does not consume attempts. Stable provider keys/payloads are reused. Resend retains idempotency keys for 24 hours; jobs ambiguous after 23 hours move to `needs_review` instead of risking another send. Older legacy failed/processing reward records also need review when delivery cannot be determined safely. Failed jobs and review totals appear on the CRM dashboard and Emails queue; the owner can cancel a job or record provider-verified delivery with an audit reason. Review never blindly resends an ambiguous job; there is no automatic unbounded resend.

## Account deletion and retention

Owner-only deletion runs one database batch.

| Records | Action |
|---|---|
| Customer profile, login identities/codes/sessions, saved places/passengers/billing profiles | Delete |
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
