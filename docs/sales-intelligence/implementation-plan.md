# Sales Intelligence: implementation plan

Six reviewable pull requests. Each one is off by default behind a Worker variable when it can message customers or touch money. Daily Sales Report is excluded at every step.

| PR | Scope | Customer-visible? | Flag |
|---|---|---|---|
| 0 | Audit, architecture, plan, decisions, status docs | No | none |
| 1 | Foundations: AI activity log (F13 core), configurable models with unknown-cost state, guarded AI send (F11 core), WhatsApp media references and delivery status, 24h window check, per-channel kill switch | No new messages. Only suppresses sends that would fail or would talk over staff | `ASSISTANT_DISABLED_CHANNELS` (kill switch), `AI_MODEL_FAST`, `AI_MODEL_SMART`, `AI_ACTIVITY_RETENTION_DAYS` |
| 2 | Quote drafts + Telegram approval: transfer prices become owner-approved drafts, `crm_quotes` with price source, English approval card (Approve & send / other car / Edit price / Reject / Take over), owner-only, single-use revisioned callbacks, superseding drafts, 3-hour validity | Yes, only after owner approval | `SALES_AI_QUOTE_APPROVAL=whatsapp` (channel list) |
| ~~3~~ | ~~Supplier rates and margin floor~~: dropped (decision D20). Prices come only from the website price database or the owner's typed price | n/a | n/a |
| 4 | Multi-leg quotes, images, itineraries (F01–F04): per-leg lines, partial acceptance bound to a revision, WhatsApp image/PDF reading (never marks payment), vehicle constraints, itinerary drafts into the trip builder | Yes, after approval | `SALES_AI_MEDIA=1` |
| 5 | Lead scoring, follow-ups, lost-quote analysis (F07, F10, F12) | Follow-ups only, off by default | `SALES_AI_FOLLOWUPS=1` |
| later | Shadow-mode accuracy report and an approved autopilot policy (owner opt-in). No similar-route or cost-based pricing (D20) | Depends on owner approval | owner opt-in |

## PR 1 detail

1. `drizzle/0127_sales_ai_foundations.sql` plus bootstrap in `lib/sales-ai/activity-log.ts`: tables `ai_activity_log`, `whatsapp_media`, `channel_delivery_status`. Additive only.
2. `lib/sales-ai/redact.ts` (pure): removes emails, phone numbers, card-like numbers, bearer tokens and long secrets from log summaries.
3. `lib/sales-ai/activity-log.ts`: `logActivity()` (never throws, never blocks the customer path), `listActivity()` with filters and paging, `purgeActivity()`.
4. `lib/sales-ai/model-config.ts` (pure): model ids from variables, price table, `modelCost()` returns `null` when unknown.
5. `lib/cee/bot.ts`: use configured models; log one `model_call` event per turn with tokens, latency, cost; log handovers.
6. `lib/website-chat.ts`: `addBotMessage` inserts only when the conversation is still Waydidi Assistant's (one guarded statement); suppressed sends are logged. WhatsApp sends outside the 24h window are suppressed and logged.
7. WhatsApp webhook: store media references (id, type, MIME type, size, sha256, caption) and delivery statuses (forward-only), log inbound events.
8. Per-channel kill switch `ASSISTANT_DISABLED_CHANNELS=whatsapp,line` stops Waydidi Assistant on those channels; staff replies still work.
9. Owner-only `/api/admin/ai-activity` (GET, filters) and `/admin/ai-activity` page.
10. Hourly retention purge (default 180 days).
11. Tests: redaction, model cost, window rule, status ordering, guarded send vs takeover, webhook media/status, activity API denied for non-owner roles.
