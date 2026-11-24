import { env } from "cloudflare:workers";
import { newRideId, parseRideSearch, rideExpiresAt, type RideSearch } from "@/lib/ride-search-rules";

type Stmt = { run: () => Promise<unknown>; first: <T>() => Promise<T | null> };
type Db = { prepare: (sql: string) => { bind: (...values: unknown[]) => Stmt }; batch: (statements: Stmt[]) => Promise<unknown> };
const db = () => env.DB as unknown as Db;

let ready: Promise<unknown> | null = null;
/** Also in drizzle/0127_ride_searches.sql; Workers Builds does not apply migrations, so it is made on first use. */
const ensureTable = () => (ready ??= db().batch([
  db().prepare("CREATE TABLE IF NOT EXISTS ride_searches (id TEXT PRIMARY KEY, search_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)").bind(),
  db().prepare("CREATE INDEX IF NOT EXISTS idx_ride_searches_expires ON ride_searches(expires_at)").bind(),
]).catch((error: unknown) => { ready = null; throw error; }));

/** Saves a validated search and returns its new ride ID. Expired rides are removed in the same batch. */
export async function saveRideSearch(ride: RideSearch, now = Date.now()) {
  await ensureTable();
  const id = newRideId();
  const at = new Date(now).toISOString();
  await db().batch([
    db().prepare("DELETE FROM ride_searches WHERE expires_at <= ?").bind(at),
    db().prepare("INSERT INTO ride_searches(id, search_json, created_at, expires_at) VALUES(?,?,?,?)").bind(id, JSON.stringify(ride), at, rideExpiresAt(now)),
  ]);
  return id;
}

/** The saved search, or null when the ID is unknown or expired. */
export async function loadRideSearch(id: string, now = Date.now()) {
  await ensureTable();
  const row = await db().prepare("SELECT search_json FROM ride_searches WHERE id = ? AND expires_at > ?").bind(id, new Date(now).toISOString()).first<{ search_json: string }>();
  if (!row) return null;
  try { return parseRideSearch(JSON.parse(row.search_json)); } catch { return null; }
}
