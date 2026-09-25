CREATE TABLE `member_gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`gift_id` text NOT NULL,
	`tier` text NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_booking_reference` text,
	`used_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_member_gifts_customer` ON `member_gifts` (`customer_id`);