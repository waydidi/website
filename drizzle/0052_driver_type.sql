ALTER TABLE `drivers` ADD `car_plate` text;--> statement-breakpoint
ALTER TABLE `drivers` ADD `driver_type` text DEFAULT 'staff' NOT NULL;
