ALTER TABLE `fare_quotes` ADD `departure_date` text;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `departure_time` text;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `timezone` text DEFAULT 'Asia/Bangkok' NOT NULL;--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `departure_date` text;--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `departure_time` text;--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `timezone` text DEFAULT 'Asia/Bangkok' NOT NULL;