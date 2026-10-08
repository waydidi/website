# Driver GPS timestamp camera release

Status: implemented on `feat/driver-gps-evidence`; not merged, deployed or verified on a production driver link.

## Driver and operations behavior

The existing authenticated `/driver/trip/[token]` link exchanges its token for the existing secure driver cookie and removes the token from browser history. Camera access starts after Take Photo, using an environment-facing browser camera with the phone-camera input fallback. Capture is compressed to an orientation-aware JPEG, preserving aspect ratio. Drivers can retake, retry fresh location, discard, preview, save privately, and then confirm the existing trip step. Camera streams stop when closed, when the page is hidden, and on unmount.

Pickup photos are available before Waiting at pickup and On trip; drop-off photos before Arrived. Saving a photo never advances the assignment. The default policy makes photos and photo GPS optional. Existing on-the-way/on-trip tracking and no-show requirements remain. The existing legacy PIN-verified state now correctly leads to On trip.

Fresh GPS requests use high accuracy, zero cached age and a configurable timeout. Fixes older than five seconds are rejected in the browser. GPS denial/timeouts preserve a truthful Location unavailable label. Missing geocoding uses Address unavailable and available coordinates have an Open map link. There is no reverse-geocoding or static-map provider call.

The server stores an EXIF-free JPEG and a server-generated, self-contained SVG stamped derivative. SVG text is escaped and images are embedded re-encoded JPEGs; scripts/external content are prohibited by the media response CSP. The derivative says PICKUP PHOTO or DROP-OFF PHOTO. It distinguishes device capture time (unverified) from server receipt time, all displayed in Asia/Bangkok / ICT (UTC+7). The status event has a separate server confirmation timestamp, displayed only after the status transaction succeeds. All persisted timestamps are UTC.

Refresh recovery uses IndexedDB. Photo drafts retain their stable upload ID; failed uploads retry that ID. A local draft is discarded when reopened after six hours. Offline capture time remains device-reported. Required evidence must finish uploading before its trip step can enter the existing offline status queue. New photo evidence is excluded from the existing customer pickup-photo route.

Admin → Journey details contains private photos, assignment/leg/driver context, metadata, retention status, and links to the sanitized originals. Existing operations review links also open the new evidence. Owners can change global photo policy, GPS timeout/accuracy and retention; owners and operations staff can record a reasoned exception for one assignment/event. An exception does not advance the trip or bypass other business rules.

## Data and access control

Apply `drizzle/0098_driver_gps_evidence.sql` once. It adds:

- `driver_evidence_policy`: singleton global settings, default optional photos/GPS, 20-second GPS timeout, maximum 2,000 m uncertainty, 30-day retention.
- `driver_trip_evidence`: booking, assignment, leg, driver, event, GPS, device capture/server receipt/status confirmation times, private object keys, byte count, expiry and deletion marker.
- `driver_evidence_overrides`: staff identity, reason, creation time, scoped to assignment and pickup/drop-off.
- `driver_evidence_upload_limits`: atomic per-assignment upload-attempt counters.
- `driver_status_events.trip_evidence_id` and `confirmed_at`.
- Database triggers that check evidence ownership/type/expiry and current policy within the status transaction, then attach the photo atomically to the accepted status event.

Every driver upload/list/view/confirmation rechecks the assignment token or secure cookie, expiry and revocation. Upload persistence rechecks active booking/assignment after image processing. Confirmation has an atomic state precondition; retries of an existing event return the durable result. Outbound and return assignments remain independent. The new admin endpoints explicitly allow only owner/operations roles, in addition to existing Worker route permissions.

Media is streamed through authenticated application routes. There are no public bucket URLs or bearer signed media links to distribute. Each request is permission-gated; access expires with the session/assignment and photo retention. Responses use private/no-store, nosniff, no-referrer and a restrictive CSP. Customer endpoints never receive new photo keys or evidence GPS.

Limits: server upload body ≤2 MB plus multipart overhead; normalized JPEG ≤2 MB, ≤2 megapixels and ≤1,600 pixels per dimension; strict JPEG decoding/re-encoding with bounded decoder memory. Browser input limit is 25 MB before compression. Upload attempts are atomically limited to 12 per ten minutes and persisted photos to 30 per assignment. File keys are unique per attempt so losing concurrent retries cannot delete the winning image.

Existing five-minute/minute Worker schedules run bounded retention cleanup (20 records per invocation). Expired media is inaccessible immediately; cleanup removes both objects and clears GPS values, leaving audit/status metadata. Retention changes apply to new uploads. Production R2 lifecycle rules should supplement application cleanup if BUCKET is used. Original EXIF is deliberately not stored.

## Notifications and providers

The repository contains Telegram chat and booking/driver-assignment cards, plus legacy LINE trip-status messages. This release adds no evidence-photo messaging, no new Telegram credentials, and no LINE evidence integration. Photo-associated lifecycle statuses remain durable in the existing admin/operations timeline. The new pickup/on-trip/completion evidence path does not call LINE; other existing legacy status and review integrations are unchanged.

