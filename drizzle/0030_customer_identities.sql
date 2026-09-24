CREATE TABLE `customer_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`email` text,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_customer_identities_provider_user` ON `customer_identities` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE INDEX `idx_customer_identities_customer` ON `customer_identities` (`customer_id`);