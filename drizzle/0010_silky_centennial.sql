CREATE TABLE `booking_costs` (
	`booking_reference` text PRIMARY KEY NOT NULL,
	`accepted_offer_id` text,
	`agreed_driver_cost` integer DEFAULT 0 NOT NULL,
	`additional_costs` integer DEFAULT 0 NOT NULL,
	`total_driver_cost` integer DEFAULT 0 NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`paid_at` text,
	`payment_reference` text,
	`notes` text,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_booking_costs_payment_status` ON `booking_costs` (`payment_status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `driver_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`driver_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`offered_cost` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`responded_at` text,
	`response_note` text,
	`acceptance_lock` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `driver_offers_token_hash_unique` ON `driver_offers` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `driver_offers_acceptance_lock_unique` ON `driver_offers` (`acceptance_lock`);--> statement-breakpoint
CREATE INDEX `idx_driver_offers_booking_status` ON `driver_offers` (`booking_reference`,`status`);--> statement-breakpoint
CREATE INDEX `idx_driver_offers_driver_created` ON `driver_offers` (`driver_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_driver_offers_expiry` ON `driver_offers` (`status`,`expires_at`);