Optional Telegram evidence delivery is not enabled in this release. Adding it requires a dedicated configured private destination and an outbox with explicit handling of ambiguous provider outcomes; automatic retries must not repost an uncertain successful send. No images or exact coordinates are sent to external notification channels by this feature.

## Configuration, deployment and costs

The shared file-store deletion now removes D1 fallback parts even after an R2 binding is later enabled, so retention cannot leave those older photos behind.

No new secrets are required. Existing binding/secret names only:

| Name | Purpose |
|---|---|
| `DB` | Existing Cloudflare D1 database; migration required before releasing code |
| `BUCKET` | Existing optional private R2 binding |
| `R2_BUCKET_NAME` | Existing build setting to bind an approved, created bucket |
| `WAYDIDI_ADMIN_SESSION_SECRET` | Existing staff session configuration |
| `WAYDIDI_TRIP_PIN_SECRET` | Existing optional trip-link signing secret; unchanged |

The repository's build configuration says production currently uses D1 file-part fallback when R2 is not configured. This release reuses that storage instead of assuming R2 is active. Camera, browser geolocation and local formatting have no per-use API charge. Cloudflare Worker CPU, D1 reads/writes/storage and optional R2 usage remain subject to account billing/quotas. Stamped SVG embeds the JPEG, so plan for approximately two image copies per photo. No Google geocoding/static-map charge is introduced. Server JPEG processing CPU and retention throughput must be measured on the actual production account before making photos mandatory.

Deployment order:

1. Back up D1 and verify the staging database has prior migrations through 0097.
2. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run e2e`.
3. Build produces the existing Worker configuration in `dist/server/wrangler.json`.
4. Apply the migration to staging, then production during the coordinated release, using the existing Cloudflare account:

   ```bash
   npx wrangler d1 execute waydidi-website-db --remote --config dist/server/wrangler.json --file drizzle/0098_driver_gps_evidence.sql
   ```

   Execute once; the migration is not a repeatable script. Do not deploy code before it is applied.
5. Merge the reviewed branch and use the existing Cloudflare Workers Builds deployment. No Sites republishing or alternate hosting is required.
6. On a disposable authorized production test booking, verify independent outbound/return driver links, pickup photo, completion, staff review, privacy and retries. Keep policy optional until real-device checks pass.
7. Check cron retention on a staging photo with an expired retention timestamp. Confirm expired media returns 404, both objects are removed and GPS metadata is cleared.

A code rollback can leave the additive migration in place. Avoid dropping evidence tables/columns during rollback while photos or status links exist.

## Validation and remaining release gates

- `npm test`: final production build and all 377 tests passed.
- Latest targeted `tests/driver-evidence.test.mjs`: 11 passed. Tests apply all real D1 migrations and exercise actual upload/status/media APIs with only authentication context/provider boundaries stubbed. Covered: time-zone date rollover, invalid image decoding, truthful stamp labels, optionality, assignment/return isolation, same/different-ID concurrency, upload idempotency, mandatory GPS/photo policy, audited exception, expired/revoked access, rate limit, role permissions and retention deletion.
- `npm run lint`: passed, with the repository's existing warnings and image-element warnings; zero errors.
- `npm run typecheck`: passed.
- Playwright cases added for desktop and phone viewport: permission on demand, capture/fresh GPS options, fallback, portrait proportions, denied GPS, refresh recovery, discard, and stable upload retry IDs.
- Browser test execution could not begin here: Chromium startup fails because the execution environment denies a required Unix socket (`socket() failed: Operation not permitted`). All four cases fail at browser launch, before application interaction. No screenshots were produced. Run in GitHub CI/normal workstation before release.
- Real iPhone Safari and Android Chrome, rotated camera files/HEIC fallback, permission revocation, inaccurate/slow GPS and poor connectivity remain real-device release gates.
- Production deployment, production CPU/quotas, cron behavior and a real authorized production driver link have not been verified. Optional map inset, reverse geocoding and Telegram evidence notifications remain disabled/absent.

## Changed files

- Driver UI: `app/driver/trip/[token]/trip-client.tsx`, `components/drivers/gps-camera.tsx`, `lib/driver-step-queue.ts`.
- Driver APIs: `app/api/driver/trips/[token]/route.ts`, `app/api/driver/trips/[token]/evidence/route.ts`, `app/api/driver/trips/[token]/evidence/[id]/route.ts`.
- Admin viewer/policy: `components/drivers/evidence-admin.tsx`, `app/admin/journeys/[reference]/journey-details.tsx`, `app/api/admin/evidence/route.ts`, `app/api/admin/evidence/photos/[id]/route.ts`, `app/api/admin/evidence/[eventId]/route.ts`, `app/api/admin/operations/route.ts`.
- Data/media: `drizzle/0098_driver_gps_evidence.sql`, `db/schema.ts`, `lib/evidence-rules.ts`, `lib/evidence-image.ts`, `lib/evidence-media.ts`, `lib/trip-evidence.ts`, `lib/file-store.ts`, `worker/index.ts`.
- Dependency: `package.json`, `package-lock.json` add `jpeg-js` only.
- Validation: `tests/driver-evidence.test.mjs`, `e2e/driver-evidence.spec.ts`, this release report.
