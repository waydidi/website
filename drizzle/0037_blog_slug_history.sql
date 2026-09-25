CREATE TABLE `blog_slug_history` (
	`old_slug` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`created_at` text NOT NULL
);
