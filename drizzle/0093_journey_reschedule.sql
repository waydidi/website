-- Explicit booking reschedules invalidate flight-derived journey date/time overrides.
-- The trigger runs in the booking update transaction, including all admin/chat paths.
CREATE TRIGGER clear_outbound_schedule_override AFTER UPDATE OF pickup_date,pickup_time ON bookings
WHEN OLD.pickup_date IS NOT NEW.pickup_date OR OLD.pickup_time IS NOT NEW.pickup_time
BEGIN
 UPDATE journey_legs SET pickup_date=NULL,pickup_time=NULL,flight_date=NULL,arrival_pickup_offset_minutes=NULL,updated_at=NEW.updated_at WHERE booking_reference=NEW.reference AND leg='outbound';
END;
--> statement-breakpoint
CREATE TRIGGER clear_return_schedule_override AFTER UPDATE OF return_date,return_time ON bookings
WHEN OLD.return_date IS NOT NEW.return_date OR OLD.return_time IS NOT NEW.return_time
BEGIN
 UPDATE journey_legs SET pickup_date=NULL,pickup_time=NULL,flight_date=NULL,arrival_pickup_offset_minutes=NULL,updated_at=NEW.updated_at WHERE booking_reference=NEW.reference AND leg='return';
END;
