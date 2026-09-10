CREATE TABLE `booking_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`driver_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`current_status` text DEFAULT 'assigned' NOT NULL,
	`assigned_by` text NOT NULL,
	`assigned_at` text NOT NULL,
	`token_expires_at` text NOT NULL,
	`revoked_at` text,
	`completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_assignments_token_hash_unique` ON `booking_assignments` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_assignments_booking_active` ON `booking_assignments` (`booking_reference`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `idx_assignments_driver_status` ON `booking_assignments` (`driver_id`,`current_status`);--> statement-breakpoint
CREATE TABLE `driver_status_events` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`booking_reference` text NOT NULL,
	`status` text NOT NULL,
	`previous_status` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`accuracy_metres` integer,
	`expected_distance_metres` integer,
	`driver_note` text,
	`evidence_key` text,
	`evidence_mime` text,
	`evidence_bytes` integer,
	`evidence_sha256` text,
	`verification_status` text DEFAULT 'pending_review' NOT NULL,
	`verified_by` text,
	`verified_at` text,
	`rejection_reason` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_driver_events_assignment_created` ON `driver_status_events` (`assignment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_driver_events_verification` ON `driver_status_events` (`verification_status`,`created_at`);--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_drivers_status_name` ON `drivers` (`status`,`full_name`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `pickup_latitude` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pickup_longitude` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `dropoff_latitude` real;--> statement-breakpoint
ALTER TABLE `bookings` ADD `dropoff_longitude` real;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `pickup_latitude` real;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `pickup_longitude` real;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `dropoff_latitude` real;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `dropoff_longitude` real;