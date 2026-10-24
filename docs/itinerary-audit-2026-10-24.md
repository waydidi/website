# Waydidi itinerary audit and development report

Date: 24 October 2026 (Asia/Bangkok)
Branch: `fix/itinerary-audit-2026-10-24`
Starting commit: `360ef16d2b214c4d3cbd73862e2866819d7c7692`

## Scope and release status

Reviewed the customer `/itinerary/[token]` page, its page components and public action/live/PDF endpoints; the shared admin/agency trip editor and API handlers; attraction and package data, photo upload integration, scheduling and travel estimation; D1 persistence and snapshots; live adjustments; PDF generation; and the relevant staff access rules and tests. The public `/trip/[reference]` ride-status experience is a related integration, not a redesigned page in this change.

All database tests use disposable Miniflare D1 databases or the local browser-test database. No production migrations, database writes, deployments or merges are authorized or performed. There are no new dependencies, schema changes or Worker variables. Merging to `main` triggers the existing production deployment pipeline and requires the owner's release decision.

This is a focused reliability and usability improvement, not a claim that every itinerary subsystem is production certified. Live Google services, real customer notifications, live driver GPS and real payment processing were not exercised with production credentials.

## Confirmed bugs and fixes

| Severity | Finding and root cause | Change |
|---|---|---|
| High | A failed save did not stop `action()`, allowing send/add-day/other actions to operate on an older persisted trip. | Follow-up actions stop when saving fails; edits stay in the form. |
| High | Two editors could silently overwrite each other; the paid-trip check and update were separate. | The editor sends `expectedUpdatedAt`; the update atomically checks that timestamp, agency scope and unpaid status. Conflicts return HTTP 409. Existing internal callers remain compatible. |
| High | Editing during an asynchronous save/reload could replace newer local edits with the saved copy. | Track edit revisions, preserve newer edits and stop subsequent actions until the newer version is saved. |
| High | Auto-arrange responses could apply stale stops during the 600 ms debounce before the next request started. | Invalidate pending planning responses immediately on planning-field edits. |
| High | Typing a different pickup, drop-off or custom place retained the previous location's coordinates. | Clear coordinates on free typing; selecting a Google suggestion supplies the new coordinates. |
| Medium | Returning to “End where the trip starts” left the old drop-off in planning requests, although saving cleared it. | Normalize both live planning and saved data to the same return-to-pickup rule. |
| Medium | Shape-only date/time regexes accepted impossible dates and times. Pickup/drop-off lacked coordinate bounds; duplicate stop IDs broke identity and map/edit operations. | Share calendar and 24-hour time validation; bound and pair coordinates; reject duplicate IDs and reversed visit windows. Attraction sessions and quick quotes reuse the validation. |
| Medium | Malformed Google matrix elements could index outside the point array or produce invalid minutes. Partial results were labelled wholly Google-derived. | Request per-element status, validate response elements in a pure helper, round durations up, retain pairwise estimates and label incomplete matrices as estimates. |
| Medium | A future departure was sent with traffic-unaware requests; “now” travel data could stay cached for 12 hours. | Omit incompatible departure data, use 15-minute departure buckets, and shorten current/future cache TTLs to 5/60 minutes. |
| Medium | Operations staff's attraction uploads went to the blog endpoint, which their role cannot use. | Add `/api/admin/attractions/images`, reusing the bounded, authenticated uploader; use it for planner photos without granting blog permissions. |
| Medium | Removed attraction/package details could silently lose checks or fees. Meal stops without locations hid missing drive calculations. | Show missing-attraction warnings, missing-package errors, missing-pickup/meal-location warnings and long-drive warnings. |
| Medium | Proposed time extensions/shortening could be labelled as fitting despite remaining closure/session errors. | Evaluate all errors before labelling those alternatives as fitting. |
| Medium | Live shortening could accept malformed minutes, or increase a visit of five minutes or less due to a negative cut. | Validate live actions, reject visits too short to shorten, and return a controlled conflict instead of corrupting the snapshot. |
| Medium | Multi-day photo lookup keyed only by stop ID; copies can reuse IDs. Editing a stop's attraction also changed which photos a frozen customer stop used. | Scope lookup by trip day and retain attraction identity in new frozen snapshot stops; old snapshots retain a compatible fallback. |
| Medium | The page and PDF endpoint could expose a previous snapshot when the trip was returned to draft/pricing. | Public page/PDF access respects unpublished and withdrawn states; staff PDF preview remains available through its authenticated endpoint. |
| Medium | Long PDF titles, details, highlights and dress codes could overflow; the price box was too small for all price lines. | Wrap and paginate long content, split oversized words, reserve dynamic heading space and enlarge the summary area. |
| Low | Customer map markers had identical icons, orange CTA colours differed, and reorder targets were 28 px. | Number destination markers consistently with the timeline; use #FE8B05 and dark text on primary customer buttons; increase editor controls to 44 px. |
| Low | Closing/reopening the full-screen map left marker listeners allocated. | Release markers, listeners and map references on cleanup. |

