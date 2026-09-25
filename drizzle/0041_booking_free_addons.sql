CREATE TABLE `booking_free_addons` (
	`booking_reference` text PRIMARY KEY NOT NULL,
	`tier` text NOT NULL,
	`child_seats` integer DEFAULT 0 NOT NULL,
	`exchange_stop` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
