# Consented booking funnel

The transfer and hourly booking form records observed quote, details and payment stages. Completion is recorded separately only after the existing server booking state and payment conditions qualify. The report in Financials shows quote-date cohorts in Bangkok time, sequential reached counts, drop-off and missing intermediate observations. It covers supported, consented journeys; it does not estimate all visitors or include custom tour itineraries.

## Configuration and privacy

`BOOKING_FUNNEL_ENABLED=0` is the default. Enable with `1` only when the private `RATE_LIMIT_SALT` is at least 32 characters. No third-party analytics service or new dependency is needed. Existing necessary-cookie behavior and checkout remain available without analytics consent. Do Not Track and Global Privacy Control suppress collection.

Only random journey/event IDs, an allowed stage and an allowed service are accepted by the public endpoint. Unexpected fields, including URLs and email addresses, are rejected. The database stores HMAC-derived journey and booking hashes; it stores no raw booking reference, contact fields, price, access token, URL or referrer in the funnel tables. This is pseudonymous data, not a promise of absolute anonymity. Only owner/finance staff can request aggregate reports. Telemetry failures do not fail checkout or fulfillment, so counts may understate observed conversions during outages.

The browser retains pending stage IDs in tab-scoped session storage for up to 24 hours. Retried stages reuse the event ID; the database enforces one event per journey/stage. Cross-service reassignment is rejected. Confirmation requires a private server link created by a consented checkout, and both link-before-confirmation and confirmation-before-link races are handled. Funnel IDs are excluded from the financial checkout payload hash.

Withdrawing analytics consent during the active tab journey clears the local event queue and submits deletion of its events and hash-only booking link. An opt-out tombstone prevents late events/webhooks from restoring it. Failed withdrawals are retained for retry on focus, connectivity recovery and a timer. Clearing the tab's storage before deletion reaches the server removes this recovery information. This is active-journey withdrawal, not a global historical-data deletion service.

Runtime bootstrap and additive migration `0111_booking_funnel.sql` provide the same tables. Scheduled hourly retention purges whole journeys whose first event is older than 90 days, old links and tombstones, including while collection is disabled. Verify production cron execution separately. Do not rotate `RATE_LIMIT_SALT` without first purging retained funnel tables: old hashes cannot be addressed using a new key. Existing checkout/rate-limit use of the salt also needs consideration before rotation.

## Existing Google Analytics

The previous implementation emitted raw page URLs, query strings and document titles without checking consent. The component now honors analytics consent/DNT/GPC, emits only an explicit allowlist of public paths, uses a fixed title and empty referrer, and disables sending on private routes and withdrawal.

The remote tag is additionally disabled unless `GA_ENHANCED_MEASUREMENT_VERIFIED=1`. Leave this unset or `0` until the property's Enhanced Measurement settings have been inspected: disable automatic history-based page views, form interactions, outbound links and any other automatic event collection that could include private values. Test real browser network requests across private navigation before setting the variable. Google's page-view documentation warns that history-based Enhanced Measurement can send events even with `send_page_view: false`: https://developers.google.com/analytics/devguides/collection/ga4/views . Local tests cannot verify remote property configuration. First-party funnel collection does not depend on this variable or GA.

## Verification status

29 funnel/real-checkout integration checks passed, including denied consent/configuration/origin, strict schemas, duplicate/concurrent events, completion races, withdrawal with late requests, cohort math, denied staff roles, bootstrap parity, retention and financial idempotency when funnel IDs change. Another 20 booking/security regression checks passed. Seven browser checks passed across desktop and phone, covering consent/configuration denial, retry IDs, reload, withdrawal and report filtering. TypeScript, focused ESLint and the production build passed during implementation. Full CI and final checkpoint evidence are tracked in the implementation roadmap. No production collection or GA verification is implied by this branch.
