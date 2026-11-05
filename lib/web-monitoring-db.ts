import type { SecurityDatabase } from "./worker-db";
import { WEB_MONITORING_RETENTION_DAYS } from "./web-monitoring-rules";
import type { WebMonitoringEvent } from "./web-monitoring-schema";

// Rows have no visitor, session or IP column, and times are cut to the hour, so they cannot be joined into a visit.
export const webMonitoringDdl = [
  "CREATE TABLE IF NOT EXISTS web_vital_events (id INTEGER PRIMARY KEY AUTOINCREMENT,route TEXT NOT NULL,name TEXT NOT NULL CHECK(name IN ('LCP','INP','CLS','FCP','TTFB')),value INTEGER NOT NULL CHECK(value>=0),device TEXT NOT NULL CHECK(device IN ('mobile','desktop')),connection TEXT NOT NULL,created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS web_vital_events_created ON web_vital_events(created_at)",
  "CREATE TABLE IF NOT EXISTS web_error_events (id INTEGER PRIMARY KEY AUTOINCREMENT,route TEXT NOT NULL,error_type TEXT NOT NULL,file TEXT,line INTEGER,col INTEGER,device TEXT NOT NULL CHECK(device IN ('mobile','desktop')),created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS web_error_events_created ON web_error_events(created_at)",
];
export async function ensureWebMonitoring(db: SecurityDatabase) { await db.batch(webMonitoringDdl.map(sql => db.prepare(sql))); }

const hour = (at: Date) => at.toISOString().slice(0, 13) + ":00:00.000Z";

export async function recordWebMonitoring(db: SecurityDatabase, events: WebMonitoringEvent[], at = new Date()) {
  await ensureWebMonitoring(db);
  const created = hour(at);
  await db.batch(events.map(event => event.kind === "vital"
    ? db.prepare("INSERT INTO web_vital_events(route,name,value,device,connection,created_at) VALUES(?,?,?,?,?,?)").bind(event.route, event.name, event.value, event.device, event.connection, created)
    : db.prepare("INSERT INTO web_error_events(route,error_type,file,line,col,device,created_at) VALUES(?,?,?,?,?,?,?)").bind(event.route, event.errorType, event.file, event.line, event.column, event.device, created)));
}

export async function purgeWebMonitoring(db: SecurityDatabase, at = new Date()) {
  await ensureWebMonitoring(db);
  const cutoff = new Date(at.getTime() - WEB_MONITORING_RETENTION_DAYS * 86400000).toISOString();
  await db.batch(["web_vital_events", "web_error_events"].map(table => db.prepare(`DELETE FROM ${table} WHERE created_at<?`).bind(cutoff)));
}

export async function webMonitoringReport(db: SecurityDatabase, start: string, end: string) {
  await ensureWebMonitoring(db);
  // The 75th percentile is the standard Core Web Vitals summary: rank ceil(0.75 * samples).
  const vitals = await db.prepare(`WITH ranked AS (
      SELECT route,name,device,value,
        ROW_NUMBER() OVER (PARTITION BY route,name,device ORDER BY value) AS position,
        COUNT(*) OVER (PARTITION BY route,name,device) AS samples
      FROM web_vital_events WHERE created_at>=? AND created_at<?)
    SELECT route,name,device,samples,value AS p75 FROM ranked WHERE position=(samples*3+3)/4
    ORDER BY samples DESC,route,name,device LIMIT 200`).bind(start, end).all();
  const errors = await db.prepare(`SELECT route,error_type AS errorType,file,line,col AS "column",device,COUNT(*) AS count,MAX(created_at) AS lastSeen
    FROM web_error_events WHERE created_at>=? AND created_at<?
    GROUP BY route,error_type,file,line,col,device ORDER BY count DESC,lastSeen DESC LIMIT 50`).bind(start, end).all();
  return { vitals: vitals.results, errors: errors.results };
}
