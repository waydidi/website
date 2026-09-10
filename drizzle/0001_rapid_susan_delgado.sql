ALTER TABLE `bookings` ADD `customer_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `flight_number` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pickup_sign` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `pickup_instructions` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `child_seats` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `oversized_luggage` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `special_requests` text;