import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { attractions, suppliers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { listSuppliers, saveSupplier, supplierSchema } from "@/lib/attractions";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Admin: supplier contact book, with the attractions linked to each supplier.
export async function GET() {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [list, linked] = await Promise.all([listSuppliers(), getDb().select({ id: attractions.id, name: attractions.name, supplierId: attractions.supplierId }).from(attractions)]);
  return NextResponse.json({ suppliers: list.map((s) => ({ ...s, attractions: linked.filter((a) => a.supplierId === s.id).map(({ id, name }) => ({ id, name })) })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = supplierSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the supplier details." }, { status: 400 });
  return NextResponse.json({ ok: true, id: await saveSupplier(parsed.data) });
}

// Delete a supplier; linked attractions keep working with no supplier.
export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing supplier." }, { status: 400 });
  await getDb().update(attractions).set({ supplierId: null }).where(eq(attractions.supplierId, id));
  await getDb().delete(suppliers).where(eq(suppliers.id, id));
  return NextResponse.json({ ok: true });
}
