CREATE TABLE `driver_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`driver_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`availability_type` text DEFAULT 'unavailable' NOT NULL,
	`reason` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_driver_availability_driver_start` ON `driver_availability` (`driver_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_driver_availability_range` ON `driver_availability` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `operations_calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text DEFAULT 'operations_note' NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`driver_id` text,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operations_calendar_events_range` ON `operations_calendar_events` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `idx_operations_calendar_events_driver` ON `operations_calendar_events` (`driver_id`,`starts_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `preparation_buffer_minutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `post_trip_buffer_minutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `attention_status` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `attention_reason` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `internal_notes` text;--> statement-breakpoint
CREATE INDEX `idx_bookings_pickup_date_status` ON `bookings` (`pickup_date`,`status`);