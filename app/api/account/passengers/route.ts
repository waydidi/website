import { asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerSavedPassengers } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { MAX_SAVED_PASSENGERS, validateSavedPassenger } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ passengers: [] }, { headers: noStore });
  const passengers = await getDb().select({ id: customerSavedPassengers.id, name: customerSavedPassengers.name, surname: customerSavedPassengers.surname, email: customerSavedPassengers.email, phone: customerSavedPassengers.phone, notes: customerSavedPassengers.notes })
    .from(customerSavedPassengers).where(eq(customerSavedPassengers.customerId, session.customer.id)).orderBy(asc(customerSavedPassengers.createdAt));
  return NextResponse.json({ passengers }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = validateSavedPassenger((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const [{ total }] = await getDb().select({ total: count() }).from(customerSavedPassengers).where(eq(customerSavedPassengers.customerId, session.customer.id));
  if (total >= MAX_SAVED_PASSENGERS) return NextResponse.json({ error: `You can save up to ${MAX_SAVED_PASSENGERS} travellers.` }, { status: 400 });
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await getDb().insert(customerSavedPassengers).values({ id, customerId: session.customer.id, ...result.value, createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, id }, { headers: noStore });
}
