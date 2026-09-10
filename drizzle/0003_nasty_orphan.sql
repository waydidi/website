CREATE TABLE `checkout_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fingerprint_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_checkout_attempts_fingerprint_created` ON `checkout_attempts` (`fingerprint_hash`,`created_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `terms_accepted_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `policy_version` text;