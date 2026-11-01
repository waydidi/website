import { sha256 } from "../security";
import type { SecurityDatabase } from "../worker-db";
/** Shared security windows, hashed IP only. Atomic capped increments fail closed. */
export async function allowMcp(db: SecurityDatabase, salt: string, ip: string, bucket: "request" | "quote", now = Date.now()) {
  if (!salt) return false;
  await db.prepare("CREATE TABLE IF NOT EXISTS security_rate_windows (fingerprint TEXT NOT NULL, window INTEGER NOT NULL, attempts INTEGER NOT NULL, PRIMARY KEY(fingerprint,window))").run();
  const fingerprint = `mcp:${bucket}:${await sha256(`${salt}:${ip}`)}`;
  // Use the same 15-minute window units as the existing security table/cleanup.
  const window = Math.floor(now / 900000);
  const cap = bucket === "quote" ? 5 : 60;
  const row = await db.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 WHERE attempts<? RETURNING attempts").bind(fingerprint, window, cap).first();
  return Boolean(row);
}
