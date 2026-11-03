-- Who viewed or exported a full bank account number or tax ID (lib/sensitive-access.ts). Append-only.
CREATE TABLE IF NOT EXISTS sensitive_access_log (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  staff_role TEXT NOT NULL,
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  records INTEGER NOT NULL DEFAULT 1,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sensitive_access_log_at ON sensitive_access_log(at);
