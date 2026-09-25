CREATE TABLE `member_spins` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`prize_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
