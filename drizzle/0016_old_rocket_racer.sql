CREATE TABLE `journey_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`accuracy_metres` integer NOT NULL,
	`client_timestamp` text NOT NULL,
	`server_timestamp` text NOT NULL,
	`sequence_number` integer NOT NULL,
	`quality` text DEFAULT 'good' NOT NULL,
	`purge_after` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_journey_locations_assignment_sequence` ON `journey_locations` (`assignment_id`,`sequence_number`);--> statement-breakpoint
CREATE INDEX `idx_journey_locations_assignment_server` ON `journey_locations` (`assignment_id`,`server_timestamp`);--> statement-breakpoint
CREATE INDEX `idx_journey_locations_purge` ON `journey_locations` (`purge_after`);