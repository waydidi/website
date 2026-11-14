-- Facebook leads reply queue (lib/telegram/fb-leads.ts → replyQueue): when the browser extension opened a lead in a tab
-- for a person to check and post. A claim lapses after 15 minutes. Additive; the Worker also adds it on first use.
ALTER TABLE fb_leads ADD COLUMN reply_claimed_at TEXT;
CREATE INDEX IF NOT EXISTS fb_leads_marked ON fb_leads(status, marked_at);
-- Who approved "Post to Facebook" in Telegram, and when: the extension then posts that one comment itself.
ALTER TABLE fb_leads ADD COLUMN post_approved_by TEXT;
ALTER TABLE fb_leads ADD COLUMN post_approved_at TEXT;
