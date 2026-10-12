# Waydidi agent team

Claude Code subagents for this repo. Repository-wide rules for every agent are in `AGENTS.md` at the root. Each file's `model:` sets which model the agent runs on.

## Model policy
- **Opus** — decisions that are costly to get wrong: points, money, security, law, architecture.
- **Sonnet** — high-volume code and documents that follow an agreed pattern. Faster and cheaper, still high quality.
- **Haiku** — small, short-lived helpers (file search, summaries, formatting). Never a main agent; use the built-in `Explore` agent or `model: haiku` on a one-off task.

| Agent | Model | Why |
|---|---|---|
| project-director, risk-governance-advisor | Opus | Decides decisively and controls risk |
| security-compliance | Opus | Finds vulnerabilities, especially in the new login system |
| solution-architect | Opus | Designs structure that is expensive to fix later |
| backend-engineer | Opus | Points ledger, authorization (no D1 RLS), approvals must not fail |
| ocr-engineer | Opus | Reads receipts, catches fraud, decides auto-approval |
| decision-proxy | Opus | Makes interim business decisions on the owner's behalf |
| product-strategy-advisor | Sonnet | Business view; the director decides |
| business-analyst | Sonnet | Requirements and user stories for decided work |
| frontend-engineer | Sonnet | LIFF and back-office screens from approved designs |
| ux-ui-designer | Sonnet | Follows the agreed design system (G7) |
| devops-engineer | Sonnet | Env and CI by runbook |
| qa-engineer | Sonnet | Bulk of tests |
| ledger-invariant-tester | Opus | Points/ledger correctness invariants — the Opus-only part of QA |

Use one by name, e.g. "ask security-compliance to review the login changes", or list them with `/agents`.
