import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { attractions, smartTrips } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { attractionSchema, importStarterPlaces, listAttractions, listSuppliers, markVerified, saveAttraction } from "@/lib/attractions";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const noStore = { "Cache-Control": "no-store" };

// Admin: every attraction (hidden ones too) and the supplier list for the picker.
export async function GET() {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [items, supplierList, trips] = await Promise.all([
    listAttractions({ includeHidden: true }), listSuppliers(),
    getDb().select({ stops: smartTrips.stopsJson }).from(smartTrips),
  ]);
  // How many trips use each attraction: the ones worth keeping accurate.
  const used: Record<string, number> = {};
  for (const t of trips) for (const s of JSON.parse(t.stops) as { attractionId?: string }[]) if (s.attractionId) used[s.attractionId] = (used[s.attractionId] ?? 0) + 1;
  return NextResponse.json({ attractions: items.map((a) => ({ ...a, usedIn: used[a.id] ?? 0 })), suppliers: supplierList }, { headers: noStore });
}

// Admin: add or update an attraction, or mark it verified ({ verify: id }).
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.importStarter === "bangkok") return NextResponse.json({ ok: true, ...(await importStarterPlaces("bangkok")) });
  if (typeof body?.verify === "string") {
    await markVerified(body.verify, admin.displayName || admin.email);
    return NextResponse.json({ ok: true });
  }
  const parsed = attractionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `${issue?.path?.join(" ") || "Details"}: ${issue?.message ?? "check the attraction details."}` }, { status: 400 });
  }
  const ids = parsed.data.programs.map((p) => p.id);
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "Two programs have the same ID." }, { status: 400 });
  const id = await saveAttraction(parsed.data);
  return NextResponse.json({ ok: true, id });
}

// Admin: hide an attraction (kept for trips that already use it).
export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing attraction." }, { status: 400 });
  await getDb().update(attractions).set({ status: "hidden", updatedAt: new Date().toISOString() }).where(eq(attractions.id, id));
  return NextResponse.json({ ok: true });
}
