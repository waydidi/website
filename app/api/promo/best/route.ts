import { NextResponse } from "next/server";
import { z } from "zod";
import { customerFromRequest } from "@/lib/customer-auth";
import { bestCoupon } from "@/lib/promo-db";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const schema = z.object({
  total: z.number().int().min(1).max(10_000_000),
  serviceType: z.enum(["transfer", "hourly"]),
  returnTrip: z.boolean().optional(),
  vehicle: z.string().max(40),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
});

// Signed-in members only: the best coupon for this booking, applied automatically
// at checkout. Checkout itself re-checks the code on the server.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ best: null });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ best: null }, { status: 400 });
  const { email, phone, ...trip } = parsed.data;
  const best = await bestCoupon({ ...trip, email: email || session.customer.email, phone: phone || session.customer.phone || "", customerId: session.customer.id }).catch(() => null);
  return NextResponse.json({ best }, { headers: { "Cache-Control": "private, no-store" } });
}
