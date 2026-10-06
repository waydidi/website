# Audit reliability release

Production remains https://waydidi-website.contact-waydidi.workers.dev.

## Release order

1. Run `npm test`, `npx tsc --noEmit`, and `npm run lint` on the reviewed commit.
2. Apply migrations through `0083`, then apply `0084_translation_claims.sql` once before deploying this Worker:

   ```sh
   npx wrangler d1 execute waydidi-website-db --remote --config dist/server/wrangler.json --file drizzle/0084_translation_claims.sql
   ```

   The migration creates translation leases and removes old machine translations, including potentially private runtime text. Public copy is translated again on demand. Reviewed public entries remain. Existing private-path or unattributed entries are deleted.
3. Enable **Places API (New)** and Maps JavaScript API for the browser key already used by `/api/maps/config`. Its HTTP referrer restrictions must include the production Worker URL. The server quote key and Routes API configuration stay as configured.
4. Deploy this commit using the existing Cloudflare Workers Builds connection to GitHub. A GitHub merge alone is not evidence of a successful Worker deployment. Check the build/deployment result and smoke-test the production URL.

## Resulting behavior

- An explicit customer-booking link governs account access. Moving a booking from a registered email owner requires confirmation; that email no longer grants account access afterward.
- Chat booking creation and marking its link paid are one D1 transaction. A database failure leaves no extra confirmed booking; concurrent retries cannot insert a second booking.
- PaySolutions credentials alone do not enable chat payments. The adapter remains disabled until hosted payment creation, authenticated callback verification, retrieval and refund behavior are implemented and merchant-tested. Explicit test mode remains available for isolated testing and creates clearly labelled test bookings. Keep `PAYSO_TEST_MODE` unset in production.
- Telegram replies have identities scoped by chat and message ID. Failed saves retain their routing prompt. Retried updates reuse the saved conversation and do not add another reply.
- WhatsApp and LINE return HTTP 503 when inbound persistence fails so their providers can retry. Message and conversation updates are atomic; duplicate delivery can resume scheduling.
- All four address inputs share bounded, retryable script loading and Places API (New) autocomplete. Suggestions support keyboard and touch selection, Thai region restrictions, area bias, session tokens, stale-result suppression and listener cleanup. Typing remains available where it was already supported.
- Live itinerary GPS uses the current outbound driver assignment, an active confirmed booking, usable accuracy and a 90-second freshness window. Revoked, expired, completed and unrelated assignments cannot supply positions.
- Machine translation accepts only exact repository-authored public UI copy. Account, booking, payment, itinerary, agency and staff paths are excluded in both browser and server. New UI copy needs `node scripts/generate-translation-sources.mjs`; this updates the committed approval catalog. Runtime database content stays untranslated. Shared leases prevent duplicate paid translation calls and expire after two minutes if a Worker dies. Model timeouts stay below that lease. Staff-reviewed translations win concurrent writes.

## Validation limits

Tests use isolated D1 databases and mocked external providers. They exercise rollback failures, concurrent calls, retry delivery and browser autocomplete behavior without sending customer messages or making charges. Live merchant credentials, Google key permissions and the production rollout require the deployed environment.
