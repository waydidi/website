CREATE TABLE `stored_file_parts` (
	`key` text NOT NULL,
	`part` integer NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`key`, `part`)
);
