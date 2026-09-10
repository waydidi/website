CREATE TABLE `booking_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_reference` text NOT NULL,
	`event_type` text NOT NULL,
	`provider_event_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_events_provider_event_id_unique` ON `booking_events` (`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_booking_events_reference` ON `booking_events` (`booking_reference`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`pickup` text NOT NULL,
	`dropoff` text NOT NULL,
	`pickup_date` text NOT NULL,
	`pickup_time` text NOT NULL,
	`passengers` integer NOT NULL,
	`luggage` integer NOT NULL,
	`vehicle` text NOT NULL,
	`payment_method` text NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`checkout_session_id` text,
	`payment_intent_id` text,
	`access_token_hash` text NOT NULL,
	`pdf_key` text,
	`email_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_reference_unique` ON `bookings` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_bookings_email` ON `bookings` (`customer_email`);--> statement-breakpoint
CREATE INDEX `idx_bookings_status` ON `bookings` (`status`);
--> statement-breakpoint
PRAGMA optimize;
