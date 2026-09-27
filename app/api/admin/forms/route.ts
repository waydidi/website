import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { FORM_LINK_DAYS, formToken } from "@/lib/booking-form";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Admin: list form links, newest first.
export async function GET() {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await getDb().select().from(bookingForms).orderBy(desc(bookingForms.createdAt)).limit(100);
  return NextResponse.json({ forms: rows.map((r) => ({ ...r, answers: r.answers ? JSON.parse(r.answers) : null })) }, { headers: { "Cache-Control": "no-store" } });
}

const createSchema = z.object({ serviceType: z.enum(["transfer", "hourly", "tour"]), note: z.string().trim().max(200).optional().default("") });

// Admin: make a new private form link.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a service." }, { status: 400 });
  const now = new Date();
  const token = formToken();
  await getDb().insert(bookingForms).values({
    token, serviceType: parsed.data.serviceType, note: parsed.data.note || null, status: "waiting",
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + FORM_LINK_DAYS * 86_400_000).toISOString(),
  });
  return NextResponse.json({ token });
}

const updateSchema = z.object({ token: z.string().min(6).max(20), bookingReference: z.string().max(20).optional(), remove: z.boolean().optional() });

// Admin: mark a form as turned into a booking, or delete it.
export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { token, bookingReference, remove } = parsed.data;
  if (remove) await getDb().delete(bookingForms).where(eq(bookingForms.token, token));
  else await getDb().update(bookingForms).set({ status: "booked", bookingReference: bookingReference ?? null }).where(eq(bookingForms.token, token));
  return NextResponse.json({ ok: true });
}
