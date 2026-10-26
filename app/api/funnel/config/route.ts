import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { funnelEnabled } from "@/lib/booking-funnel-rules";
export async function GET() {
  return NextResponse.json({ enabled: funnelEnabled(env) }, { headers: { "Cache-Control": "no-store" } });
}
