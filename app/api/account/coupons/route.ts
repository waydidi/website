import { NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { listMemberCoupons } from "@/lib/promo-db";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ coupons: [] }, { headers: noStore });
  const { customer } = session;
  const coupons = await listMemberCoupons({ email: customer.email, phone: customer.phone ?? "", customerId: customer.id }).catch(() => []);
  return NextResponse.json({ coupons }, { headers: noStore });
}
