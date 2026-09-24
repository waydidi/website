CREATE TABLE `route_inclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`origin_zone_json` text NOT NULL,
	`destination_zone_json` text NOT NULL,
	`bidirectional` integer DEFAULT true NOT NULL,
	`includes_tolls` integer DEFAULT true NOT NULL,
	`includes_ferry` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_route_inclusions_active` ON `route_inclusions` (`active`,`priority`);--> statement-breakpoint
-- Starting rules: Bangkok (city, Nonthaburi, Samut Prakan, both airports) to the
-- eastern destinations, both directions. Zones are approximate boxes; refine later.
INSERT INTO `route_inclusions` (`id`,`name`,`origin_zone_json`,`destination_zone_json`,`bidirectional`,`includes_tolls`,`includes_ferry`,`active`,`priority`,`created_at`,`updated_at`) VALUES ('ri_bkk_pattaya','Bangkok ⇄ Pattaya','[[{"lat":13.45,"lng":100.25},{"lat":13.45,"lng":100.97},{"lat":14.05,"lng":100.97},{"lat":14.05,"lng":100.25}]]','[[{"lat":12.62,"lng":100.82},{"lat":12.62,"lng":101.0},{"lat":13.02,"lng":101.0},{"lat":13.02,"lng":100.82}]]',1,1,0,1,50,'2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `route_inclusions` (`id`,`name`,`origin_zone_json`,`destination_zone_json`,`bidirectional`,`includes_tolls`,`includes_ferry`,`active`,`priority`,`created_at`,`updated_at`) VALUES ('ri_bkk_rayong','Bangkok ⇄ Rayong','[[{"lat":13.45,"lng":100.25},{"lat":13.45,"lng":100.97},{"lat":14.05,"lng":100.97},{"lat":14.05,"lng":100.25}]]','[[{"lat":12.5,"lng":101.0},{"lat":12.5,"lng":101.8},{"lat":13.1,"lng":101.8},{"lat":13.1,"lng":101.0}]]',1,1,0,1,50,'2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `route_inclusions` (`id`,`name`,`origin_zone_json`,`destination_zone_json`,`bidirectional`,`includes_tolls`,`includes_ferry`,`active`,`priority`,`created_at`,`updated_at`) VALUES ('ri_bkk_chanthaburi','Bangkok ⇄ Chanthaburi','[[{"lat":13.45,"lng":100.25},{"lat":13.45,"lng":100.97},{"lat":14.05,"lng":100.97},{"lat":14.05,"lng":100.25}]]','[[{"lat":12.25,"lng":101.8},{"lat":12.25,"lng":102.45},{"lat":13.3,"lng":102.45},{"lat":13.3,"lng":101.8}]]',1,1,0,1,50,'2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `route_inclusions` (`id`,`name`,`origin_zone_json`,`destination_zone_json`,`bidirectional`,`includes_tolls`,`includes_ferry`,`active`,`priority`,`created_at`,`updated_at`) VALUES ('ri_bkk_trat','Bangkok ⇄ Trat, Koh Chang, Koh Kood, Koh Mak','[[{"lat":13.45,"lng":100.25},{"lat":13.45,"lng":100.97},{"lat":14.05,"lng":100.97},{"lat":14.05,"lng":100.25}]]','[[{"lat":11.55,"lng":102.2},{"lat":11.55,"lng":102.95},{"lat":12.7,"lng":102.95},{"lat":12.7,"lng":102.2}]]',1,1,1,1,50,'2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `route_inclusions` (`id`,`name`,`origin_zone_json`,`destination_zone_json`,`bidirectional`,`includes_tolls`,`includes_ferry`,`active`,`priority`,`created_at`,`updated_at`) VALUES ('ri_bkk_chachoengsao','Bangkok ⇄ Chachoengsao','[[{"lat":13.45,"lng":100.25},{"lat":13.45,"lng":100.97},{"lat":14.05,"lng":100.97},{"lat":14.05,"lng":100.25}]]','[[{"lat":13.25,"lng":100.97},{"lat":13.25,"lng":101.95},{"lat":14.05,"lng":101.95},{"lat":14.05,"lng":100.97}]]',1,1,0,1,50,'2026-09-24T00:00:00.000Z','2026-09-24T00:00:00.000Z');
