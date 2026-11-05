-- Consented page speed and browser error measurements (lib/web-monitoring-db.ts). No visitor identifiers.
CREATE TABLE IF NOT EXISTS web_vital_events (id INTEGER PRIMARY KEY AUTOINCREMENT,route TEXT NOT NULL,name TEXT NOT NULL CHECK(name IN ('LCP','INP','CLS','FCP','TTFB')),value INTEGER NOT NULL CHECK(value>=0),device TEXT NOT NULL CHECK(device IN ('mobile','desktop')),connection TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS web_vital_events_created ON web_vital_events(created_at);
CREATE TABLE IF NOT EXISTS web_error_events (id INTEGER PRIMARY KEY AUTOINCREMENT,route TEXT NOT NULL,error_type TEXT NOT NULL,file TEXT,line INTEGER,col INTEGER,device TEXT NOT NULL CHECK(device IN ('mobile','desktop')),created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS web_error_events_created ON web_error_events(created_at);
