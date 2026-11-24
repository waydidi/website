# Sales Intelligence: architecture

## Principle: extend Waydidi Assistant, don't add a second assistant

There is one orchestrator (Waydidi Assistant, `lib/cee/bot.ts`) and one conversation store (`lib/website-chat.ts`). New capabilities are added as narrow tools and deterministic services around them. The model may read messages, extract facts and draft text. Only server code prices, authorizes, verifies payments or creates bookings.

```text
WhatsApp / LINE / website
  -> webhook (signature check, dedup by message id, 503 => provider retries)
  -> website_conversations + website_chat_messages        (existing)
  -> Waydidi Assistant (lib/cee/bot.ts): tools only, schema-validated
       -> price tools: lib/pricing.ts, hourly, seasons     (existing)
       -> [PR 2] draft_quote -> crm_quotes revision -> Telegram approval card
  -> guarded send (refuses if staff took over / paused / closed)   [PR 1]
  -> channel delivery (24h window check for WhatsApp)              [PR 1]
  -> delivery status (sent / delivered / read / failed)            [PR 1]
  -> ai_activity_log (every step, correlation id = conversation)   [PR 1]
```

## Data ownership

| Data | Source of truth | Notes |
|---|---|---|
| Conversations, messages | `website_conversations`, `website_chat_messages` | All channels |
| Takeover state | `assigned_*`, `bot_paused`, `status` on `website_conversations` | No separate "mode" column, so there is one source of truth. `lib/sales-ai/conversation-mode.ts` derives the mode from these |
| Customers, quotes, leads | `crm_*` tables | PR 2 adds quote revisions for AI drafts here, not in a new table family |
| Retail prices | existing pricing tables | Unchanged |
| Supplier costs | new tables in PR 3 | Internal only, never shown to customers |
| Bookings, payments | existing tables and providers | Not duplicated |
| WhatsApp media references | `whatsapp_media` (PR 1) | Media id and metadata only; download and reading arrive with F01 |
| WhatsApp delivery status | `channel_delivery_status` (PR 1) | Keyed by provider message id, status only moves forward |
| AI activity | `ai_activity_log` (PR 1) | Append-only from application code; owner-only access; retention purge |

## Model configuration

`lib/sales-ai/model-config.ts` resolves the fast and smart model ids from Worker variables `AI_MODEL_FAST` and `AI_MODEL_SMART`, falling back to the current defaults. Prices per million tokens are a table keyed by model id; a model without a price records cost as unknown (`null`) instead of guessing.

## Send-time authorization (F11 foundation)

Waydidi Assistant's message insert carries the takeover check inside the same SQL statement:

```sql
INSERT INTO website_chat_messages(...) SELECT ... WHERE EXISTS(
  SELECT 1 FROM website_conversations WHERE id=? AND status<>'closed'
    AND assigned_name IS NULL AND COALESCE(bot_paused,0)=0)
```

If a person takes over at any point before that insert, nothing is stored and nothing is sent; the suppression is written to the activity log. Once the row is inserted, the channel call follows. An API call already in flight cannot be recalled, and the log shows that it was sent.

## WhatsApp customer-service window

`lib/sales-ai/whatsapp-rules.ts` holds the pure rule: free-form messages only within 24 hours of the customer's latest inbound message, measured at send time from stored visitor messages. Outside the window the send is suppressed (`channel_message_id = 'outside_window'`) and logged. Approved templates come later, with the follow-up work.

## D1 constraints

D1 has no interactive transactions. Every multi-step write is one `batch` or one guarded statement (`WHERE` on the expected state), and every insert that can repeat has a unique key with `ON CONFLICT DO NOTHING`.
