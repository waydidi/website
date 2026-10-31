-- Optional paid route stops. New offers are inactive until staff review them.
CREATE TABLE IF NOT EXISTS route_stop_offers (
  id TEXT PRIMARY KEY,
  attraction_id TEXT NOT NULL REFERENCES attractions(id),
  origin_zone_json TEXT NOT NULL,
  destination_zone_json TEXT NOT NULL,
  bidirectional INTEGER NOT NULL DEFAULT 1 CHECK(bidirectional IN (0,1)),
  price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor BETWEEN 0 AND 100000000),
  duration_minutes INTEGER NOT NULL CHECK(typeof(duration_minutes)='integer' AND duration_minutes BETWEEN 1 AND 480),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  sort INTEGER NOT NULL DEFAULT 0 CHECK(typeof(sort)='integer' AND sort BETWEEN 0 AND 1000000)
);
CREATE INDEX IF NOT EXISTS route_stop_offers_active_sort ON route_stop_offers(active,sort,id);
-- First-use bootstrap seeds inactive suggestions only when matching attractions exist.
