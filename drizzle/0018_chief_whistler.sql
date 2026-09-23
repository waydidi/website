CREATE TABLE `journey_stop_declarations` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`declared_at` text NOT NULL,
	`cleared_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_journey_stop_declarations_assignment_active` ON `journey_stop_declarations` (`assignment_id`,`cleared_at`);--> statement-breakpoint
ALTER TABLE `journey_exceptions` ADD `stop_duration_seconds` integer;--> statement-breakpoint
ALTER TABLE `journey_exceptions` ADD `stop_reason` text;