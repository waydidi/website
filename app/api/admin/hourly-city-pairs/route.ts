import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { hourlyCityPairRates } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { hourlyCityPairSettings } from "@/lib/hourly-city-pricing";
import { APPROVED_HOURLY_PAIRS, HOURLY_VEHICLES, OVERTIME_RATES } from "@/lib/hourly-policy";
import { sameOrigin, isJsonRequest } from "@/lib/security";

const price = z.number().int().min(1).max(200000);
const rate = z.object({ c6: price, c7: price, c8: price, c9: price, c10: price, extraHourRate: price, active: z.boolean() }).strict().refine((r) => r.c6 <= r.c7 && r.c7 <= r.c8 && r.c8 <= r.c9 && r.c9 <= r.c10, "Longer packages must not cost less than shorter packages.");
const inputSchema = z.object({ id: z.string(), name: z.string().optional(), active: z.boolean(), maxDrivingMinutes: z.number().int().min(30).max(600), rates: z.object({ economy_sedan: rate, comfort_suv: rate, premium_minivan: rate }).strict() }).strict();
export async function GET() {
  if (!await getWaydidiAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ pairs: await hourlyCityPairSettings() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Could not load city-pair rates." }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!await getWaydidiAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the prices." }, { status: 400 });
  const p = parsed.data;
  if (!APPROVED_HOURLY_PAIRS.some((a) => a.id === p.id)) return NextResponse.json({ error: "Unknown city pair." }, { status: 400 });
  const now = new Date().toISOString();
  const rows = [{ id: `${p.id}:_pair`, pairId: p.id, vehicleId: "_pair", active: p.active, maxDrivingMinutes: p.maxDrivingMinutes, updatedAt: now },
    ...HOURLY_VEHICLES.map((v) => ({ id: `${p.id}:${v}`, pairId: p.id, vehicleId: v, ...p.rates[v], extraHourRate: OVERTIME_RATES[v], updatedAt: now }))];
  const db = getDb();
  try {
    // D1 batch is transactional: a failed vehicle save cannot leave mixed rates.
    const queries = rows.map((row) => db.insert(hourlyCityPairRates).values(row).onConflictDoUpdate({ target: hourlyCityPairRates.id, set: { ...row, id: undefined } }));
    await db.batch([queries[0], ...queries.slice(1)]);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not save rates. Please retry." }, { status: 503 }); }
}
