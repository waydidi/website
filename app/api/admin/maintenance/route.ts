import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<unknown> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const headers = { "Cache-Control": "no-store" };
// Workers Builds doesn't apply migrations (drizzle/0091_site_settings.sql), so the table is created on first use.
const ensureSettings = () => db().prepare("CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT, updated_at TEXT)").run();
// The code tells the Settings card what to say to staff who can't change it, instead of the card disappearing.
const ownerOnly = (signedIn: boolean) => NextResponse.json({ error: "Only the owner can turn maintenance mode on or off.", code: signedIn ? "OWNER_REQUIRED" : "SIGN_IN_REQUIRED" }, { status: 403, headers });

/** Maintenance mode (owner only): visitors see the maintenance page, staff still see the site. */
export async function GET() {
  const staff = await getWaydidiAdmin();
  if (staff?.role !== "owner") return ownerOnly(Boolean(staff));
  await ensureSettings();
  const row = await db().prepare("SELECT value,updated_by,updated_at FROM site_settings WHERE key='maintenance'").first<{ value: string; updated_by: string | null; updated_at: string | null }>();
  return NextResponse.json({ on: row?.value === "on", updatedBy: row?.updated_by ?? null, updatedAt: row?.updated_at ?? null }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403, headers });
  const staff = await getWaydidiAdmin();
  if (staff?.role !== "owner") return ownerOnly(Boolean(staff));
  const body = await request.json().catch(() => null) as { on?: boolean } | null;
  if (typeof body?.on !== "boolean") return NextResponse.json({ error: "Choose on or off." }, { status: 400, headers });
  await ensureSettings();
  const updatedAt = new Date().toISOString();
  await db().prepare("INSERT INTO site_settings(key,value,updated_by,updated_at) VALUES('maintenance',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
    .bind(body.on ? "on" : "off", staff.displayName, updatedAt).run();
  return NextResponse.json({ on: body.on, updatedBy: staff.displayName, updatedAt }, { headers });
}
