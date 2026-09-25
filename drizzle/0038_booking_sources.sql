CREATE TABLE `booking_sources` (
	`booking_reference` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_booking_sources_source` ON `booking_sources` (`source`);