CREATE TABLE `journey_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text NOT NULL,
	`exception_type` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`distance_metres` integer NOT NULL,
	`corridor_metres` integer NOT NULL,
	`consecutive_points` integer NOT NULL,
	`started_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_journey_exceptions_assignment_status` ON `journey_exceptions` (`assignment_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_journey_exceptions_status_updated` ON `journey_exceptions` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `expected_route_polyline` text;--> statement-breakpoint
ALTER TABLE `fare_quotes` ADD `route_polyline` text;