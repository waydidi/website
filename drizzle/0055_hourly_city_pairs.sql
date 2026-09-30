CREATE TABLE `hourly_city_pair_rates` (
  `id` text PRIMARY KEY NOT NULL,
  `pair_id` text NOT NULL,
  `vehicle_id` text NOT NULL,
  `c6` integer NOT NULL DEFAULT 0,
  `c7` integer NOT NULL DEFAULT 0,
  `c8` integer NOT NULL DEFAULT 0,
  `c9` integer NOT NULL DEFAULT 0,
  `c10` integer NOT NULL DEFAULT 0,
  `extra_hour_rate` integer NOT NULL DEFAULT 0,
  `max_driving_minutes` integer NOT NULL DEFAULT 360,
  `active` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL,
  UNIQUE (`pair_id`, `vehicle_id`)
);
--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `city_pair_id` text;
--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `pricing_area_slug` text;
--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `route_distance_meters` integer;
--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `route_duration_seconds` integer;
--> statement-breakpoint
ALTER TABLE `hourly_quotes` ADD `route_polyline` text;
--> statement-breakpoint
-- Apply the confirmed sedan local 6-hour rate. Other saved local rates remain.
UPDATE `hourly_area_rates` SET `p6` = 1800, `updated_at` = CURRENT_TIMESTAMP WHERE `vehicle_id` = 'economy_sedan';
--> statement-breakpoint
CREATE TABLE `hourly_overtime_charges` (
  `booking_reference` text PRIMARY KEY NOT NULL REFERENCES `bookings`(`reference`),
  `extra_minutes` integer NOT NULL CHECK (`extra_minutes` >= 0),
  `charged_hours` integer NOT NULL CHECK (`charged_hours` >= 0),
  `hourly_rate` integer NOT NULL CHECK (`hourly_rate` >= 0),
  `amount_minor` integer NOT NULL CHECK (`amount_minor` >= 0),
  `assessed_by` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hourly_overtime_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `booking_reference` text NOT NULL REFERENCES `hourly_overtime_charges`(`booking_reference`),
  `amount_minor` integer NOT NULL CHECK (`amount_minor` > 0),
  `collected_by` text NOT NULL,
  `created_at` text NOT NULL
);
