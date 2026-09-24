CREATE TABLE `booking_tax_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_reference` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text NOT NULL,
	`branch` text NOT NULL,
	`address` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_tax_invoices_booking_reference_unique` ON `booking_tax_invoices` (`booking_reference`);