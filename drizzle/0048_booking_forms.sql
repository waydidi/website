CREATE TABLE IF NOT EXISTS `booking_forms` (
	`token` text PRIMARY KEY NOT NULL,
	`service_type` text NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`answers` text,
	`booking_reference` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`submitted_at` text
);
