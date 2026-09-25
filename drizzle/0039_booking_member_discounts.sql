CREATE TABLE `booking_member_discounts` (
	`booking_reference` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`tier` text NOT NULL,
	`percent` integer NOT NULL,
	`discount` integer NOT NULL,
	`created_at` text NOT NULL
);
