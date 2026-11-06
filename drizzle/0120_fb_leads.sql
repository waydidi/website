-- Facebook group leads (lib/telegram/fb-leads.ts): one row per group post sent in by a collector, its drafted comment
-- and whether the team posted or skipped it. Post text and comments are cleared after 90 days. No poster names.
CREATE TABLE IF NOT EXISTS fb_leads (id TEXT PRIMARY KEY, group_key TEXT NOT NULL, group_name TEXT NOT NULL, post_key TEXT NOT NULL, post_url TEXT NOT NULL, post_text TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','drafting','drafted','sent','posted','skipped','not_lead','failed')), attempts INTEGER NOT NULL DEFAULT 0, reply_type TEXT, reliable INTEGER, comment TEXT, details_html TEXT, keyboard_json TEXT, draft_id TEXT, comment_message_id INTEGER, link_message_id INTEGER, marked_by TEXT, marked_by_id TEXT, marked_at TEXT, drafted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(group_key, post_key));
CREATE INDEX IF NOT EXISTS fb_leads_status ON fb_leads(status, created_at);
CREATE INDEX IF NOT EXISTS fb_leads_drafted ON fb_leads(drafted_at);
CREATE INDEX IF NOT EXISTS fb_leads_group ON fb_leads(group_key, status);
