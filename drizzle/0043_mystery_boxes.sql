CREATE TABLE `member_boxes` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`tier` text NOT NULL,
	`issued_at` text NOT NULL,
	`opened_at` text,
	`prize_id` text,
	`prize_name` text,
	`gift_row_id` text,
	`voucher_code` text,
	`fulfilment` text,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_member_boxes_customer` ON `member_boxes` (`customer_id`);--> statement-breakpoint
CREATE TABLE `member_reward_emails` (
	`dedupe_key` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mystery_prizes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`emoji` text DEFAULT '🎁' NOT NULL,
	`kind` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`weights_json` text DEFAULT '{}' NOT NULL,
	`stock` integer,
	`issued` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`valid_days` integer DEFAULT 90 NOT NULL,
	`terms` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `partner_voucher_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`prize_id` text NOT NULL,
	`code` text NOT NULL,
	`box_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_partner_codes_prize` ON `partner_voucher_codes` (`prize_id`,`box_id`);