## Existing functionality verified or retained

- Trip creation, save, edit, stop removal/reordering and reload are exercised against real local D1-backed handlers.
- Desktop drag-and-drop already existed; phone users already had move-up/down alternatives. Both are retained.
- Opening/closing hours, last-entry warnings, weekly closures, exceptions, weekday sessions, fixed-session check-in buffers, visit durations and total booked-hour limits already exist in the pure scheduling engine.
- Meal/custom stops, pickup/drop-off, vehicle capacity checks, estimated travel fallback, fee inclusion/onsite distinctions, packing lists and alternative plans are retained.
- Multi-day grouping and split-into-days already exist. Tests cover preserving places, dates, shared transport/discount totals and simultaneous split requests.
- Sending freezes a customer snapshot; editing the staff draft does not change the customer's PDF until a new version is sent.
- Customer and authenticated admin/agency PDF downloads share the same generator. Tests verify matching bytes for controlled fixtures and combined multi-day documents.
- Customer galleries, place-specific viewers, sticky section tabs, share/help tools, language selection and the sticky booking bar are retained.
- Signed-out and cross-agency saves are denied; cross-origin writes are rejected. Staff role gating remains in the Worker, and the new upload path uses the attraction permission scope.
- Public links are bearer credentials. They are intentionally shareable, noindex, and use a no-referrer page policy. Treat possession of a link as access to its customer-facing itinerary.

Source inspection is distinguished from runtime verification: retained features without a specific passing test are not represented here as independently live-tested.

## UI/UX changes

The customer page keeps its existing gallery-led, single-column layout and sticky navigation. Numbered timeline stops now correspond to numbered orange map markers. Visit times, estimated duration, inbound drive time, waiting and customer notes sit inside an expandable detail block, leaving photos and destination names prominent. Attraction opening times are not added to the customer timeline or PDF detail headings.

Primary customer CTAs use exact Waydidi orange `#FE8B05` with dark text for legibility; the change-request action is secondary. Editor stop controls have 44 px touch targets and wrap inside their card. Existing sticky summaries, mobile editor steps, native expandable content, galleries and animations are reused. New customer schedule copy is in the English/Thai/Chinese message catalogs.

A browser unload warning protects unsaved staff drafts. This does not provide full in-app navigation interception or offline recovery; those are separate improvements below.

## Remaining issues and incomplete functionality

