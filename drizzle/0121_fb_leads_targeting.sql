-- Facebook leads targeting (lib/telegram/fb-leads.ts): why a post was skipped (promo, long_stay, giveaway, bait, spam,
-- solved, admin_post, not_served, no_request, cross_posted, commenting_disabled, already_engaged, and the AI sorter's
-- advert, news, meme, chat, not_thailand), how strong a lead it is (drafted first), and a fingerprint of its text (the
-- same question copied into several groups is collected once). Additive; the Worker also adds these on first use.
ALTER TABLE fb_leads ADD COLUMN skip_reason TEXT;
ALTER TABLE fb_leads ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fb_leads ADD COLUMN text_hash TEXT;
CREATE INDEX IF NOT EXISTS fb_leads_queue ON fb_leads(status, priority, created_at);
CREATE INDEX IF NOT EXISTS fb_leads_text ON fb_leads(text_hash, created_at);
