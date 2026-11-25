# Sales Intelligence: decisions

| # | Date | Decision | Why | Confirmed by |
|---|---|---|---|---|
| D1 | 2026-11-24 | Extend Waydidi Assistant and the existing conversation store, CRM quotes, pricing and payments; no second orchestrator or parallel tables | The brief forbids a competing source of truth; most of the workflow exists | Owner (plan accepted) |
| D2 | 2026-11-24 | Deliver in six small PRs, each off by default when it messages customers or moves money | `main` deploys straight to production | Owner |
| D3 | 2026-11-24 | WhatsApp stays on the Meta test number; no number migration or coexistence change | Owner answer | Owner |
| D4 | 2026-11-24 | Supplier rate tables start empty; no illustrative prices are seeded | No contract spreadsheet exists yet | Owner |
| D5 | 2026-11-24 | Conversation "mode" is derived from existing columns (`assigned_*`, `bot_paused`, `status`), not stored in a new column | One source of truth for takeover; avoids drift between two flags | Proposed (PR 1) |
| D6 | 2026-11-24 | `SALES_AI_ENABLED` is not introduced in PR 1 | PR 1 sends no new customer messages; it only suppresses sends. Flags start with PR 2 (`SALES_AI_QUOTE_APPROVAL`) | Proposed (PR 1) |
| D7 | 2026-11-24 | The AI activity log is owner-only and append-only from application code (no edit or delete routes, only retention purge). No hash chain | D1 cannot serialize a hash chain cheaply under concurrent writes; append-only plus restricted access fits the risk | Proposed (PR 1) |
| D8 | 2026-11-24 | Activity log retention 180 days by default (`AI_ACTIVITY_RETENTION_DAYS`) | PDPA minimization; long enough to analyze lost quotes | Proposed (PR 1) |
| D9 | 2026-11-24 | WhatsApp media is recorded by reference only in PR 1; nothing is downloaded until F01 | Media URLs need the access token and short-lived handling; reading comes with prompt-injection tests | Proposed (PR 1) |
| D10 | 2026-11-24 | Similar-route pricing will only be a staff hint until a backtest against past bookings shows its error rate | Weights in the brief are unvalidated | Proposed |
| D11 | 2026-11-24 | Customer text in en/th/zh through `messages/*.json`. (Staff Telegram language: see D15) | Repository rules | Repository |
| D12 | 2026-11-24 | The chat assistant is renamed from "Non" to "Waydidi Assistant" for customers and staff (`lib/cee/name.ts`). Older messages saved as "Non" are shown with the new name. Code paths keep their `cee` file names; the kill switch is `ASSISTANT_DISABLED_CHANNELS` | Owner request | Owner |
| D13 | 2026-11-24 | Only the **owner** approves AI quotes in Telegram. Every approval action checks that the Telegram user is linked to an active staff account with role `owner`; support and operations are refused even if added to the group later | The owner is the only admin in the Telegram group | Owner |
| D14 | 2026-11-24 | An approved WhatsApp quote stays valid for **3 hours** from approval. The website's 30-minute transfer quote (`lib/quote-validity.ts`) is unchanged. Price and availability are checked again when the customer books | Owner answer | Owner |
| D15 | 2026-11-24 | Staff Telegram cards for Sales Intelligence stay in **English**. This is an owner exception to the repository rule "Staff-facing Telegram text is Thai" (`AGENTS.md`) | Owner answer | Owner |
| D16 | 2026-11-24 | PR 2 drafts **transfer** quotes only. Hourly requests on approval channels go to staff, because CRM quotes open a transfer booking form | CRM quote acceptance is transfer-only today | Proposed (PR 2) |
| D17 | 2026-11-24 | One pending draft per chat: a newer draft replaces the older one. Multi-leg quotes arrive with PR 4 | Keeps approval unambiguous until per-leg quotes exist | Proposed (PR 2) |
| D18 | 2026-11-24 | "Ask customer" and "Edit message" buttons are not built: the owner uses **Take over** and types in the chat | The owner is the only approver; Take over already silences the assistant | Proposed (PR 2) |
| D19 | 2026-11-24 | The approved quote's customer message is chosen by the script the customer writes in (Thai, Chinese, otherwise English) | Deterministic; no AI involved in the priced message | Proposed (PR 2) |
| D20 | 2026-11-24 | **Prices come only from the website price database** (or a price the owner types on a draft). No target margin, no payment-fee figure, no `minimum_sell` floor and no cost-based or similar-route price estimation. PR 3 as planned (supplier rates and margin floor) is dropped | Owner answer | Owner |
| D21 | 2026-11-25 | PR 4 and PR 5 go to their own branches (`claude/sales-ai-pr4`, `claude/sales-ai-pr5`), stacked on the previous PR | Owner answer | Owner |
| D22 | 2026-11-25 | Multi-trip quotes: all transfers quoted in one assistant reply form one bundle (max 6). One approval, one customer message, one CRM quote per trip so the customer can accept trips separately. Per-trip price edits; no car switching on bundles. Package discounts are not offered (prices come only from the database, D20) | Reuses CRM quotes and their acceptance page; partial acceptance comes for free | Proposed (PR 4) |
| D23 | 2026-11-25 | Multi-day itineraries are not priced by the assistant: a Trip planning request card opens the existing trip planner with the chat loaded; the planner's own AI step and staff do the plan | The trip planner already handles stops, opening hours, driver hours and PDFs | Proposed (PR 4) |
| D24 | 2026-11-25 | WhatsApp photos/PDFs are read before the message is saved (bounded to about 25 s; a slow read falls back to the placeholder and Meta retries are deduplicated) and only the validated fields are kept; the file is not stored. Voice notes are not read | Simplest flow that lets the assistant use the facts; PDPA minimization | Proposed (PR 4) |
| D25 | 2026-11-25 | Lead scores use the brief's weights, each signal once per chat with its message as evidence, minus 3 points a day after 3 quiet days. Signals come from fixed word lists (English, Thai, Chinese) and the database, not from AI | Reproducible, explainable, cheap; no protected traits | Proposed (PR 5) |
| D26 | 2026-11-25 | Follow-ups at 2 h and 22 h (inside WhatsApp's 24 hours, since there are no approved templates yet), at most 2 a week and 6 hours apart, never in 21:00–08:00 Bangkok. The 3-day follow-up from the brief waits for templates. A 7-day "no reply" card asks the owner for a loss reason (per quote, not a report) | Owner answer: no templates yet | Proposed (PR 5) |
| D27 | 2026-11-25 | Lost-quote analysis counts sent bundles once; unanswered quotes are "Still open" for 7 days, then "No decision"; only the owner's label or the customer's own words give a reason | The brief: never assume inactivity means loss, never fabricate a reason | Proposed (PR 5) |

## Open questions for the owner

- Approved WhatsApp templates (needed before any follow-up outside 24 hours).
