import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { smartTrips, tripPackages } from "@/db/schema";
import { listPackages, packageSchema, savePackage } from "@/lib/packages";
import { destinations } from "@/lib/public-content";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { suggestedTransport } from "@/lib/smart-trips";
import { adminActor } from "@/lib/trip-api";

// Admin: packages, the templates they can be built from, and the city pages they can sell on.
export async function GET() {
  if (!(await adminActor())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [packages, templates] = await Promise.all([
    listPackages(),
    getDb().select({ id: smartTrips.id, name: smartTrips.templateName, title: smartTrips.title, hours: smartTrips.durationHours, startTime: smartTrips.startTime, pickup: smartTrips.pickupText, stops: smartTrips.stopsJson, feesTotal: smartTrips.feesTotal })
      .from(smartTrips).where(and(eq(smartTrips.isTemplate, true))),
  ]);
  const withSuggestions = await Promise.all(templates.map(async (t) => {
    const prices: Record<string, number> = {};
    for (const v of ["economy_sedan", "comfort_suv", "premium_minivan"]) { const s = await suggestedTransport(t.pickup || "Bangkok", t.hours, v).catch(() => null); if (s) prices[v] = s.total; }
    return { id: t.id, name: t.name || t.title, hours: t.hours, startTime: t.startTime, stops: (JSON.parse(t.stops) as unknown[]).length, feesTotal: t.feesTotal, suggested: prices };
  }));
  return NextResponse.json({ packages, templates: withSuggestions, cities: destinations.map((d) => ({ slug: d.slug, name: d.name })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await adminActor())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = packageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) { const i = parsed.error.issues[0]; return NextResponse.json({ error: `${i?.path?.join(" ") || "Package"}: ${i?.message}` }, { status: 400 }); }
  const [clash] = await getDb().select({ id: tripPackages.id }).from(tripPackages).where(eq(tripPackages.slug, parsed.data.slug)).limit(1);
  if (clash && clash.id !== parsed.data.id) return NextResponse.json({ error: "Another package already uses this web address." }, { status: 409 });
  const [tpl] = await getDb().select({ isTemplate: smartTrips.isTemplate }).from(smartTrips).where(eq(smartTrips.id, parsed.data.templateId)).limit(1);
  if (!tpl?.isTemplate) return NextResponse.json({ error: "Choose a Quick quote template to build the package from." }, { status: 400 });
  if (parsed.data.published && !Object.values(parsed.data.prices).some((n) => n > 0)) return NextResponse.json({ error: "Set a price for at least one car before publishing." }, { status: 400 });
  return NextResponse.json({ ok: true, id: await savePackage(parsed.data) });
}