| Priority | Finding | Recommended next change and reason |
|---|---|---|
| P0 | Publishing versions and multi-day status changes use multiple writes. Snapshot insertion, row update and per-day send status are not one atomic publish transaction. Concurrent sends can compete for the same version. | Design and test an atomic D1 publish operation with a version guard across every affected day, plus an idempotency key. Keep payment-state transition testing in scope. This is a larger workflow change, not silently included here. |
| P0 | PDF image embedding fetches stored URLs on the server without a dedicated provider allowlist or streamed byte limit. URLs are supplied through staff/attraction data, not arbitrary public PDF query input, but can still create resource and outbound-request risks. | Centralize an HTTPS image fetch policy, allowlisted providers or approved cached assets, redirect policy and byte/pixel limits; test redirects and private targets. Avoid breaking existing external attraction photos with an unreviewed blanket restriction. |
| P1 | PDF uses standard Latin fonts and deliberately strips unsupported characters; Thai/Chinese names and copy disappear. WebP covers also cannot be embedded directly. | Bundle licensed multilingual fonts with text shaping and normalize PDF images to JPEG/PNG at ingestion. Reuse the existing upload conversion, support imported WebP, and render multilingual regression fixtures. |
| P1 | Admin route map draws a straight polyline; customer map shows location pins, not a road-following route. Kilometre distances are not first-class itinerary values. | Extend the existing server-side Routes integration to return cached road geometry and distance, then reuse it in both maps and PDF summaries. Keep provider keys on the server and preserve fallback labels. |
| P1 | All matrix legs use a shared trip-departure context; live projections use distance-based estimates. Night-opening attractions and cross-midnight sessions are not modeled as explicit dated intervals. | Add leg departure-aware planning and dated operating intervals before advertising exact traffic-aware or overnight scheduling. Include overnight/multi-session fixtures and Bangkok date boundaries. |
| P1 | Live skip/shorten updates do not rebuild every stored downstream time/return/drive total in the frozen snapshot. The live component can show projections while the static page/PDF keeps old aggregate times. | Define whether live adjustments update the published itinerary or remain operational overlays, then use one recalculation/versioning path for web, live view and PDF. |
| P1 | Photo URLs in frozen snapshots can point to mutable remote content; old snapshots without `attractionId` use the current draft association as a fallback. | Cache approved assets with immutable versions and persist snapshot-to-attraction identity for all newly sent trips. Do not rewrite historical snapshots without an explicit migration plan. |
| P1 | Shared image upload validates MIME and byte size but does not establish server-side pixel/signature validation. Planner upload conversion may fail and fall back to the original. | Add a shared, tested image validation/normalization layer before storage; keep role scopes separate from storage implementation. |
| P2 | Full reloads warn about unsaved edits, but internal links and browser crashes can still lose drafts. Explicit save remains required. | Add a clear dirty-state indicator and in-app leave guard first. Consider account-scoped draft recovery with a reviewed retention/privacy policy, rather than placing customer data in localStorage by default. |
| P2 | Availability/reservation confirmation is represented through rules/flags, not an attraction reservation engine. More than 25 unique route points uses estimates. | Add supplier availability only when there is a real booking integration; show estimate/source explanations and split long journeys into days. |
| P2 | Automatic gallery rotation lacks an explicit pause control; GPS permission failures are silent; sharing fallback has limited feedback. | Add pause/play, localized location-permission feedback, and a copy-link failure fallback. Preserve reduced-motion support. |
| P2 | Public PDF GET is relatively expensive and does not have a dedicated PDF-generation budget/cache. | Cache immutable PDF bytes per published version, add an appropriate read budget, and invalidate on an intentional new version. |

## Prioritized design recommendations

| Impact / effort | Recommendation | Benefit |
|---|---|---|
| High / small | Add a compact itinerary health summary next to Save: unsaved, calculating, conflicts and ready-to-send. | Staff can see the next required action without inspecting every card. |
| High / medium | Add a one-line day summary: activity, driving, waiting and finish time, with a “view timeline” link. | Customers understand pacing without a dense dashboard. |
| High / medium | Road-following route with consistently numbered cards, including a distinct final drop-off. | Connects the map to the actual day's order and avoids implying straight-line navigation. |
| High / medium | Multilingual, versioned PDF with page numbers and continuation headings. | Makes the export suitable for customers, drivers and print distribution. |
| Medium / small | Compact descriptions with explicit “See details”, plus a short essentials row for dress code and tickets. | Keeps the first screen clean while preserving useful information. |
| Medium / medium | Touch-friendly drag handle with keyboard ordering, retaining the accessible up/down controls. | Speeds long itinerary edits without making dragging compulsory. |
| Medium / medium | Explicit meal/rest/traffic buffer stops with an explanation in the timeline. | Makes long day trips more realistic without a complex settings panel. |
| Medium / small | Better empty-state examples and localized API/permission feedback. | Reduces staff setup friction and customer uncertainty. |

## Testing and QA

Final results are recorded after the validation run below. Test code is part of this branch. Provider calls use synthetic responses; no production Google key, customer payment or message is used.

- D1 request-level regression tests cover create/edit/reorder/remove, stale and simultaneous saves, unauthorized and cross-agency requests, invalid input, frozen exports, invalid live adjustments and unpublished PDFs.
- Pure rules tests cover session checks, closures, arrangements, fees, impossible alternative plans, missing map data and malformed matrix elements.
- Browser checks cover failed-save action blocking, coordinate clearing, reordering and overflow, alongside existing customer gallery/map/section/actions and phone-builder flows.
- PDF QA uses a generated long-content test fixture, Poppler rendering and visual inspection. It checks layout, not multilingual font support.

