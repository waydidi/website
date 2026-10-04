ALTER TABLE attractions ADD COLUMN meal_slots_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN price_level INTEGER;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN avg_spend INTEGER;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN neighbourhood TEXT;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN best_time TEXT;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN vibes_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN dropoff_note TEXT;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN reservation_note TEXT;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN short_line TEXT;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN i18n_json TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE attractions ADD COLUMN seed_key TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS attractions_seed_key ON attractions(seed_key);
