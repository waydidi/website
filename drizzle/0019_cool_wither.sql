CREATE TABLE `driver_payout_details` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`bank_code` text NOT NULL,
	`account_number` text NOT NULL,
	`account_name` text NOT NULL,
	`submitted_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `driver_payout_details_assignment_id_unique` ON `driver_payout_details` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_driver_payout_details_booking` ON `driver_payout_details` (`booking_reference`);--> statement-breakpoint
ALTER TABLE `drivers` ADD `bank_account_name` text DEFAULT '' NOT NULL;