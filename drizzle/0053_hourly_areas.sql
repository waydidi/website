CREATE TABLE IF NOT EXISTS `hourly_area_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`area_slug` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`hourly_rate` integer DEFAULT 0 NOT NULL,
	`p4` integer DEFAULT 0 NOT NULL,
	`p5` integer DEFAULT 0 NOT NULL,
	`p6` integer DEFAULT 0 NOT NULL,
	`p8` integer DEFAULT 0 NOT NULL,
	`p10` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_hourly_area_rates_area` ON `hourly_area_rates` (`area_slug`);--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `dropoff_text` text;--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `dropoff_latitude` real;--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `dropoff_longitude` real;
