import { NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { spinOnce, spinStatus } from "@/lib/spin";

const noStore = { "Cache-Control": "private, no-store" };

// Wheel status for the signed-in member (signed-out visitors get { signedIn: false }).
export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ signedIn: false }, { headers: noStore });
  const status = await spinStatus(session.customer.id).catch(() => ({ spun: false as const }));
  return NextResponse.json({ signedIn: true, ...status }, { headers: noStore });
}

// Spin once. The prize is chosen here, never in the browser.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Sign in to spin the wheel." }, { status: 401 });
  const result = await spinOnce(session.customer.id);
  return NextResponse.json(result, { headers: noStore });
}
