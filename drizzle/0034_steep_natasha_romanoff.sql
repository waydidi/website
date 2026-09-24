CREATE TABLE `customer_billing_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text NOT NULL,
	`branch` text NOT NULL,
	`address` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_customer_billing_customer` ON `customer_billing_profiles` (`customer_id`);