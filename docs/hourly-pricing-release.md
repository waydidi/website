# Hourly city-pair pricing release

This change belongs to the existing Waydidi Worker project. It does not deploy a new Site or modify production data during tests.

## Pricing policy

- Local bookings: 3–10 hours. The sedan local six-hour package starts at THB 1,800.
- City pairs: Bangkok ↔ Pattaya, Ayutthaya, the Ratchaburi / Maeklong / Damnoen Saduak market area, Khao Yai National Park area, and Kanchanaburi. Both directions use the same price table.
- Actual Google-resolved endpoints determine the price. The selected service area remains independent and must be offered. Its vehicle availability and the endpoint areas' availability are also respected.
- At launch each approved pair uses the following values. `/admin/hourly` offers independent package fields and vehicle switches for every pair.

| Vehicle | 6 hours | 7 hours | 8 hours | 9 hours | 10 hours | Overtime/hour |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sedan | 2500 | 2800 | 3100 | 3400 | 3700 | 300 |
| SUV | 2900 | 3250 | 3600 | 3950 | 4300 | 350 |
| Minivan | 3500 | 3800 | 4100 | 4300 | 4500 | 400 |

BMW is unavailable for hourly bookings. Kilometres are unlimited within the approved itinerary. Fuel, tolls, parking, ferries and driver return travel are included; attraction tickets and tours are not added to these inclusions.

The market service envelope includes Samut Songkhram for Maeklong as well as the Damnoen Saduak / Ratchaburi area. The Khao Yai envelope covers the park approach area across its neighbouring provinces. These are conservative operational envelopes, not full province boundaries; Google province components and coordinates must both match. Addresses outside an envelope require operations review. Existing service areas retain their published geofences. Bangkok includes its two airport pickup zones.

City-to-city requests are raised to six hours. Unsupported pairs, unresolved typed addresses and direct journeys exceeding the pair's maximum driving time require operations review. The initial direct-driving cap is 360 minutes (the base package duration), editable per pair in admin. This eligibility cap is separate from unlimited itinerary kilometres and does not create a kilometre surcharge.

Quotes expire after 30 minutes. Package edits affect new quotes; existing prices stay locked during that window. Area/pair/vehicle disablement immediately blocks checkout. Quotes created under the old indefinite-expiry policy must be recalculated.

## Operations

Customers submit unsupported itineraries through the hourly quote-request flow. Requests appear as submitted forms in the existing admin booking forms queue, with selected service area, itinerary, contact details and hours. They create no payable booking, card charge or notification. An operator reviews the request and creates the quoted manual booking using the existing workflow.

Overtime has one 15-minute grace period. 0–15 extra minutes cost zero; 16–60 cost one hour; 61–120 cost two hours. An operator assesses actual extra minutes under `/admin/payments` using the booking's stored overtime rate. The assessment can be corrected before money is received. After a receipt it cannot be changed by this action. Cash receipts can be partial, are idempotent and cannot exceed the assessed amount. Supplemental overtime cash is tracked separately from the original cash/card payment. Collection updates received funds and profit calculations without changing a settled card payment or representing unpaid overtime as paid.

## Release order

1. Run `npm test`, `npx tsc --noEmit` and lint the changed files.
2. Apply the previous operations migration `0054_journey_payment_recovery.sql` first if it has not already been applied (see `docs/operations-release.md`).
3. Apply `drizzle/0055_hourly_city_pairs.sql` once to the same D1 database before deploying. It creates pair rates and supplemental overtime tables, adds quote metadata, and updates saved sedan local six-hour prices to THB 1,800. Back up the database first. It preserves other saved local package prices. Pair prices use the confirmed defaults until first saved through admin.
4. Deploy the reviewed commit through the existing Cloudflare Workers workflow. The server key must have Places and Routes access. No additional flight or payment provider key is introduced by this change.
5. Smoke-check the five pairs, reverse direction, an unrelated selected city, a disabled vehicle, an unsupported route, quote expiry, an admin rate edit, and a manual overtime receipt.

The automated tests use an isolated D1 emulator. Google responses are mocked; external provider and notification calls are blocked. Real key permissions and geographic edge cases still require a release smoke check.
