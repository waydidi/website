# Multi-city requests, route hubs, day trip index and draft stops

Merging changes two things for customers with no variables set: the quote fix below, and the `/trips` index with its footer link and trip page additions. Everything else stays off until the owner changes a setting.

## What changed

- **Multi-city requests (`MULTI_CITY_REQUESTS`, off):** a third tab in the booking search. Customers enter 2 to 6 legs and contact details. This saves a submitted form in the existing Admin -> Bookings queue and emails `BOOKING_ALERT_EMAIL`. It takes no payment, sends the customer nothing and creates no booking.
- **Route hubs (under `TRANSFER_ROUTE_PAGES`):** `/transfers/city/<city>` lists priced routes to and from a city. A city with no priced route returns 404.
- **More routes (under `TRANSFER_ROUTE_PAGES`):** Bangkok to and from Sukhothai, Khao Yai, Rayong, Sai Yok, Laem Chabang and Chiang Mai, taking the catalogue from 38 to 50 directional routes. Distances and times are editorial estimates.
- **Stops on route pages (under `ROUTE_STOPS`):** route pages list active stop offers, using the same zone rule as the booking flow.
- **Draft stops (inactive):** Ancient City, Wat Sothon, Sanctuary of Truth and Buddha Mountain on Bangkok-Pattaya. The places are new starter entries, so they appear only after a staff place import, unverified and unpublished. An offer needs an active attraction.
- **Day trips (live on deploy):** `/trips` lists published trips by city and returns 404 if none are published. Trip pages also gain usual opening hours per stop, a short FAQ and a breadcrumb back to `/trips`.

## Quote fix: routes outside Bangkok airport transfers

`/api/fare-quote` used to require exactly four vehicles, but Comfort BMW is only sold between Bangkok and its airports. Every other route had three left, so it was refused and sent to manual review. The API now requires a price for every car sold on that route.

**This is live on deploy, with no variable.** Any route whose destination is in a published, non-manual area with complete rules can now be quoted and booked online at your current prices. Check Admin -> Pricing before merging: prices that were never reachable online can now be sold. A missing rule or a manual area still goes to manual review. Comfort BMW stays limited to Bangkok and its airports.

With complete rules, route pages, city hubs and stop offers now work on those routes too, once their variables are on.

## Owner checklist, in order

Set Worker variables in Cloudflare only after this branch is deployed. Public pages cache for up to five minutes, so allow that long after each change.

1. Decide whether the maintenance page should stay on (Admin -> Settings). While it is on, visitors see none of this.
2. `TRANSFER_ROUTE_PAGES=1`. Check `/transfers`, `/transfers/city/bangkok` and the sitemap. Low risk.
3. `MULTI_CITY_REQUESTS=1`. First confirm `BOOKING_ALERT_EMAIL` is set and that staff watch the Bookings form queue. Submit one test request, then remove it.
4. Publish day trips in Admin -> Trips. Check `/trips`. Check each stop's opening hours first, because they now show to customers.
5. `PUBLIC_LANGUAGE_URLS=1`. Approve translations in Admin first, or new text stays in English.
6. `CANCELLATION_OPTIONS=1`. This changes prices and refund terms for new bookings, so confirm the three percentages and hours in `README.md` first.
7. `ROUTE_STOPS=1`. Before activating any offer in `/admin/route-stops`, verify its price, opening hours, detour time and driver cost. All draft prices are unverified suggestions.
8. `MCP_PUBLIC=1`, only when you approve public quoting. Quotes can trigger billable Google calls.

To undo steps 2, 3, 5, 6, 7 or 8, set the variable back to `0`. Purchased cancellation options and stops stay on the bookings that bought them.

## What was tested

See the pull request for results. Focused tests: `tests/fare-quote-route-vehicles.test.mjs`, `tests/vehicle-routes.test.mjs`, `tests/multi-city-requests.test.mjs`, `tests/transfer-city-hubs.test.mjs`, `tests/transfer-routes.test.mjs`, `tests/transfer-route-eligibility.test.mjs`, `tests/route-stops*.test.mjs`, `tests/attraction-packages.test.mjs`, `tests/sitemap.test.mjs`, `tests/edge-cache.test.mjs`, `tests/i18n.test.mjs`.
