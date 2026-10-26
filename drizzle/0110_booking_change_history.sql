CREATE TABLE IF NOT EXISTS booking_change_history (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL REFERENCES booking_change_requests(id),
 booking_reference TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('submitted','approved','declined','expired')),
 original_minor INTEGER NOT NULL,
 revised_minor INTEGER NOT NULL,
 difference_minor INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_change_history_booking ON booking_change_history(booking_reference,created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS booking_change_history_no_update BEFORE UPDATE ON booking_change_history BEGIN SELECT RAISE(ABORT,'Journey change history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS booking_change_history_no_delete BEFORE DELETE ON booking_change_history BEGIN SELECT RAISE(ABORT,'Journey change history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS booking_change_submitted AFTER INSERT ON booking_change_requests BEGIN
 INSERT OR IGNORE INTO booking_change_history(id,request_id,booking_reference,status,original_minor,revised_minor,difference_minor,created_at)
 VALUES(NEW.id || ':submitted',NEW.id,NEW.booking_reference,'submitted',CAST(round(NEW.original_total*100) AS INTEGER),CAST(round(NEW.revised_total*100) AS INTEGER),CAST(round(NEW.revised_total*100) AS INTEGER)-CAST(round(NEW.original_total*100) AS INTEGER),NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS booking_change_decided AFTER UPDATE OF status ON booking_change_requests WHEN NEW.status IN ('approved','declined','expired') AND NEW.status!=OLD.status BEGIN
 INSERT OR IGNORE INTO booking_change_history(id,request_id,booking_reference,status,original_minor,revised_minor,difference_minor,created_at)
 VALUES(NEW.id || ':' || NEW.status,NEW.id,NEW.booking_reference,NEW.status,CAST(round(NEW.original_total*100) AS INTEGER),CAST(round(NEW.revised_total*100) AS INTEGER),CAST(round(NEW.revised_total*100) AS INTEGER)-CAST(round(NEW.original_total*100) AS INTEGER),COALESCE(NEW.resolved_at,NEW.created_at));
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_change_history_bootstrap (id INTEGER PRIMARY KEY CHECK(id=1));
--> statement-breakpoint
INSERT OR IGNORE INTO booking_change_history(id,request_id,booking_reference,status,original_minor,revised_minor,difference_minor,created_at)
 SELECT id || ':submitted',id,booking_reference,'submitted',CAST(round(original_total*100) AS INTEGER),CAST(round(revised_total*100) AS INTEGER),CAST(round(revised_total*100) AS INTEGER)-CAST(round(original_total*100) AS INTEGER),created_at FROM booking_change_requests WHERE NOT EXISTS(SELECT 1 FROM booking_change_history_bootstrap WHERE id=1);
--> statement-breakpoint
INSERT OR IGNORE INTO booking_change_history(id,request_id,booking_reference,status,original_minor,revised_minor,difference_minor,created_at)
 SELECT id || ':' || status,id,booking_reference,status,CAST(round(original_total*100) AS INTEGER),CAST(round(revised_total*100) AS INTEGER),CAST(round(revised_total*100) AS INTEGER)-CAST(round(original_total*100) AS INTEGER),COALESCE(resolved_at,created_at) FROM booking_change_requests WHERE status IN ('approved','declined','expired') AND NOT EXISTS(SELECT 1 FROM booking_change_history_bootstrap WHERE id=1);
--> statement-breakpoint
INSERT OR IGNORE INTO booking_change_history_bootstrap(id) VALUES(1);
