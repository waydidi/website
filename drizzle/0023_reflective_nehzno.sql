CREATE TABLE `booking_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`pickup` text NOT NULL,
	`dropoff` text NOT NULL,
	`pickup_place_id` text NOT NULL,
	`dropoff_place_id` text NOT NULL,
	`pickup_date` text NOT NULL,
	`pickup_time` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`vehicle_name` text NOT NULL,
	`fare_quote_id` text NOT NULL,
	`return_fare_quote_id` text,
	`distance_meters` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`original_total` integer NOT NULL,
	`revised_total` integer NOT NULL,
	`price_difference` integer NOT NULL,
	`reason` text,
	`booking_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_change_requests_booking_created` ON `booking_change_requests` (`booking_reference`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_change_requests_status_created` ON `booking_change_requests` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `customer_surname` text;