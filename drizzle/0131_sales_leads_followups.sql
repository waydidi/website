-- Sales Intelligence PR 5 (additive): lead signals and scores, follow-up jobs and owner loss labels.
-- Also created on first use by lib/sales-ai/leads.ts, because Workers Builds does not apply D1 migrations.
CREATE TABLE IF NOT EXISTS ai_lead_signals(conversation_id TEXT NOT NULL,signal TEXT NOT NULL,evidence_message_id TEXT,created_at TEXT NOT NULL,PRIMARY KEY(conversation_id,signal));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_lead_scores(conversation_id TEXT PRIMARY KEY,score INTEGER NOT NULL,band TEXT NOT NULL,reasons_json TEXT NOT NULL,notified_band TEXT,last_customer_at TEXT,updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_lead_scores_rank ON ai_lead_scores(score DESC,updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_followups(id TEXT PRIMARY KEY,bundle_id TEXT NOT NULL,conversation_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('customer','review')),seq INTEGER NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','running','sent','suppressed','cancelled','unknown')),reason TEXT,lease_until TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(bundle_id,kind,seq));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_followups_due ON ai_followups(status,due_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_loss_labels(bundle_id TEXT PRIMARY KEY,reason TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('staff')),labeled_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
