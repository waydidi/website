ALTER TABLE `bookings` ADD `return_fare_quote_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_pickup` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_dropoff` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_date` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_time` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `outbound_total` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_total` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_distance_meters` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_duration_seconds` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `return_route_polyline` text;--> statement-breakpoint
CREATE INDEX `idx_bookings_return_date_status` ON `bookings` (`return_date`,`status`);