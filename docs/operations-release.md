# Payment and journey operations release

Live Worker: https://waydidi-website.contact-waydidi.workers.dev

This release adds guarded payment recovery, independent outbound/return dispatch and tracking, `/admin/payments`, split journey driver costs, and flight-change assistance in Operations.

## Release order

1. Build and run the tests on the release commit: `npm test` and `npx tsc --noEmit`.
2. Apply `drizzle/0054_journey_payment_recovery.sql` **once** to the Worker's D1 database before deploying this version. It assumes migrations through `0053_hourly_areas.sql` are already applied. From the repository root, using the generated Cloudflare configuration:

   ```sh
   npx wrangler d1 execute waydidi-website-db --remote --config dist/server/wrangler.json --file drizzle/0054_journey_payment_recovery.sql
   ```

   The migration preserves existing assignments as outbound, revokes duplicate active legacy assignments while keeping the latest, and backfills journey records. Previously closed bookings with a future return become active again for that return. Historical closed returns stay closed. Existing cash collections and recorded refunds are preserved.
3. Deploy the approved commit through the existing Cloudflare Workers Builds workflow. The Worker name, D1 binding, R2 fallback, and five-minute cron remain in place.
4. Set `WAYDIDI_PUBLIC_URL` in the Worker settings to the live URL above so reminder and email links point to the correct site. Retain the existing Stripe secret/publishable keys and webhook signing secret. Flight refreshes require `AVIATIONSTACK_API_KEY`.

## Operations usage

- In Operations and Calendar, choose **Outbound journeys** or **Return journeys**. Driver assignment, secure links, evidence, tracking and pickup dates/times apply to the selected direction. Completion closes the booking after all its journeys are completed or verified as no-shows. Rotating a driver link preserves journey progress.
- Customer tracking links support `leg=outbound` and `leg=return`. Return reminders link to the return journey. Both legs share booking-owner authentication.
- In **Payments**, reconcile Stripe payments, record partial/full cash receipts, and enter costs and payout status for each driver leg. Cash receipts are bounded by the outstanding balance and use an idempotency key. Entering split costs replaces the legacy combined cost for financial reporting; until all legs have costs, the total stays pending. Payout reports use each leg's driver and date.
- Payment recovery runs through the existing five-minute cron, prioritizes oldest checks, and bounds provider work to 15 bookings per run. Confirmed paid bookings are revisited daily for missed financial webhooks. Provider failures do not cause age-based expiry of known payment sessions. Expired bookings can recover when a later payment is verified.
- Flight assistance refreshes active outbound airport arrivals within 48 hours of pickup, with shared cache limits. Operations sees changes of at least 30 minutes, cancellations and diversions. Suggested pickup times preserve the original arrival-to-pickup interval. Staff review and edit the outbound schedule; the application does not silently reschedule customers. Mark alerts reviewed with a note; a later material arrival change reopens them.

## Financial interpretation

Amounts are in THB. Received payments represent verified gross collection, refunds are provider amounts, and driver costs count once. Known profit subtracts refunds, agreed driver costs and the original charge fee. Rows with missing costs, missing fees or disputed funds stay pending. Refund/dispute transaction fees, currency conversion, taxes and bank settlement timing are not a complete settlement ledger; profit is explicitly labelled provisional.

The integration suite uses an isolated Miniflare D1 database and mocked provider requests. It does not send emails, make charges, or modify production data. Production credential validity and provider subscription coverage still need a release smoke check.
