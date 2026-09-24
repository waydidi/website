import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { deleteCustomerAccount } from "@/lib/customer-admin";
import { sameOrigin } from "@/lib/security";

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
