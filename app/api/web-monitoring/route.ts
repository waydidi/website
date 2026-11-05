import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { requestPermitsFunnel } from "@/lib/booking-funnel";
import { overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { recordWebMonitoring } from "@/lib/web-monitoring-db";
import { WEB_MONITORING_MAX_BODY, webMonitoringEnabled } from "@/lib/web-monitoring-rules";
import { webMonitoringBatchSchema } from "@/lib/web-monitoring-schema";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403, headers });
  if (!webMonitoringEnabled(env) || !requestPermitsFunnel(request)) return new Response(null, { status: 204, headers });
  if (Number(request.headers.get("content-length") ?? 0) > WEB_MONITORING_MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  try {
    const text = await request.text();
    if (text.length > WEB_MONITORING_MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid event" }, { status: 400, headers }); }
    const parsed = webMonitoringBatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400, headers });
    if (await overRateLimit(request, "web-monitoring", 120, 15, env.RATE_LIMIT_SALT)) return NextResponse.json({ error: "Try later" }, { status: 429, headers: { ...headers, "Retry-After": "900" } });
    await recordWebMonitoring(env.DB, parsed.data.events);
    return new Response(null, { status: 204, headers });
  } catch { return NextResponse.json({ error: "Measurement unavailable" }, { status: 503, headers }); }
}
