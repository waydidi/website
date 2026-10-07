import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { storefronts } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { settleStoreBookings, storeSlug } from "@/lib/storefront";

const fields = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/).optional(),
  contactName: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  area: z.string().trim().max(80).optional().default(""),
  discountPercent: z.number().min(0).max(50),
  commissionPercent: z.number().min(0).max(50),
  active: z.boolean().optional().default(true),
});

async function guard(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const staff = await getWaydidiAdmin();
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "operations", "finance"].includes(staff.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

// Add a storefront partner.
export async function POST(request: Request) {
  const blocked = await guard(request); if (blocked) return blocked;
  if ((await getWaydidiAdmin())?.role === "finance") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = fields.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Check ${String(parsed.error.issues[0]?.path[0] ?? "the form")}.` }, { status: 400 });
  const f = parsed.data;
  const slug = f.slug || storeSlug(f.name);
  const [taken] = await getDb().select({ id: storefronts.id }).from(storefronts).where(eq(storefronts.slug, slug)).limit(1);
  if (taken) return NextResponse.json({ error: `The link code "${slug}" is already used. Choose another.` }, { status: 409 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await getDb().insert(storefronts).values({ id, slug, name: f.name, contactName: f.contactName || null, phone: f.phone || null, area: f.area || null, discountPercent: f.discountPercent, commissionPercent: f.commissionPercent, active: f.active, createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, id, slug });
}

// Edit a storefront, switch its QR on/off, or mark its commissions settled.
export async function PATCH(request: Request) {
  const blocked = await guard(request); if (blocked) return blocked;
  const input = await request.json().catch(() => null) as { id?: unknown; settle?: unknown } & Record<string, unknown> | null;
  const id = typeof input?.id === "string" ? input.id : "";
  if (!id) return NextResponse.json({ error: "Missing storefront." }, { status: 400 });
  const role = (await getWaydidiAdmin())?.role;
  if (input?.settle === true) {
    if (!["owner", "finance"].includes(role ?? "")) return NextResponse.json({ error: "Settlement requires finance access" }, { status: 403 });
    return NextResponse.json({ ok: true, settled: await settleStoreBookings(id) });
  }
  if (role === "finance") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Status switch in the list: only turns the QR on or off.
  if (input?.toggle === true && typeof input.active === "boolean") {
    await getDb().update(storefronts).set({ active: input.active, updatedAt: new Date().toISOString() }).where(eq(storefronts.id, id));
    return NextResponse.json({ ok: true });
  }
  const parsed = fields.omit({ slug: true }).safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: `Check ${String(parsed.error.issues[0]?.path[0] ?? "the form")}.` }, { status: 400 });
  const f = parsed.data;
  // Rate changes apply to new bookings only; existing ones keep the rate they were booked at.
  await getDb().update(storefronts).set({ name: f.name, contactName: f.contactName || null, phone: f.phone || null, area: f.area || null, discountPercent: f.discountPercent, commissionPercent: f.commissionPercent, active: f.active, updatedAt: new Date().toISOString() }).where(eq(storefronts.id, id));
  return NextResponse.json({ ok: true });
}
