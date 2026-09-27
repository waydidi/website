import { NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { collectCoupon, collectedCodes } from "@/lib/promo-db";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const noStore = { "Cache-Control": "private, no-store" };

// Which homepage codes the signed-in member already collected.
export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ signedIn: false, codes: [] }, { headers: noStore });
  const codes = await collectedCodes(session.customer.id);
  return NextResponse.json({ signedIn: true, codes: codes ? [...codes] : [] }, { headers: noStore });
}

// Collect a homepage promo code into My coupons.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in to collect coupons." }, { status: 401, headers: noStore });
  const input = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof input?.code === "string" ? input.code.slice(0, 40) : "";
  if (!code || !(await collectCoupon(session.customer.id, code))) return NextResponse.json({ error: "This offer has ended." }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
