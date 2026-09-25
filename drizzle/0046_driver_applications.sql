CREATE TABLE `driver_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`applicant_type` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`city` text NOT NULL,
	`vehicle` text NOT NULL,
	`vehicle_year` text,
	`fleet_size` text,
	`languages` text,
	`message` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text NOT NULL
);
