CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`categories_json` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`popular_rank` integer,
	`featured_image` text,
	`cover_json` text DEFAULT '{}' NOT NULL,
	`route_json` text,
	`blocks_json` text DEFAULT '[]' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`author` text DEFAULT 'Waydidi team' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_blog_posts_slug` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_blog_posts_status_published` ON `blog_posts` (`status`,`published_at`);