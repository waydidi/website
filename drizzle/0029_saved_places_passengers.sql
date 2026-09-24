CREATE TABLE `customer_saved_passengers` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`surname` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_saved_passengers_customer` ON `customer_saved_passengers` (`customer_id`);--> statement-breakpoint
CREATE TABLE `customer_saved_places` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`label` text NOT NULL,
	`place_id` text NOT NULL,
	`address` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_saved_places_customer` ON `customer_saved_places` (`customer_id`);