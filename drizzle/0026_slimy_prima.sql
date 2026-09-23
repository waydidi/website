CREATE TABLE `booking_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`provider_session_id` text,
	`provider_transaction_id` text,
	`provider_status` text,
	`amount_expected` integer NOT NULL,
	`amount_paid` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'thb' NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`reconciliation_status` text DEFAULT 'pending' NOT NULL,
	`reconciliation_attempts` integer DEFAULT 0 NOT NULL,
	`last_checked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_booking_payments_reference` ON `booking_payments` (`booking_reference`);--> statement-breakpoint
CREATE INDEX `idx_booking_payments_provider_session` ON `booking_payments` (`provider`,`provider_session_id`);--> statement-breakpoint
CREATE INDEX `idx_booking_payments_status` ON `booking_payments` (`status`,`reconciliation_status`);
