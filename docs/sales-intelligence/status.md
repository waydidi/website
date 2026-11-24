# Sales Intelligence: status

Updated 24 November 2026. Branch `claude/ecstatic-goodall-ozse1j`, draft PR #324.

## Evidence

| Check | Before (main `35f51ca`) | After PR 0 + PR 1 |
|---|---|---|
| `npm run build` | pass | pass |
| `npm run lint` | 0 errors, 65 warnings | 0 errors, 65 warnings (none in changed files) |
| `npm run typecheck` | not recorded separately | pass |
| `npm run test:unit` | 1171 / 1171 pass | 1182 / 1182 pass (11 new in `tests/sales-ai-foundations.test.mjs`) |
| `npm run e2e` (Playwright) | not run locally | not run locally; CI runs it on the PR |

## Implemented (sandbox-ready, nothing customer-facing switched on)

| Item | Where | Tests |
|---|---|---|
| PR 0 audit, architecture, plan, decisions | `docs/sales-intelligence/` | n/a |
| AI activity log (F13 core): append-only, redacted, owner-only page and API, keyset paging, monthly cost with unknown-cost count, retention purge | `lib/sales-ai/activity-log.ts`, `lib/sales-ai/redact.ts`, `app/admin/ai-activity`, `app/api/admin/ai-activity` | redaction, owner-only (4 roles denied), filter validation, paging, dedupe, purge |
| Configurable models and price table version; unknown model = unknown cost, counted at highest known price in totals | `lib/sales-ai/model-config.ts`, `lib/cee/bot.ts` | resolve, malformed id, unknown cost |
| Guarded assistant send (F11 core): the reply insert checks takeover/pause/closed in the same statement; system notices unaffected | `lib/website-chat.ts` `addBotMessage(..., { onlyWhileNonActive })` | takeover before insert; takeover during the model call; system notice still sent |
| WhatsApp 24-hour window checked at send time; outside it the message is kept, marked `outside_window`, logged, not sent | `lib/website-chat.ts`, `lib/sales-ai/whatsapp-rules.ts` | inside/outside/future/missing; no network call outside window |
| WhatsApp media references (no download) and forward-only delivery statuses, idempotent on retries | `lib/sales-ai/channel-events.ts`, WhatsApp webhook | signature failure, retry dedupe, out-of-order statuses, failed after delivered ignored |
| Per-channel kill switch `ASSISTANT_DISABLED_CHANNELS` | `lib/cee/bot.ts` | model never called, logged once |
| Configurable Graph API version `WHATSAPP_GRAPH_VERSION` | `lib/channels/index.ts` | n/a (default unchanged) |
| Assistant renamed to "Waydidi Assistant" (owner request) | `lib/cee/name.ts` and text across chat/admin/Telegram | existing chat/Telegram tests updated to the new label |

## Behaviour changes to know about

- A staff reply on WhatsApp more than 24 hours after the customer's last message is no longer attempted (Meta would reject it). It is kept in the chat and logged, but the admin inbox does not yet show a "not sent" marker. **Follow-up:** show it in the inbox and offer a template once templates exist.
- Payment confirmations on WhatsApp more than 24 hours after the customer's last message are likewise not sent (they would fail at Meta). Website and email confirmations are unaffected.

## Blocked / needs the owner

- WhatsApp is on a Meta test number. Live number +66 63 206 4884 and coexistence: not touched.
- Approved WhatsApp templates: none yet (needed for follow-ups and messages outside 24 hours).
- Supplier contract rates: none yet (PR 3 starts with empty tables).
- Open questions in `decisions.md` (quote validity for AI drafts, margin and fee figures, which roles approve quotes).

## Deferred to later PRs

PR 2 quote drafts + Telegram approval; PR 3 supplier rates and margin floor; PR 4 multi-leg, images, itineraries; PR 5 lead scoring, follow-ups, lost-quote analysis. Daily Sales Report stays excluded.

## Worker variables (all optional; defaults keep today's behaviour)

`AI_MODEL_FAST`, `AI_MODEL_SMART`, `ASSISTANT_DISABLED_CHANNELS`, `AI_ACTIVITY_RETENTION_DAYS`, `WHATSAPP_GRAPH_VERSION`. The new tables are created on first use and by `drizzle/0127_sales_ai_foundations.sql`.
