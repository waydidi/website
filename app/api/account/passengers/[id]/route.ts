import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerSavedPassengers } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { validateSavedPassenger } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Context = { params: Promise<{ id: string }> };

// Every query is scoped to the signed-in customer's own travellers.
export async function PATCH(request: Request, context: Context) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = validateSavedPassenger((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { id } = await context.params;
  const updated = await getDb().update(customerSavedPassengers).set({ ...result.value, updatedAt: new Date().toISOString() })
    .where(and(eq(customerSavedPassengers.id, id), eq(customerSavedPassengers.customerId, session.customer.id))).returning({ id: customerSavedPassengers.id });
  if (!updated.length) return NextResponse.json({ error: "Traveller not found." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await context.params;
  await getDb().delete(customerSavedPassengers).where(and(eq(customerSavedPassengers.id, id), eq(customerSavedPassengers.customerId, session.customer.id)));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
