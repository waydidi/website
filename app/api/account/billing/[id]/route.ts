import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerBillingProfiles } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { validateBillingProfile } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

// Every query is scoped to the signed-in customer's own billing profiles.
export async function PATCH(request: Request, context: Context) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = validateBillingProfile((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { id } = await context.params;
  const updated = await getDb().update(customerBillingProfiles).set({ ...result.value, updatedAt: new Date().toISOString() })
    .where(and(eq(customerBillingProfiles.id, id), eq(customerBillingProfiles.customerId, session.customer.id))).returning({ id: customerBillingProfiles.id });
  if (!updated.length) return NextResponse.json({ error: "Billing profile not found." }, { status: 404 });
  return NextResponse.json({ ok: true, profile: { id, ...result.value } }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await context.params;
  await getDb().delete(customerBillingProfiles).where(and(eq(customerBillingProfiles.id, id), eq(customerBillingProfiles.customerId, session.customer.id)));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
