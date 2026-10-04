-- End-of-chat support rating. Internal to Waydidi; never a Google review.
CREATE TABLE IF NOT EXISTS support_reviews (
 id TEXT PRIMARY KEY,
 conversation_id TEXT NOT NULL UNIQUE REFERENCES website_conversations(id) ON DELETE CASCADE,
 customer_id TEXT, admin_staff_id TEXT, admin_name TEXT,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 feedback TEXT,
 consent_to_publish INTEGER NOT NULL DEFAULT 0,
 publication_status TEXT NOT NULL DEFAULT 'private' CHECK(publication_status IN ('private','pending','approved','rejected')),
 needs_attention INTEGER NOT NULL DEFAULT 0,
 google_cta_shown_at TEXT, google_cta_clicked_at TEXT,
 submitted_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_reviews_admin ON support_reviews(admin_name, submitted_at);
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN closed_at TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN review_prompt_viewed_at TEXT;
--> statement-breakpoint
ALTER TABLE website_conversations ADD COLUMN review_rating_selected_at TEXT;
--> statement-breakpoint
UPDATE website_conversations SET closed_at=updated_at WHERE status='closed' AND closed_at IS NULL;
