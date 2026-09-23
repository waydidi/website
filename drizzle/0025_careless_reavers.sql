CREATE TABLE `flight_status_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`flight_number` text NOT NULL,
	`flight_date` text NOT NULL,
	`status` text NOT NULL,
	`airline` text,
	`departure_airport` text,
	`arrival_airport` text,
	`scheduled_arrival` text,
	`estimated_arrival` text,
	`actual_arrival` text,
	`terminal` text,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_flight_cache_lookup` ON `flight_status_cache` (`flight_number`,`flight_date`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_status` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_airline` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_departure_airport` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_arrival_airport` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_scheduled_arrival` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_estimated_arrival` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_last_checked_at` text;