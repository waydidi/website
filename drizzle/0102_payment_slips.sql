-- Bank-transfer / PromptPay slips uploaded by customers for "pay later" (cash) bookings.
-- An approved slip is recorded as a cash receipt with id 'slip:<slip id>'. lib/payment-slips.ts
-- creates the same table on first use, because Workers Builds does not apply D1 migrations.
CREATE TABLE IF NOT EXISTS payment_slips (
 id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, customer_id TEXT, file_key TEXT NOT NULL, mime TEXT NOT NULL, image_sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('needs_review','approved','rejected')), extraction_json TEXT, amount_minor INTEGER, bank_reference TEXT,
 reasons_json TEXT NOT NULL DEFAULT '[]', approved_amount_minor INTEGER, decided_by TEXT, decided_at TEXT, decision_note TEXT, created_at TEXT NOT NULL,
 UNIQUE(booking_reference, image_sha256)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payment_slips_status ON payment_slips(status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_payment_slips_hash ON payment_slips(image_sha256);
--> statement-breakpoint
-- One bank transaction can pay for one slip only.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_payment_slips_approved_reference ON payment_slips(bank_reference) WHERE status='approved' AND bank_reference IS NOT NULL;
