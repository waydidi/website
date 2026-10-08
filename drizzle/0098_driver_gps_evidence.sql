CREATE TABLE driver_evidence_policy (
 id INTEGER PRIMARY KEY CHECK(id=1), pickup_required INTEGER NOT NULL DEFAULT 0,
 dropoff_required INTEGER NOT NULL DEFAULT 0, gps_required INTEGER NOT NULL DEFAULT 0,
 gps_timeout_ms INTEGER NOT NULL DEFAULT 20000, max_accuracy_m INTEGER NOT NULL DEFAULT 2000,
 retention_days INTEGER NOT NULL DEFAULT 30, updated_by TEXT, updated_at TEXT
);
INSERT INTO driver_evidence_policy(id) VALUES(1);
CREATE TABLE driver_trip_evidence (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES booking_assignments(id),
 booking_reference TEXT NOT NULL, leg TEXT NOT NULL, driver_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('pickup','dropoff')),
 status_event_id TEXT UNIQUE REFERENCES driver_status_events(id),
 device_captured_at TEXT NOT NULL, received_at TEXT NOT NULL, confirmed_at TEXT,
 latitude REAL, longitude REAL, accuracy_metres REAL,
 original_key TEXT NOT NULL, stamped_key TEXT NOT NULL, file_bytes INTEGER NOT NULL,
 expires_at TEXT NOT NULL, deleted_at TEXT,
 UNIQUE(assignment_id,id)
);
CREATE INDEX idx_trip_evidence_assignment ON driver_trip_evidence(assignment_id,received_at);
CREATE INDEX idx_trip_evidence_expiry ON driver_trip_evidence(expires_at,deleted_at);
CREATE TABLE driver_evidence_overrides (
 assignment_id TEXT NOT NULL REFERENCES booking_assignments(id), event_type TEXT NOT NULL,
 reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(assignment_id,event_type)
);
CREATE TABLE driver_evidence_upload_limits (
 assignment_id TEXT PRIMARY KEY, window_start TEXT NOT NULL, attempts INTEGER NOT NULL
);

ALTER TABLE driver_status_events ADD COLUMN trip_evidence_id TEXT REFERENCES driver_trip_evidence(id);
ALTER TABLE driver_status_events ADD COLUMN confirmed_at TEXT;
--> statement-breakpoint
CREATE TRIGGER driver_evidence_transition_guard BEFORE INSERT ON driver_status_events
WHEN NEW.confirmed_at IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM booking_assignments a JOIN bookings b ON b.reference=a.booking_reference WHERE a.id=NEW.assignment_id AND a.revoked_at IS NULL AND a.token_expires_at>NEW.confirmed_at AND b.status='confirmed') THEN RAISE(ABORT,'Assignment no longer active') END;
 SELECT CASE WHEN NEW.trip_evidence_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM driver_trip_evidence e JOIN booking_assignments a ON a.id=e.assignment_id
  WHERE e.id=NEW.trip_evidence_id AND e.assignment_id=NEW.assignment_id AND e.driver_id=a.driver_id AND e.leg=a.leg
  AND e.status_event_id IS NULL AND e.deleted_at IS NULL AND e.expires_at>NEW.confirmed_at
  AND e.event_type=CASE WHEN NEW.status='completed' THEN 'dropoff' ELSE 'pickup' END
 ) THEN RAISE(ABORT,'Evidence does not match assignment or event') END;
 SELECT CASE WHEN NEW.status IN ('standby','trip_started','completed')
  AND NOT EXISTS(SELECT 1 FROM driver_evidence_overrides WHERE assignment_id=NEW.assignment_id AND event_type=CASE WHEN NEW.status='completed' THEN 'dropoff' ELSE 'pickup' END)
  AND EXISTS(SELECT 1 FROM driver_evidence_policy p WHERE id=1 AND
   ((NEW.status='standby' AND p.pickup_required=1) OR (NEW.status='completed' AND p.dropoff_required=1) OR (NEW.trip_evidence_id IS NOT NULL AND p.gps_required=1)))
  AND NOT EXISTS(SELECT 1 FROM driver_trip_evidence e,driver_evidence_policy p WHERE e.id=NEW.trip_evidence_id AND (p.gps_required=0 OR (e.latitude IS NOT NULL AND e.longitude IS NOT NULL AND e.accuracy_metres>0 AND e.accuracy_metres<=p.max_accuracy_m)))
 THEN RAISE(ABORT,'Evidence policy requires a photo with acceptable GPS or an admin override') END;
END;
--> statement-breakpoint
CREATE TRIGGER driver_evidence_transition_link AFTER INSERT ON driver_status_events
WHEN NEW.trip_evidence_id IS NOT NULL
BEGIN
 UPDATE driver_trip_evidence SET status_event_id=NEW.id,confirmed_at=NEW.confirmed_at WHERE id=NEW.trip_evidence_id;
END;
