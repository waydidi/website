import { env } from "cloudflare:workers";
import type { SensitiveKind } from "@/lib/sensitive-access-rules";

// Append-only log of every full bank account number or tax ID shown to staff (Reveal) or exported (CSV).
// The values themselves are never logged. Workers Builds does not apply migrations, so the table is
// also created on first use (drizzle/0118_sensitive_access_log.sql).
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { run: () => Promise<unknown> } }; batch: (s: unknown[]) => Promise<unknown> };
const db = () => env.DB as unknown as Db;
let ready: Promise<unknown> | null = null;
function ensureTable() {
  return (ready ??= db().batch([
    db().prepare("CREATE TABLE IF NOT EXISTS sensitive_access_log (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL, staff_role TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, records INTEGER NOT NULL DEFAULT 1, at TEXT NOT NULL)").bind(),
    db().prepare("CREATE INDEX IF NOT EXISTS idx_sensitive_access_log_at ON sensitive_access_log(at)").bind(),
  ]).catch((error) => { ready = null; throw error; }));
}

/** Records an access. Throws if it can't be recorded, so nothing is shown without a log entry. */
export async function logSensitiveAccess(staff: { id: string; role: string }, kind: SensitiveKind, recordId: string, records = 1) {
  await ensureTable();
  await db().prepare("INSERT INTO sensitive_access_log(id,staff_id,staff_role,kind,record_id,records,at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), staff.id, staff.role, kind, recordId, records, new Date().toISOString()).run();
}
