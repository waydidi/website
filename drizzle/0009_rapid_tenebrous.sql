CREATE TABLE `booking_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`change_type` text NOT NULL,
	`previous_json` text,
	`next_json` text,
	`reason` text,
	`actor` text DEFAULT 'customer' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_booking_changes_reference_created` ON `booking_changes` (`booking_reference`,`created_at`);--> statement-breakpoint
CREATE TABLE `booking_management_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_management_sessions_token_hash_unique` ON `booking_management_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_management_sessions_reference` ON `booking_management_sessions` (`booking_reference`);--> statement-breakpoint
CREATE INDEX `idx_management_sessions_expires` ON `booking_management_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `booking_assignments` ADD `reconfirmation_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `booking_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `cancellation_reason` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `cancelled_by` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `refund_status` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `refund_amount` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `refund_requested_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `refund_completed_at` text;