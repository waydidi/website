ALTER TABLE `bookings` ADD `checkout_attempt_hash` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `checkout_payload_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_checkout_attempt` ON `bookings` (`checkout_attempt_hash`);