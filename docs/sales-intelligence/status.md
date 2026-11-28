# Sales Intelligence: status

Updated 24 November 2026. PR 0 + PR 1 merged as #324. PR 2 on branch `claude/ecstatic-goodall-ozse1j`.

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

## PR 2: quotes approved by the owner (sandbox-ready, off until `SALES_AI_QUOTE_APPROVAL` is set)

| Check | Result |
|---|---|
| `npm run build` | pass |
| `npm run lint` | 0 errors, 65 warnings (unchanged; none in changed files) |
| `npm run typecheck` | pass |
| `npm run test:unit` | 1196 / 1196 pass (14 new in `tests/sales-ai-quote-approval.test.mjs`) |

Implemented: transfer prices become owner-approved drafts on listed channels (the assistant never sees or states the price; no payment-link tool there); English Telegram card with car options, price source, Approve & send, other car, Edit price (reply prompt, single use), Reject, Take over; owner-only (active `owner` staff account linked to the Telegram user); revisioned single-use buttons; newer draft replaces older; approval blocked if another person has the chat, the chat is closed, the draft expired or the pickup is under 3 hours away; CRM quote valid 3 hours (or until pickup) linked to the chat's CRM contact and lead; one customer message in English/Thai/Chinese with the quote link; WhatsApp 24-hour window respected; interrupted sends reported, never repeated; "needs your price" drafts for routes without a published price; activity-log events for every step; retention purge.

Tested: no price or link reaches the model; website chats unchanged when only WhatsApp is listed; operations, support, unknown users, bots and a deactivated owner refused; stale buttons refused; price prompt rules; concurrent double tap sends once; Thai message; superseded drafts; takeover/closed/expired blocks; outside-window approval recorded as not delivered; manual-price drafts; reject and take over; Telegram webhook secret and group check; retention.

Not built (decisions D16–D18): hourly quotes (go to staff), multi-leg quotes (PR 4), "Ask customer" / "Edit message" buttons (use Take over), margin floor (dropped, D20).

To try it on the test number: set `SALES_AI_QUOTE_APPROVAL=whatsapp`, make sure your Telegram account is in the Telegram team list and linked to your owner staff account, then message the test number for a transfer price.

## Behaviour changes to know about

- A staff reply on WhatsApp more than 24 hours after the customer's last message is no longer attempted (Meta would reject it). It is kept in the chat and logged, but the admin inbox does not yet show a "not sent" marker. **Follow-up:** show it in the inbox and offer a template once templates exist.
- Payment confirmations on WhatsApp more than 24 hours after the customer's last message are likewise not sent (they would fail at Meta). Website and email confirmations are unaffected.

## Blocked / needs the owner

- WhatsApp is on a Meta test number. Live number +66 63 206 4884 and coexistence: not touched.
- Approved WhatsApp templates: none yet (needed for follow-ups and messages outside 24 hours).
- Open question in `decisions.md`: approved WhatsApp templates (PR 5).

## Deferred to later PRs

PR 4 multi-leg, images, itineraries. Daily Sales Report stays excluded.

## PR 5: lead priority, follow-ups and lost quotes

CRM shows open-enquiry priority with evidence from its current stage and quote status. The dashboard counts lost and expired quotes by staff reason or the quote events on record. WhatsApp reminders require owner-recorded consent, approved templates and an explicit enable flag. See [the PR 5 release guide](pr5-followups.md).

## Worker variables (all optional; defaults keep today's behaviour)

`SALES_AI_QUOTE_APPROVAL` (PR 2), `AI_MODEL_FAST`, `AI_MODEL_SMART`, `ASSISTANT_DISABLED_CHANNELS`, `AI_ACTIVITY_RETENTION_DAYS`, `WHATSAPP_GRAPH_VERSION`. The new tables are created on first use and by `drizzle/0127_sales_ai_foundations.sql` and `drizzle/0128_ai_quote_drafts.sql`.
