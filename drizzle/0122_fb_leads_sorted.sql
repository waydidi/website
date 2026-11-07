-- Facebook leads (lib/telegram/fb-leads.ts): the AI sorter's answer, stored when a post arrives so the collector learns
-- at once whether it is a real lead, and reused when drafting (not asked twice). Additive; the Worker also adds it on
-- first use.
ALTER TABLE fb_leads ADD COLUMN routed_json TEXT;
