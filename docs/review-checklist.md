# Review checklist

One checklist for every reviewer of a Waydidi pull request: Claude Code (`/code-review`, `/security-review`, the `security-compliance` agent) and ChatGPT Codex (GitHub code review, `@codex review`). `main` deploys to production as soon as CI is green, so a missed problem reaches customers, drivers and staff the same day.

Review only what the pull request changes, plus the code those changes call or are called by. Check every section below that the change touches; skip the rest.

## Severity

| Level | Meaning | Examples |
|---|---|---|
| **P0 – block merge** | Loses or moves money wrongly, exposes customer data, lets someone act as another person or role, or takes the site down | Double charge, free paid booking, IDOR on a booking reference, secret in source, webhook accepted without a signature |
| **P1 – fix before merge** | Wrong result for real customers or staff, or a race a busy day will hit | Promo limit beaten by two checkouts, multi-day trip left half-updated, commission silently lost |
| **P2 – follow-up** | Real but limited or unlikely | Missing rate limit on a cheap public endpoint, unclear error, missing denied-case test |
| **Nit** | Style or naming | Don't report nits unless asked |

## 1. Money

- Amounts are integer satang (`*_minor`) or whole THB `total`; no floats, no rounding in between. Converted once with `lib/money.ts`.
- A write that moves money, or that a later payout depends on (receipts, refunds, slips, cash, commissions, promo uses, gift claims), is **atomic**: one D1 `batch`, guarded `WHERE status = …` / version / `updated_at`. It is never several separate `await` writes where a failure halfway leaves partial state.
- It is **idempotent**: a retry or two staff clicking at once cannot post twice (client or derived id, `INSERT OR IGNORE`, unique index). Reuse `lib/cash-collection.ts`.
- **Check-then-write races:** a limit checked by a `SELECT` and enforced only by a later separate `INSERT` (promo `max_uses` / `per_customer_limit`, gift or coupon use, loyalty reward, first-ride-only codes, stock or seat counts) can be beaten by two requests at once. The guard must be inside the same statement or batch as the write.
- Recorded money is append-only: receipts, refunds and slips are new rows, never edited or deleted. Financial documents are frozen snapshots.
- Errors on money-related writes are never swallowed (`.catch(() => undefined)`, `console.error` only). Either the whole operation fails, or the failure is recorded somewhere staff will see it (Operations inbox).
- Prices come from the server's quote (`fare_quotes`, `hourly_quotes`, frozen itinerary snapshot), never from the browser.
- Test-only payment paths (`PAYSO_TEST_MODE`, Stripe test keys, "test" providers) cannot run in production by accident.

## 2. Access and identity

- D1 has no row-level security. Every route checks on the server: the session; the customer's ownership of the booking (`customerBooking`); or the staff role (`allowedStaffRoute`, plus an explicit role check on finance routes). Agency routes are scoped to that agency.
- Look for IDOR: booking references, itinerary tokens, driver tokens and numeric or UUID ids that let one person read or change another's data.
- State-changing requests check `sameOrigin` and `isJsonRequest`; public forms use Turnstile and `overRateLimit`.
- Login, OAuth callbacks, OTP and account linking: no open redirects, state and nonce checked, sessions rotated, rate limited.
- Each new route or action has a test for the denied user or role.

## 3. Webhooks and integrations

- Stripe, LINE, Telegram and WhatsApp webhooks verify the signature or secret before doing anything, and de-duplicate replays by provider event id.
- Telegram and LINE commands that change data check the chat or user is the approved staff chat.
- Calls to providers have timeouts, and their output (including AI output) is validated as untrusted data at the boundary.
- Server-side `fetch` of a URL that came from data (photos, links, callbacks) follows an allowlist, checks every redirect and caps bytes. See `lib/pdf-image-policy.ts`.

## 4. Customer data (PDPA)

- Collect the minimum; never log personal data (names, emails, phones, addresses, tokens) or put it in URLs or query strings.
- Uploads stay private (`lib/file-store.ts`) and are served only to the people who need them.
- Public endpoints never reveal where or when a particular person travelled, directly or by probing (coordinates, place names, timing).
- Analytics and funnel data hold no contact details or access tokens, and respect consent.

## 5. Database and deploys

- Workers Builds does not apply migrations: a new table needs an idempotent `drizzle/NNNN_*.sql` **and** a `CREATE TABLE IF NOT EXISTS` bootstrap on first use. Migrations are additive only.
- Multi-row changes that must agree (all days of a trip, a booking and its payment rows, a booking and its commission) go in one batch.
- New money-moving or customer-messaging features ship behind a Worker variable that is **off** by default, documented in `README.md` and `.env.example`.
- No secrets, real customer data or real tax details in the diff.

## 6. Reliability

- No unbounded loops or queries on public endpoints; public reads that scan tables are rate limited or cached.
- Retries are bounded, and errors shown to people are safe (no stack traces or provider messages).
- Background and cron work survives one bad row (one corrupt job doesn't stop the rest).

## 7. Tests

- Behaviour tests through real modules and in-memory D1 (Miniflare), not checks on source text.
- Money and permission changes cover the happy path, the denied user or role, invalid input, a retry, and two requests at once.
- No test is skipped, weakened or deleted to get green. If code moved, the test follows it and keeps its assertion.

## 8. Customer and staff text

- Customer text goes through `messages/en.json` with `th` and `zh` (`tests/i18n.test.mjs`). Staff Telegram text is Thai.
- The G7 design system (`docs/design-system-g7.md`) and existing components are reused.

## How to report

One finding per problem, most severe first:

```
[P1] Promo limit can be beaten by two checkouts at once
Where: app/api/checkout/route.ts:556, lib/promo-db.ts:19
What happens: two customers submit a max_uses=1 code at the same moment; both pass checkPromo, both bookings are saved with the discount.
Fix: insert the redemption with its limit guard in the same D1 batch as the booking.
```

- Give a concrete failure scenario (inputs, then the wrong result), not "might be unsafe".
- Say plainly when nothing was found in a section you checked.
- Don't push commits to someone else's pull request; suggest the fix.

## Working with two reviewers

1. Codex reviews automatically when the pull request opens; Claude reviews with `/code-review` and `/security-review`.
2. Each reviewer reads the other's findings and replies **agree**, **disagree (why)** or **can't confirm**.
3. A P0 or P1 is fixed before merge when both agree, or when a test reproduces it. A disputed finding goes to the owner with both views.
4. A fixed bug gets a regression test in the same pull request.
5. Neither AI merges. The owner approves every merge to `main`.
