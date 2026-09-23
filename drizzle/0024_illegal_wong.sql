ALTER TABLE `bookings` ADD `payment_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `payment_status_updated_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `amount_paid` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `payment_currency` text DEFAULT 'thb' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `payment_failure_code` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `payment_failure_message` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `last_payment_checked_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `reconciliation_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `reconciliation_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `fulfillment_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `fulfillment_started_at` text;--> statement-breakpoint
CREATE INDEX `idx_bookings_payment_reconciliation` ON `bookings` (`payment_status`,`reconciliation_status`);