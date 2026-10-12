# Repository guidelines

Read by every coding agent (Claude Code through `CLAUDE.md`, Codex, others) before changing this repository. Role-specific agents are in `.claude/agents/` (see its README).

## Product and authority

Waydidi Travel (https://waydidi.com) sells private transfers, hourly drivers and tours in Thailand. GitHub `main` deploys straight to production through Cloudflare Workers Builds once CI is green, so a merged change is live for customers, drivers and staff.

Fail closed. When a change touches money, customer data, sign-in or staff permissions and a scope, authority or side-effect question is still open, stop and ask the owner instead of guessing. Never enable a money-moving or customer-messaging feature by default: ship it behind a Worker variable that is off until the owner turns it on, and document the variable in `README.md` and `.env.example`.

Secrets live only in Cloudflare Worker settings. Never commit keys, tokens, real customer data or real company tax details.

## Money and data rules

- Amounts are integer satang (`amount_minor`, `*_minor`); never floats. Bookings store a THB `total`; convert once at the boundary (`lib/money.ts`).
- Recorded money is append-only: receipts, cash receipts, refunds and slips are new rows, never edited or deleted. Financial documents are immutable snapshots.
- Every write that moves money is idempotent (a client-supplied or derived id with `INSERT OR IGNORE` / unique index) and atomic (one D1 `batch`, guarded `WHERE status = ...`), so retries and two staff members clicking at once cannot double-post. Reuse `lib/cash-collection.ts` rather than writing a new money insert.
- D1 has no row-level security. Every route checks the session, the customer's ownership of the booking (`customerBooking`) or the staff role (`allowedStaffRoute`, plus an explicit role check on finance routes) on the server. Add a test for the denied case.
- Personal data (PDPA): collect the minimum, never log it, keep uploads private (`lib/file-store.ts`) and serve them only to the people who need them.

## Architecture

- vinext (Next.js App Router) on one Cloudflare Worker (`worker/index.ts`: security headers, CSP, crons, maintenance mode). D1 via Drizzle and raw SQL, R2 for files.
- Pure rules live in modules without runtime imports (e.g. `lib/payment-slip-rules.ts`, `lib/customer-account.ts`) so they are unit tested directly; database and network code wraps them.
- Interpret each input once, at its boundary: validate request bodies, provider webhooks and AI output into typed values there, and let the rest of the code trust those values. Treat AI output and uploaded files as untrusted data.
- Workers Builds does not apply D1 migrations. A new table needs both an idempotent `drizzle/NNNN_name.sql` and a `CREATE TABLE IF NOT EXISTS` bootstrap on first use (see `lib/receipt-db.ts`). Migrations are additive.
- Reuse before adding: `components/ui/` and `components/account/` for UI, `lib/telegram/client.ts` for staff alerts, `lib/customer-auth.ts` and `lib/social-customer.ts` for customer identity.
- When fixing a bug, fix the code that produces the wrong value, not each consumer, and remove what the fix makes redundant.

## Design and language

Follow the G7 design system in `docs/design-system-g7.md` (tokens in `app/globals.css`). Customer text goes through `messages/en.json` with `th` and `zh` translations (`tests/i18n.test.mjs` enforces parity). Staff-facing Telegram text is Thai.

## Development

- `npm ci`, then `npm run dev`.
- `npm run lint` and `npm run typecheck` (0 errors; warnings already on `main` may remain).
- `npm run build`, then `node --test --test-concurrency=1 tests/<file>.test.mjs` for focused tests, or `npm test` for all.
- `npm run e2e` for Playwright (`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` in Claude cloud sessions).

Run the checks that cover your change before pushing. CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit and browser tests on every push.

## Tests

Prefer behaviour tests through real modules and an in-memory D1 (Miniflare, see `tests/journey-payment-integration.test.mjs`) over checking source text. For money and permission changes cover: the happy path, the denied user or role, invalid input, retries, and two requests at once. Never skip, weaken or delete a failing test to get green; if a test asserts code that moved, point it at the new location and keep the assertion.

## Commits and pull requests

Commit subjects are short plain-English sentences describing the user-visible change (e.g. "Bookings on phone: cards sorted by nearest date first"). Pull request bodies say what changed for customers and staff, what was tested, and which Worker variables the owner must set. Release runbooks for larger features go in `docs/<feature>-release.md`.
