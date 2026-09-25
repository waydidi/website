CREATE TABLE `booking_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_booking_contacts_ref_email` ON `booking_contacts` (`booking_reference`,`email`);