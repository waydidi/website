-- Bookings is at D1's column cap: keep immutable purchased stop details separately.
-- The checkout inserts this snapshot and its booking in a single D1 batch.
CREATE TABLE IF NOT EXISTS booking_route_stops (
  booking_reference TEXT PRIMARY KEY REFERENCES bookings(reference),
  route_stops_json TEXT NOT NULL CHECK(json_valid(route_stops_json) AND json_type(route_stops_json)='array')
);
