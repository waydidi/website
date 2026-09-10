CREATE TABLE `fare_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`pickup_place_id` text NOT NULL,
	`dropoff_place_id` text NOT NULL,
	`pickup_text` text NOT NULL,
	`dropoff_text` text NOT NULL,
	`area_id` text NOT NULL,
	`area_name` text NOT NULL,
	`distance_meters` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`vehicle_prices_json` text NOT NULL,
	`pricing_version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fare_quotes_expires_at` ON `fare_quotes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `pricing_areas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`color` text DEFAULT '#FF8A05' NOT NULL,
	`pricing_type` text DEFAULT 'hybrid' NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft_geometry_json` text,
	`published_geometry_json` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_areas_code_unique` ON `pricing_areas` (`code`);--> statement-breakpoint
CREATE INDEX `idx_pricing_areas_status_priority` ON `pricing_areas` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `pricing_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`area_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_email` text NOT NULL,
	`details_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_audit_area_created` ON `pricing_audit` (`area_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`area_id` text NOT NULL,
	`origin_code` text DEFAULT 'ANY' NOT NULL,
	`vehicle_id` text NOT NULL,
	`base_price` integer NOT NULL,
	`included_distance_km` integer DEFAULT 0 NOT NULL,
	`extra_price_per_km` integer DEFAULT 0 NOT NULL,
	`fixed_price` integer,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pricing_rules_area_vehicle` ON `pricing_rules` (`area_id`,`vehicle_id`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `fare_quote_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pricing_area` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `route_distance_meters` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `route_duration_seconds` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `base_price` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `distance_surcharge` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pricing_version` integer;