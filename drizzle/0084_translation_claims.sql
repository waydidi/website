CREATE TABLE IF NOT EXISTS site_translation_claims (
  lang TEXT NOT NULL,
  hash TEXT NOT NULL,
  owner TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (lang, hash)
);
--> statement-breakpoint
-- Remove legacy machine translations, which could contain private runtime content.
DELETE FROM site_translations WHERE status='machine' OR path IS NULL OR path GLOB '/account*' OR path GLOB '/booking*' OR path GLOB '/trip*' OR path GLOB '/itinerary*' OR path GLOB '/agency*' OR path GLOB '/chat-pay*' OR path GLOB '/pay/*' OR path GLOB '/f/*' OR path GLOB '/s/*';
