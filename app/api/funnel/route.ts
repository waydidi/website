import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { funnelDeleteSchema, funnelEnabled, funnelEventSchema } from "@/lib/booking-funnel-rules";
import { forgetFunnel, recordFunnelEvent } from "@/lib/booking-funnel-db";
import { requestPermitsFunnel } from "@/lib/booking-funnel";
import { overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const headers = { "Cache-Control": "no-store" };
async function receive(request: Request, remove: boolean) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403, headers });
  // Withdrawal remains available after collection has been disabled.
  if (typeof env.RATE_LIMIT_SALT !== "string" || env.RATE_LIMIT_SALT.length < 32) return new Response(null, { status: remove ? 503 : 204, headers });
  if (!remove && (!funnelEnabled(env) || !requestPermitsFunnel(request))) return new Response(null, { status: 204, headers });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  try {
    const text = await request.text();
    if (text.length > 1024) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid event" }, { status: 400, headers }); }
    const parsed = remove ? funnelDeleteSchema.safeParse(body) : funnelEventSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400, headers });
    if (await overRateLimit(request, "booking-funnel", 120, 15, env.RATE_LIMIT_SALT)) return NextResponse.json({ error: "Try later" }, { status: 429, headers: { ...headers, "Retry-After": "900" } });
    if (remove) await forgetFunnel(env.DB, env.RATE_LIMIT_SALT, parsed.data.journeyId);
    else await recordFunnelEvent(env.DB, env.RATE_LIMIT_SALT, funnelEventSchema.parse(parsed.data));
    return new Response(null, { status: 204, headers });
  } catch { return NextResponse.json({ error: "Measurement unavailable" }, { status: 503, headers }); }
}
export const POST = (request: Request) => receive(request, false);
export const DELETE = (request: Request) => receive(request, true);
