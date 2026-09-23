ALTER TABLE `bookings` ADD `binned_at` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `purge_after` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `binned_by` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `bin_previous_status` text;--> statement-breakpoint
CREATE INDEX `idx_bookings_bin_purge` ON `bookings` (`status`,`purge_after`);