import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { deleteCustomerAccount, linkBookingToCustomer } from "@/lib/customer-admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Admin-only: permanently delete a member account (bookings are kept).
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { id } = await context.params;
  if (!(await deleteCustomerAccount(id))) return NextResponse.json({ error: "User not found." }, { status: 404 });
  console.info("Admin deleted customer account", { customerId: id, admin: admin.email });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

// Admin-only: add a booking to a member's account (e.g. booked with another email or by phone).
// A booking already in another account is only moved when the admin confirms it (move: true).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { id } = await context.params;
  const input = await request.json().catch(() => ({})) as { reference?: unknown; move?: unknown };
  const reference = typeof input.reference === "string" ? input.reference.trim().toUpperCase().slice(0, 20) : "";
  const result = await linkBookingToCustomer(id, reference, input.move === true, admin.email);
  if (!result.ok) return NextResponse.json(result, { status: result.status, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
