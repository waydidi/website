import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerSavedPlaces } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { sameOrigin } from "@/lib/security";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { id } = await context.params;
  // Scoped to the signed-in customer, so another customer's place can never be removed.
  await getDb().delete(customerSavedPlaces).where(and(eq(customerSavedPlaces.id, id), eq(customerSavedPlaces.customerId, session.customer.id)));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
