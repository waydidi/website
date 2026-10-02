CREATE TABLE IF NOT EXISTS `booking_refunds` (
  `id` text PRIMARY KEY NOT NULL,
  `booking_reference` text NOT NULL,
  `payment_id` text,
  `provider` text NOT NULL,
  `provider_transaction_id` text,
  `provider_refund_id` text,
  `provider_status` text,
  `idempotency_key` text NOT NULL,
  `reason` text NOT NULL,
  `note` text,
  `policy_version` text NOT NULL,
  `cancellation_requested_at` text NOT NULL,
  `notice_hours` real NOT NULL,
  `refund_percent` integer NOT NULL,
  `original_minor` integer NOT NULL,
  `customer_refund_minor` integer NOT NULL,
  `provider_refund_fee_minor` integer DEFAULT 0 NOT NULL,
  `currency` text DEFAULT 'thb' NOT NULL,
  `status` text NOT NULL,
  `failure_message` text,
  `requested_by` text NOT NULL,
  `approved_by` text,
  `approved_at` text,
  `completed_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uidx_booking_refunds_idempotency` ON `booking_refunds` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_booking_refunds_booking` ON `booking_refunds` (`booking_reference`);
