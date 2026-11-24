# Sales Intelligence: decisions

| # | Date | Decision | Why | Confirmed by |
|---|---|---|---|---|
| D1 | 2026-11-24 | Extend Non and the existing conversation store, CRM quotes, pricing and payments; no second orchestrator or parallel tables | The brief forbids a competing source of truth; most of the workflow exists | Owner (plan accepted) |
| D2 | 2026-11-24 | Deliver in six small PRs, each off by default when it messages customers or moves money | `main` deploys straight to production | Owner |
| D3 | 2026-11-24 | WhatsApp stays on the Meta test number; no number migration or coexistence change | Owner answer | Owner |
| D4 | 2026-11-24 | Supplier rate tables start empty; no illustrative prices are seeded | No contract spreadsheet exists yet | Owner |
| D5 | 2026-11-24 | Conversation "mode" is derived from existing columns (`assigned_*`, `bot_paused`, `status`), not stored in a new column | One source of truth for takeover; avoids drift between two flags | Proposed (PR 1) |
| D6 | 2026-11-24 | `SALES_AI_ENABLED` is not introduced in PR 1 | PR 1 sends no new customer messages; it only suppresses sends. Flags start with PR 2 (`SALES_AI_QUOTE_APPROVAL`) | Proposed (PR 1) |
| D7 | 2026-11-24 | The AI activity log is owner-only and append-only from application code (no edit or delete routes, only retention purge). No hash chain | D1 cannot serialize a hash chain cheaply under concurrent writes; append-only plus restricted access fits the risk | Proposed (PR 1) |
| D8 | 2026-11-24 | Activity log retention 180 days by default (`AI_ACTIVITY_RETENTION_DAYS`) | PDPA minimization; long enough to analyze lost quotes | Proposed (PR 1) |
| D9 | 2026-11-24 | WhatsApp media is recorded by reference only in PR 1; nothing is downloaded until F01 | Media URLs need the access token and short-lived handling; reading comes with prompt-injection tests | Proposed (PR 1) |
| D10 | 2026-11-24 | Similar-route pricing will only be a staff hint until a backtest against past bookings shows its error rate | Weights in the brief are unvalidated | Proposed |
| D11 | 2026-11-24 | Staff Telegram text in Thai; customer text in en/th/zh through `messages/*.json` | Repository rules | Repository |

## Open questions for the owner

- Quote validity for AI drafts: keep the existing 30 minutes (`lib/quote-validity.ts`) or longer for approved WhatsApp quotes?
- Target margin and payment fee figures for the margin floor (PR 3).
- Which staff roles may approve quotes in Telegram: owner and operations, or support too?
- Approved WhatsApp templates (needed before any follow-up outside 24 hours).
