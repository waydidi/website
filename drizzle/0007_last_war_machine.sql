CREATE TABLE `booking_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text,
	`notification_type` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`recipient` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`sent_at` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_notifications_dedupe_key_unique` ON `booking_notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_booking_notifications_due` ON `booking_notifications` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `idx_booking_notifications_reference` ON `booking_notifications` (`booking_reference`,`created_at`);--> statement-breakpoint
CREATE TABLE `operations_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`assignment_id` text,
	`alert_type` text NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`expected_at` text,
	`detected_at` text NOT NULL,
	`acknowledged_at` text,
	`acknowledged_by` text,
	`resolved_at` text,
	`resolution_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_alerts_dedupe_key_unique` ON `operations_alerts` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_operations_alerts_status_detected` ON `operations_alerts` (`status`,`detected_at`);--> statement-breakpoint
CREATE INDEX `idx_operations_alerts_reference` ON `operations_alerts` (`booking_reference`,`created_at`);--> statement-breakpoint
ALTER TABLE `drivers` ADD `email` text;--> statement-breakpoint
ALTER TABLE `drivers` ADD `reminders_enabled` integer DEFAULT true NOT NULL;