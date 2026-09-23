CREATE TABLE `payment_provider_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`processing_status` text DEFAULT 'processing' NOT NULL,
	`processing_attempts` integer DEFAULT 1 NOT NULL,
	`failure_code` text,
	`received_at` text NOT NULL,
	`processed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_provider_events_provider_event` ON `payment_provider_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_provider_events_status_received` ON `payment_provider_events` (`processing_status`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_booking_payments_provider_transaction` ON `booking_payments` (`provider`,`provider_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_booking_payments_provider_session` ON `booking_payments` (`provider`,`provider_session_id`);--> statement-breakpoint
DROP INDEX `idx_booking_payments_provider_session`;
