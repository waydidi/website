ALTER TABLE booking_payments ADD COLUMN refunded_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE booking_payments ADD COLUMN fee_minor INTEGER;
ALTER TABLE booking_payments ADD COLUMN dispute_status TEXT;
ALTER TABLE booking_assignments ADD COLUMN leg TEXT NOT NULL DEFAULT 'outbound';
UPDATE booking_assignments SET revoked_at = updated_at WHERE revoked_at IS NULL AND EXISTS (SELECT 1 FROM booking_assignments newer WHERE newer.booking_reference = booking_assignments.booking_reference AND newer.revoked_at IS NULL AND (newer.assigned_at > booking_assignments.assigned_at OR (newer.assigned_at = booking_assignments.assigned_at AND newer.id > booking_assignments.id)));
CREATE UNIQUE INDEX uidx_assignment_active_leg ON booking_assignments(booking_reference, leg) WHERE revoked_at IS NULL;
CREATE TABLE journey_legs (id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, leg TEXT NOT NULL CHECK(leg IN ('outbound','return')), status TEXT NOT NULL, pickup_date TEXT, pickup_time TEXT, flight_date TEXT, arrival_pickup_offset_minutes INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX uidx_journey_leg ON journey_legs(booking_reference, leg);
INSERT INTO journey_legs(id,booking_reference,leg,status,pickup_date,pickup_time,created_at,updated_at) SELECT reference || ':outbound', reference, 'outbound', status, NULL, NULL, created_at, updated_at FROM bookings;
INSERT INTO journey_legs(id,booking_reference,leg,status,pickup_date,pickup_time,created_at,updated_at) SELECT reference || ':return', reference, 'return', CASE WHEN status IN ('completed','no_show') AND datetime(return_date || 'T' || return_time || ':00','-7 hours') > datetime('now') THEN 'confirmed' ELSE status END, NULL, NULL, created_at, updated_at FROM bookings WHERE return_date IS NOT NULL AND return_time IS NOT NULL;
UPDATE bookings SET status = 'confirmed' WHERE status IN ('completed','no_show') AND reference IN (SELECT booking_reference FROM journey_legs WHERE leg = 'return' AND status = 'confirmed');

CREATE TABLE cash_receipts(id TEXT PRIMARY KEY, booking_reference TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), collected_by TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);
CREATE INDEX idx_cash_receipts_booking ON cash_receipts(booking_reference);
INSERT INTO cash_receipts SELECT 'legacy:' || reference, reference, amount_paid * 100, 'migration', 'Previously recorded cash', updated_at FROM bookings WHERE payment_method = 'cash' AND amount_paid > 0;
UPDATE booking_payments SET refunded_minor = COALESCE((SELECT refund_amount * 100 FROM bookings WHERE bookings.reference = booking_payments.booking_reference),0) WHERE status IN ('refunded','partially_refunded');
CREATE TABLE journey_costs(id TEXT PRIMARY KEY,booking_reference TEXT NOT NULL,leg TEXT NOT NULL CHECK(leg IN ('outbound','return')),cost_minor INTEGER NOT NULL CHECK(cost_minor>=0),payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','scheduled','paid')),updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX uidx_journey_cost_leg ON journey_costs(booking_reference,leg);
