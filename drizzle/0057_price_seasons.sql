CREATE TABLE IF NOT EXISTS `price_seasons` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `starts_on` text NOT NULL,
  `ends_on` text NOT NULL,
  `repeats_yearly` integer DEFAULT 0 NOT NULL,
  `adjustment_type` text DEFAULT 'percent' NOT NULL,
  `adjustment` integer NOT NULL,
  `service` text DEFAULT 'all' NOT NULL,
  `area_ids` text,
  `vehicle_ids` text,
  `reason` text,
  `active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `price_seasons` (`id`,`name`,`starts_on`,`ends_on`,`repeats_yearly`,`adjustment_type`,`adjustment`,`service`,`reason`,`active`,`created_at`,`updated_at`) VALUES
('new-year','New Year','12-24','01-03',1,'percent',20,'all','Peak tourists while many drivers take leave',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('songkran','Songkran','04-11','04-17',1,'percent',25,'all','Drivers travel home to their provinces, very short supply',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('chinese-new-year-2027','Chinese New Year 2027','2027-02-04','2027-02-09',0,'percent',15,'all','Many drivers take time off. Dates move each year',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('peak-season','Peak tourist season','11-01','03-31',1,'percent',5,'all','High-season demand',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('low-season','Low / rainy season','06-01','09-30',1,'percent',0,'all','More drivers free. Set a negative number for a discount',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('coronation-day','Coronation Day long weekend','05-03','05-05',1,'percent',10,'all','Domestic travel surge',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('queen-birthday','Queen Suthida''s Birthday long weekend','06-02','06-04',1,'percent',10,'all','Domestic travel surge',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('king-birthday','King''s Birthday long weekend','07-27','07-29',1,'percent',10,'all','Domestic travel surge',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('mothers-day','Mother''s Day long weekend','08-11','08-13',1,'percent',10,'all','Domestic travel surge',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('chulalongkorn-day','Chulalongkorn Day long weekend','10-22','10-24',1,'percent',10,'all','Domestic travel surge',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z'),
('fathers-day','Father''s Day long weekend','12-04','12-06',1,'percent',10,'all','Domestic travel surge',1,'2026-10-02T00:00:00Z','2026-10-02T00:00:00Z');
