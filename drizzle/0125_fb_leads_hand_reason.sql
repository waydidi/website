-- Facebook leads, send from Telegram: why Chrome could not send a comment by itself and a person must finish it
-- ("qr": the QR picture could not be added). While set, ส่ง Comment is refused. Additive; the Worker also adds it on first use.
ALTER TABLE fb_leads ADD COLUMN hand_reason TEXT;
