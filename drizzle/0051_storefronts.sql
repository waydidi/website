CREATE TABLE IF NOT EXISTS `storefronts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`phone` text,
	`area` text,
	`discount_percent` real DEFAULT 0 NOT NULL,
	`commission_percent` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uidx_storefronts_slug` ON `storefronts` (`slug`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `booking_storefronts` (
	`booking_reference` text PRIMARY KEY NOT NULL,
	`storefront_id` text NOT NULL,
	`fare_before_discount` integer NOT NULL,
	`discount_percent` real NOT NULL,
	`discount` integer NOT NULL,
	`commission_percent` real NOT NULL,
	`commission` integer NOT NULL,
	`cash_at_store` integer DEFAULT false NOT NULL,
	`settled_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_booking_storefronts_store` ON `booking_storefronts` (`storefront_id`);
