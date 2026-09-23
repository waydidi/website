CREATE TABLE `passenger_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`result` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`latitude` real,
	`longitude` real,
	`accuracy_metres` integer,
	`actor` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_passenger_verifications_assignment_created` ON `passenger_verifications` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_passenger_verifications_booking_created` ON `passenger_verifications` (`booking_reference`,`created_at`);--> statement-breakpoint
ALTER TABLE `booking_assignments` ADD `passenger_verified_at` text;--> statement-breakpoint
ALTER TABLE `booking_assignments` ADD `passenger_verification_method` text;--> statement-breakpoint
ALTER TABLE `booking_assignments` ADD `passenger_verified_by` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `trip_pin_hash` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `trip_pin_created_at` text;