Validation results:

| Check | Result |
|---|---|
| `npm run lint` | Passed with no reported lint errors or warnings. |
| `npm run typecheck` | Passed. |
| Focused D1/planning/PDF/translation suite | Initial expanded run: 42 passed, zero failures. The later full run includes the additional upload, live-adjustment and unpublished-PDF regressions. |
| Itinerary browser checks | All 23 applicable checks passed across desktop, Pixel 7 phone and 820 × 1180 tablet, including the admin setup. Two phone-only builder cases were intentionally skipped on desktop/tablet. |
| Browser retry | One desktop case initially hit `ERR_EMPTY_RESPONSE` during a local server restart. It passed on a clean rerun (setup + case: 2 passed). No test assertion was removed or weakened. |
| Responsive visual QA | Customer timeline/actions and editor stop cards inspected from browser screenshots. No horizontal overflow in the tested editor viewports. |
| PDF visual QA | Long-content fixture rendered with Poppler: three A4 pages, zero characters outside page bounds in extraction; rendered pages inspected. |
| Full `npm test` | 706 passed, zero failed/skipped/cancelled; build + repository-wide tests completed successfully. |
| Final `npm run build` | Passed after the completed source changes. Existing vinext route-classification notices remain. |

The default Vite dev server attempts to enumerate network interfaces, which this environment blocks. Browser runs used an explicit `127.0.0.1` host and a temporary tablet project configuration. A separate local checkout avoided cache interference with the repository-wide test runner. No production configuration was changed for these environment workarounds.

Existing browser assertions that prohibited all stop times were updated to require times to be hidden initially, visible after expanding details, and collapsible again. The original gallery/map/navigation/action assertions remain intact.

## Suggested roadmap

1. Review and release this isolated branch after CI and owner approval. No production migrations are required.
2. Resolve atomic publishing and image fetch policy first, with real failure/concurrency tests.
3. Make PDF assets immutable and multilingual; add PDF caching and visual regression checks.
4. Share road geometry, kilometres and per-leg travel estimates between admin and customer views.
5. Unify live adjustments with dated scheduling, overnight rules and realistic buffers.
6. Add draft recovery and focused accessibility improvements; validate with staff on actual phones.

## Modified files

The final branch diff is the authoritative list. Changes are limited to itinerary/trip-planner components and endpoints, attraction upload integration/validation, trip scheduling/persistence/PDF helpers, related translations, regression tests and this report. The shared attraction validators affect the data used by itinerary planning; the shared planner image helper also serves trip packages. The original blog uploader and unrelated pages are unchanged.

## Provider reference

The request field mask and matrix limits were checked against the [Google Routes computeRouteMatrix reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix). The existing 100-element traffic-aware cutoff is a conservative application choice; Google documents the 100-element restriction for `TRAFFIC_AWARE_OPTIMAL`, rather than all traffic-aware modes. Departure-time usage follows [Google's traffic configuration guidance](https://developers.google.com/maps/documentation/routes/config_trade_offs).

### File inventory

- `app/api/admin/attractions/images/route.ts`
- `app/api/itinerary/[token]/pdf/route.ts`
- `app/itinerary/[token]/page.tsx`
- `components/itinerary/itinerary-actions.tsx`
- `components/itinerary/trip-map.tsx`
- `components/trip-planner/trip-workspace.tsx`
- `components/trip-planner/ui.tsx`
- `docs/itinerary-audit-2026-10-24.md`
- `e2e/itinerary-audit.spec.ts`
- `e2e/itinerary-page.spec.ts`
- `lib/attractions.ts`
- `lib/smart-trips.ts`
- `lib/trip-api.ts`
- `lib/trip-i18n.ts`
- `lib/trip-live-data.ts`
- `lib/trip-pdf.ts`
- `lib/trip-plan.ts`
- `lib/trip-travel-rules.ts`
- `lib/trip-travel.ts`
- `lib/trip-validation.ts`
- `messages/en.json`
- `messages/th.json`
- `messages/zh.json`
- `tests/itinerary-audit.test.mjs`
- `tests/trip-plan.test.mjs`
- `tests/trip-travel-rules.test.mjs`
