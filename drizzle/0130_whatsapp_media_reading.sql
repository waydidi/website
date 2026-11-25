-- Sales Intelligence PR 4 (additive): what was read from a customer's photo or PDF (validated fields only; the file is not stored).
-- Also applied on first use by lib/sales-ai/media-reader.ts, because Workers Builds does not apply D1 migrations.
ALTER TABLE whatsapp_media ADD COLUMN read_status TEXT;
--> statement-breakpoint
ALTER TABLE whatsapp_media ADD COLUMN extracted_json TEXT;
