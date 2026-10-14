import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { mayEditLegPrices } from "@/lib/leg-price-rules";
import { saveLegPrices } from "@/lib/leg-prices";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Admin → booking card → Price (round trip): the price to collect for the first trip and for the second trip.
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!mayEditLegPrices(admin.role)) return NextResponse.json({ error: "Only the owner, operations or finance can split the price." }, { status: 403 });
  const { reference } = await context.params;
  const input = await request.json().catch(() => null) as { first?: unknown; second?: unknown } | null;
  if (!input) return NextResponse.json({ error: "Enter both prices." }, { status: 400 });
  const result = await saveLegPrices(reference, { first: input.first, second: input.second }, admin.displayName || admin.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  console.info("Admin split a round trip's price", { reference, admin: admin.email, changed: result.changed });
  return NextResponse.json({ ok: true, changed: result.changed });
}
