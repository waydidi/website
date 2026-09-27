CREATE TABLE IF NOT EXISTS `member_coupons` (
	`customer_id` text NOT NULL,
	`code` text NOT NULL,
	`collected_at` text NOT NULL,
	PRIMARY KEY(`customer_id`, `code`)
);
