import { asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerSavedPlaces } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { MAX_SAVED_PLACES, validateSavedPlace } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ places: [] }, { headers: noStore });
  const places = await getDb().select({ id: customerSavedPlaces.id, label: customerSavedPlaces.label, placeId: customerSavedPlaces.placeId, address: customerSavedPlaces.address })
    .from(customerSavedPlaces).where(eq(customerSavedPlaces.customerId, session.customer.id)).orderBy(asc(customerSavedPlaces.createdAt));
  return NextResponse.json({ places }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const result = validateSavedPlace((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const [{ total }] = await getDb().select({ total: count() }).from(customerSavedPlaces).where(eq(customerSavedPlaces.customerId, session.customer.id));
  if (total >= MAX_SAVED_PLACES) return NextResponse.json({ error: `You can save up to ${MAX_SAVED_PLACES} places.` }, { status: 400 });
  const id = crypto.randomUUID();
  await getDb().insert(customerSavedPlaces).values({ id, customerId: session.customer.id, ...result.value, createdAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, id }, { headers: noStore });
}
