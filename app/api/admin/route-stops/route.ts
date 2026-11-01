import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { listRouteStopAttractions, listRouteStopOffers, RouteStopValidationError, saveRouteStopOffer } from "@/lib/route-stops-db";

const headers = { "Cache-Control": "no-store" };
async function denied() {
  const staff = await getWaydidiAdmin();
  if (!staff) return NextResponse.json({ error: "Staff sign-in required." }, { status: 401, headers });
  if (staff.role !== "owner" && staff.role !== "operations") return NextResponse.json({ error: "Only owner and operations staff can manage route stops." }, { status: 403, headers });
  return null;
}

export async function GET() {
  const blocked = await denied();
  if (blocked) return blocked;
  const [offers, attractions] = await Promise.all([listRouteStopOffers(), listRouteStopAttractions()]);
  return NextResponse.json({ offers, attractions }, { headers });
}

export async function POST(request: Request) {
  const blocked = await denied();
  if (blocked) return blocked;
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400, headers }); }
  try {
    const id = await saveRouteStopOffer(body);
    return NextResponse.json({ ok: true, id }, { headers });
  } catch (error) {
    if (error instanceof RouteStopValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers });
    throw error;
  }
}
