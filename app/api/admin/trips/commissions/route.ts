import { NextResponse } from "next/server";
import { z } from "zod";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { adminActor } from "@/lib/trip-api";
import { commissionReport, markCommissionPaid } from "@/lib/trip-commissions";

export async function GET() {
  if (!(await adminActor())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ agencies: await commissionReport() }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({ tripIds: z.array(z.string().max(60)).min(1).max(500), paid: z.boolean() });
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await adminActor())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose trips." }, { status: 400 });
  return NextResponse.json({ ok: true, updated: await markCommissionPaid(parsed.data.tripIds, parsed.data.paid) });
}
