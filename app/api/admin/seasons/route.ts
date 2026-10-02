import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { priceSeasons, pricingAreas } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const day = z.string().regex(/^(\d{4}-)?\d{2}-\d{2}$/);
const seasonSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,60}$/).optional(),
  name: z.string().trim().min(2).max(80),
  startsOn: day, endsOn: day,
  repeatsYearly: z.boolean(),
  adjustmentType: z.enum(["percent", "fixed"]),
  adjustment: z.number().int().min(-90).max(100_000),
  service: z.enum(["all", "transfer", "hourly"]),
  areaIds: z.array(z.string().max(60)).max(50).nullable().default(null),
  reason: z.string().trim().max(200).optional().default(""),
  active: z.boolean(),
}).superRefine((s, ctx) => {
  const yearly = /^\d{2}-\d{2}$/;
  if (s.repeatsYearly ? !(yearly.test(s.startsOn) && yearly.test(s.endsOn)) : (yearly.test(s.startsOn) || yearly.test(s.endsOn))) ctx.addIssue({ code: "custom", path: ["startsOn"], message: "Use MM-DD for yearly seasons and YYYY-MM-DD for one-off dates." });
  if (!s.repeatsYearly && s.endsOn < s.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date is before the start date." });
});

// Admin: seasonal price adjustments.
export async function GET() {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [seasons, areas] = await Promise.all([
    getDb().select().from(priceSeasons).orderBy(desc(priceSeasons.active), priceSeasons.startsOn),
    getDb().select({ id: pricingAreas.id, name: pricingAreas.name }).from(pricingAreas),
  ]);
  return NextResponse.json({ seasons, areas }, { headers: { "Cache-Control": "no-store" } });
}

// Admin: add or update a season.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = seasonSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the season details." }, { status: 400 });
  const s = parsed.data, now = new Date().toISOString();
  const values = { name: s.name, startsOn: s.startsOn, endsOn: s.endsOn, repeatsYearly: s.repeatsYearly, adjustmentType: s.adjustmentType, adjustment: s.adjustment, service: s.service,
    areaIds: s.areaIds?.length ? JSON.stringify(s.areaIds) : null, reason: s.reason || null, active: s.active, updatedAt: now };
  if (s.id) await getDb().update(priceSeasons).set(values).where(eq(priceSeasons.id, s.id));
  else await getDb().insert(priceSeasons).values({ ...values, id: `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "season"}-${crypto.randomUUID().slice(0, 6)}`, createdAt: now });
  return NextResponse.json({ ok: true });
}

// Admin: delete a season.
export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing season." }, { status: 400 });
  await getDb().delete(priceSeasons).where(eq(priceSeasons.id, id));
  return NextResponse.json({ ok: true });
}
