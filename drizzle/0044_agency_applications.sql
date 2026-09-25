CREATE TABLE `agency_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`agency_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`country` text NOT NULL,
	`website` text,
	`monthly_transfers` text NOT NULL,
	`message` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text NOT NULL
);
