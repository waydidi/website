import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerBookingLinks, customerLoginCodes, customerSavedPassengers, customerSavedPlaces, customers, customerSessions } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { accountCookie } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Deletes the account itself. Booking records are kept (unlinked) because
// they are needed for accounting, disputes and legal duties, as the privacy
// notice explains.
export async function DELETE(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const input = (await request.json().catch(() => ({}))) as { confirm?: unknown };
  if (input.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  const { customer } = session;
  await getDb().delete(customerBookingLinks).where(eq(customerBookingLinks.customerId, customer.id));
  await getDb().delete(customerSavedPlaces).where(eq(customerSavedPlaces.customerId, customer.id));
  await getDb().delete(customerSavedPassengers).where(eq(customerSavedPassengers.customerId, customer.id));
  await getDb().delete(customerSessions).where(eq(customerSessions.customerId, customer.id));
  await getDb().delete(customerLoginCodes).where(eq(customerLoginCodes.email, customer.email));
  await getDb().delete(customers).where(eq(customers.id, customer.id));
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": accountCookie("", 0), "Cache-Control": "no-store" } });
}
