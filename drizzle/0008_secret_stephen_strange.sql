CREATE TABLE `hourly_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text DEFAULT 'ANY' NOT NULL,
	`vehicle_id` text NOT NULL,
	`minimum_hours` integer DEFAULT 3 NOT NULL,
	`base_price` integer NOT NULL,
	`additional_hour_price` integer NOT NULL,
	`included_km_per_hour` integer NOT NULL,
	`extra_price_per_km` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_hourly_packages_area_vehicle` ON `hourly_packages` (`area_id`,`vehicle_id`);--> statement-breakpoint
CREATE TABLE `hourly_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`pickup_place_id` text NOT NULL,
	`pickup_text` text NOT NULL,
	`pickup_latitude` real,
	`pickup_longitude` real,
	`area_id` text,
	`area_name` text NOT NULL,
	`booked_hours` integer NOT NULL,
	`vehicle_prices_json` text NOT NULL,
	`pricing_version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_hourly_quotes_expires_at` ON `hourly_quotes` (`expires_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `service_type` text DEFAULT 'transfer' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `booked_hours` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `scheduled_end_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `hourly_quote_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `included_distance_meters` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `extra_hour_rate` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `extra_distance_rate` integer;