-- Facebook leads, send from Telegram (lib/telegram/fb-leads.ts → replyQueue "ready"): the message under a lead that says
-- its comment is waiting in Chrome, with the ส่ง Comment button. Additive; the Worker also adds it on first use.
ALTER TABLE fb_leads ADD COLUMN ready_message_id INTEGER;
