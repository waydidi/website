CREATE TABLE `customer_booking_links` (
	`booking_reference` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_booking_links_customer` ON `customer_booking_links` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_login_codes_email_created` ON `customer_login_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_customer_login_codes_expires` ON `customer_login_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_agent` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_customer_sessions_token` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_customer_sessions_customer` ON `customer_sessions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_sessions_expires` ON `customer_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`surname` text,
	`phone` text,
	`contact_preference` text DEFAULT 'email' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`marketing_opt_in` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_customers_email` ON `customers` (`email`);