import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { hourlyAreaRates } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { hourlyAreaSettings } from "@/lib/hourly-area-pricing";
import { VEHICLE_IDS } from "@/lib/pricing";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function GET() {
  if (!await getWaydidiAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ areas: await hourlyAreaSettings() }, { headers: { "Cache-Control": "no-store" } });
}

// Save one city: its on/off switch and order, and each car's hourly rate.
export async function POST(request: Request) {
  if (!await getWaydidiAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = await request.json().catch(() => null) as { slug?: string; active?: boolean; sortOrder?: number; rates?: Record<string, Record<string, unknown>> } | null;
  if (!input?.slug || !HOURLY_AREAS.some((a) => a.slug === input.slug)) return NextResponse.json({ error: "Unknown area." }, { status: 400 });
  const now = new Date().toISOString();
  const rows: (typeof hourlyAreaRates.$inferInsert)[] = [{ id: `${input.slug}:_area`, areaSlug: input.slug, vehicleId: "_area", active: input.active !== false, sortOrder: Number.isInteger(input.sortOrder) ? input.sortOrder! : 0, updatedAt: now }];
  for (const v of VEHICLE_IDS.filter((id) => id !== "comfort_bmw")) {
    const r = input.rates?.[v];
    if (!r) continue;
    const n = r.hourlyRate;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 20000) return NextResponse.json({ error: "Hourly rates must be positive whole numbers of baht." }, { status: 400 });
    rows.push({ id: `${input.slug}:${v}`, areaSlug: input.slug, vehicleId: v, hourlyRate: n, active: r.active !== false, sortOrder: 0, updatedAt: now });
  }
  const db = getDb();
  const queries = rows.map((row) => db.insert(hourlyAreaRates).values(row).onConflictDoUpdate({ target: hourlyAreaRates.id, set: { ...row, id: undefined } }));
  try { await db.batch([queries[0], ...queries.slice(1)]); }
  catch { return NextResponse.json({ error: "Could not save hourly rates. Please retry." }, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
