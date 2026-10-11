-- Photos an admin adds to a booking's evidence (Stand by / Pick up / Drop) from the Bookings card.
-- Kept apart from the driver's GPS evidence; nothing is sent to Telegram.
CREATE TABLE IF NOT EXISTS admin_evidence_photos (
 id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, leg TEXT NOT NULL, step TEXT NOT NULL, file_key TEXT NOT NULL, mime TEXT NOT NULL, uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_admin_evidence_photos_booking ON admin_evidence_photos(booking_reference, leg, step, created_at);
