CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`max_discount` integer,
	`min_fare` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`max_uses` integer,
	`per_customer_limit` integer DEFAULT 1 NOT NULL,
	`first_booking_only` integer DEFAULT false NOT NULL,
	`service` text DEFAULT 'any' NOT NULL,
	`vehicles_json` text,
	`offer_terms_json` text,
	`show_on_homepage` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_codes_code_unique` ON `promo_codes` (`code`);--> statement-breakpoint
CREATE INDEX `idx_promo_codes_status` ON `promo_codes` (`status`);--> statement-breakpoint
CREATE TABLE `promo_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`promo_id` text NOT NULL,
	`code` text NOT NULL,
	`booking_reference` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_id` text,
	`original_total` integer NOT NULL,
	`discount` integer NOT NULL,
	`final_total` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_redemptions_booking_reference_unique` ON `promo_redemptions` (`booking_reference`);--> statement-breakpoint
CREATE INDEX `idx_promo_redemptions_promo` ON `promo_redemptions` (`promo_id`);--> statement-breakpoint
CREATE INDEX `idx_promo_redemptions_email` ON `promo_redemptions` (`customer_email`);--> statement-breakpoint
-- Example codes, as drafts: edit and activate them in Admin → Promotions.
INSERT INTO `promo_codes` (`id`,`code`,`title`,`discount_type`,`discount_value`,`max_discount`,`min_fare`,`starts_at`,`ends_at`,`max_uses`,`per_customer_limit`,`first_booking_only`,`service`,`vehicles_json`,`offer_terms_json`,`show_on_homepage`,`status`,`created_at`,`updated_at`) VALUES ('promo_new','WAYDIDINEW','[New Users] 10% off your first private transfer','percent',10,300,1000,NULL,NULL,NULL,1,1,'transfer',NULL,'["Discount 10% up to THB 300 with a minimum fare of THB 1,000.", "Valid for your first Waydidi booking only (per email, phone and account)."]',1,'draft','2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `promo_codes` (`id`,`code`,`title`,`discount_type`,`discount_value`,`max_discount`,`min_fare`,`starts_at`,`ends_at`,`max_uses`,`per_customer_limit`,`first_booking_only`,`service`,`vehicles_json`,`offer_terms_json`,`show_on_homepage`,`status`,`created_at`,`updated_at`) VALUES ('promo_pattaya','PATTAYA200','THB 200 off Bangkok ⇄ Pattaya transfers','fixed',200,NULL,1200,NULL,NULL,NULL,1,0,'transfer',NULL,'["Discount THB 200 with a minimum fare of THB 1,200."]',1,'draft','2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `promo_codes` (`id`,`code`,`title`,`discount_type`,`discount_value`,`max_discount`,`min_fare`,`starts_at`,`ends_at`,`max_uses`,`per_customer_limit`,`first_booking_only`,`service`,`vehicles_json`,`offer_terms_json`,`show_on_homepage`,`status`,`created_at`,`updated_at`) VALUES ('promo_hourly','HOURLY15','15% off an hourly private driver','percent',15,1000,0,NULL,NULL,NULL,1,0,'hourly',NULL,'["Discount 15% up to THB 1,000.", "Extra hours and extra distance are charged at the normal rate."]',1,'draft','2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
