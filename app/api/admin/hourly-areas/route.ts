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

const PRICE_KEYS = ["hourlyRate", "p4", "p5", "p6", "p8", "p10"] as const;

// Save one city: its on/off switch and order, and each car's prices.
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
    const nums = PRICE_KEYS.map((k) => r[k]);
    if (nums.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 200000)) return NextResponse.json({ error: "Prices must be positive whole numbers of baht." }, { status: 400 });
    rows.push({ id: `${input.slug}:${v}`, areaSlug: input.slug, vehicleId: v, hourlyRate: r.hourlyRate as number, p4: r.p4 as number, p5: r.p5 as number, p6: r.p6 as number, p8: r.p8 as number, p10: r.p10 as number, c6: r.c6 as number, c7: r.c7 as number, c8: r.c8 as number, c9: r.c9 as number, c10: r.c10 as number, active: r.active !== false, sortOrder: 0, updatedAt: now });
  }
  const db = getDb();
  const queries = rows.map((row) => db.insert(hourlyAreaRates).values(row).onConflictDoUpdate({ target: hourlyAreaRates.id, set: { ...row, id: undefined } }));
  try { await db.batch([queries[0], ...queries.slice(1)]); }
  catch { return NextResponse.json({ error: "Could not save hourly rates. Please retry." }, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
