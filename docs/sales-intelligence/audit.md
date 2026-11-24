# Sales Intelligence: current-state audit

Audited 24 November 2026 on branch `claude/ecstatic-goodall-ozse1j`, based on `main` at `35f51ca` (PR #322). The brief is `Waydidi_AI_Sales_Intelligence_Master_Prompt.md`; this file records what the repository already does so that the new work extends it instead of building a second system next to it.

## Summary

The brief reads as a new build. In fact about half of the core workflow already exists and is live:

- **Waydidi Assistant** (`lib/cee/bot.ts`) is a single AI orchestrator on the website chat, WhatsApp and LINE. It quotes only through server-side price tools, hands over to staff, tracks monthly model cost, and stays quiet once a person replies.
- One conversation store (`lib/website-chat.ts`, tables `website_conversations` and `website_chat_messages`) backs the website widget, the admin inbox and the Telegram group.
- CRM (`lib/crm.ts`, `drizzle/0095_connected_crm.sql`) already has contacts, merge, leads, tasks, versioned quotes with hashed acceptance tokens, and marketing opt-in.
- Payments (Stripe, PaySo, cash, slip OCR, reconciliation, discrepancies) are already append-only and idempotent.

The real gaps are: structured supplier costs, quote drafts that need staff approval, WhatsApp media and delivery status, a searchable AI activity log, configurable models, and a strict send-time check when staff take over.

## Stack and runtime

| Item | Finding |
|---|---|
| Framework | vinext (Next.js App Router) on one Cloudflare Worker, `worker/index.ts` (security headers, CSP, crons, maintenance mode) |
| Data | D1 (SQLite) through Drizzle and raw SQL; R2 for files (`lib/file-store.ts`) |
| Deploy | `main` deploys to production through Workers Builds when CI is green. Workers Builds does **not** apply D1 migrations, so new tables also need a `CREATE TABLE IF NOT EXISTS` bootstrap |
| Scheduling | Worker `scheduled()` with a 1-minute cron and hour-boundary jobs; lease rows in D1 prevent overlapping runs (`crm-automation.ts`, Telegram outbox) |
| Queues | No Cloudflare Queues binding. Durable work uses D1 outbox tables with leases and retries (`lib/telegram/outbox.ts`, `lib/crm-email-queue.ts`) |
| Tests | `node --test` with Miniflare in-memory D1 and Vite SSR loading (`tests/website-chat-assignment.test.mjs`, `tests/journey-payment-integration.test.mjs`); Playwright for browser tests |
| CI | `.github/workflows/ci.yml`: lint, typecheck, unit/integration and browser tests |

## Feature-by-feature map

| Brief | Already in the repository | Gap |
|---|---|---|
| WhatsApp inbound (§3.1) | `app/api/integrations/whatsapp/webhook/route.ts`: GET challenge, HMAC `X-Hub-Signature-256` check on the raw body, text/button/list/location parsing, dedup by `whatsapp:<message id>` client id, 503 so Meta retries on failure | Media is reduced to a placeholder line; delivery-status events are ignored; no 24-hour window check before free-form sends; Graph API version is hardcoded (`v21.0`) |
| Orchestrator (§2) | Waydidi Assistant: Haiku for routine messages, a stronger model on `escalate`, prompt caching, 6-step tool loop, refusal handling, 2-minute run lease per chat, monthly cost in `app_settings` | Model IDs and prices hardcoded in `MODELS`/`PRICE`; unknown model is billed at the smart price instead of "unknown"; no per-call log |
| Route pricing (§3.2–3.3) | Area-based transfer prices (`lib/pricing.ts`, `matchPublishedArea`), hourly areas/city pairs, seasons, route inclusions, 30-minute transfer quote validity (`lib/quote-validity.ts`), Google Places (`lib/google-places.ts`, `lib/cee/places.ts`) | No similar-route matching; no supplier-cost floor; no recorded price source per quote |
| Telegram control (§3.5) | Bot with webhook secret, `telegram_admins` allowlist linked to staff accounts, durable outbox with leases, Thai cards, Assign/Wait handover (`lib/telegram/handover.ts`), booking/trip builders | No quote approval card (Approve & Send / Edit / Reject) |
| F01 Images | Payment-slip OCR with review queue (`lib/payment-slip-ocr.ts`, never auto-approves without explicit variables) | WhatsApp images/PDFs are not received or read |
| F02 Multi-day itinerary | Trip planner, trip PDF, `/add_trip`, trip from chat (`lib/trip-*.ts`) | Not connected to Waydidi Assistant's quote drafts |
| F03 Multi-trip | `lib/journey-legs.ts`, `lib/multi-city*.ts`, `lib/leg-prices.ts` | Multi-leg quote with partial acceptance |
| F04 Vehicles | `lib/vehicles.ts`, `lib/vehicle-recommendation.ts` (smallest fit + upgrade) | Child seats, oversized luggage, accessibility |
| F05 Suppliers | Supplier *contacts* page; Telegram bulk-cost (`lib/telegram/bulk-cost.ts`); driver costs | **No supplier rate tables, contracts or versions.** There is also no spreadsheet of current contract rates, so data entry is the bottleneck |
| F06 CRM | Contacts, sources, merge (`merged_into`), leads, tasks, events, export, opt-in | WhatsApp identity not linked to `crm_contacts`; lead signals |
| F07 Lead scoring | `crm_leads` statuses; `fb-leads` targeting | Signal-based score with reason codes |
| F08 Booking links | `crm.publicQuote/acceptQuote` (hashed tokens, versions), chat payment links (`lib/chat-pay.ts`), MCP booking link | Leg selection and revision binding |
| F09 Payments | Stripe/PaySo/cash providers, provider events, reconciliation, discrepancies, refunds, cash collection | Allocation of one payment across several legs only |
| F10 Follow-ups | CRM task reminders with a scheduler lease, CRM email queue, chat idle nudges (`lib/chat-idle.ts`), fb-leads reply queue | WhatsApp quote follow-up sequence with window/template checks |
| F11 Human takeover | `bot_paused`, assignment, "stillMine" check before Waydidi Assistant sends, staff replies check ownership inside the insert | Waydidi Assistant's own send is a **check-then-insert**: a takeover between the check and the insert can still let one AI message out |
| F12 Lost quotes | `crm_quotes` statuses, booking funnel reports | Loss reasons with evidence |
| F13 AI activity log | Monthly cost totals; `sensitive_access_log`; web monitoring | Per-event searchable log with correlation ids |

## Admin, roles and authorization

- Staff sessions with roles `owner`, `operations`, `support`, `finance`, `editor` (`lib/staff-security.ts`). `allowedStaffRoute` gates every `/admin` and `/api/admin` path on the server; unknown sections are owner-only.
- Telegram actions check `telegram_admins` linked to active staff accounts.
- Customer identity: `lib/customer-auth.ts`, `lib/social-customer.ts`.

## Security observations

- WhatsApp and LINE webhooks verify signatures with a constant-time compare. Good.
- Waydidi Assistant's AI output is constrained to tools; prices come only from server code. Good.
- Gap: Waydidi Assistant's reply is inserted without re-checking takeover in the same statement (fixed in PR 1).
- Gap: a free-form WhatsApp reply outside the 24-hour window is attempted and fails at Meta; it should be suppressed and recorded (fixed in PR 1).

## Owner answers (24 Nov 2026)

1. WhatsApp is still on a **Meta test number**. The live number +66 63 206 4884 is not connected; nothing here migrates it.
2. There is **no supplier contract spreadsheet** yet. Supplier rate tables (PR 3) will start empty; no illustrative prices will be seeded.
3. Start with PR 0 (these documents) and PR 1 (foundations).

## Baseline

See `status.md` for the baseline build and test results recorded before any code change.
