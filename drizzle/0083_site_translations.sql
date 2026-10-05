CREATE TABLE IF NOT EXISTS site_translations (
 lang TEXT NOT NULL, hash TEXT NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'machine', path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT,
 PRIMARY KEY (lang, hash)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_site_translations_lang_status ON site_translations(lang, status, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS site_translation_usage (
 day TEXT PRIMARY KEY, strings INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0
);
