-- Sales Intelligence PR 4 (additive): several transfers in one quote draft, and customers' special requests.
-- Also applied on first use by lib/sales-ai/quote-drafts.ts, because Workers Builds does not apply D1 migrations.
ALTER TABLE ai_quote_drafts ADD COLUMN bundle_id TEXT;
--> statement-breakpoint
ALTER TABLE ai_quote_drafts ADD COLUMN leg_no INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE ai_quote_drafts ADD COLUMN needs TEXT;
--> statement-breakpoint
UPDATE ai_quote_drafts SET bundle_id=id WHERE bundle_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_quote_drafts_bundle ON ai_quote_drafts(bundle_id,leg_no);
