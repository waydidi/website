import { env } from "cloudflare:workers";
import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkoutAttempts } from "@/db/schema";
import { lookupFlight } from "@/lib/aviationstack";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const body = await request.json().catch(() => null) as { flightNumber?: string; flightDate?: string } | null;
  if (!body?.flightNumber || !body.flightDate) return NextResponse.json({ error: "Enter a flight number and departure date." }, { status: 400 });
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const fingerprint = await sha256(`flight:${env.RATE_LIMIT_SALT ?? "waydidi"}:${address}`);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(checkoutAttempts).where(and(eq(checkoutAttempts.fingerprintHash, fingerprint), gt(checkoutAttempts.createdAt, since)));
  if (attempts >= 20) return NextResponse.json({ error: "Too many flight checks. Please try again later." }, { status: 429 });
  await getDb().insert(checkoutAttempts).values({ fingerprintHash: fingerprint, createdAt: new Date().toISOString() });
  try {
    return NextResponse.json(await lookupFlight(body.flightNumber, body.flightDate));
  } catch (error) {
    const code = error instanceof Error ? error.message : "FLIGHT_API_UNAVAILABLE";
    const messages: Record<string, string> = {
      INVALID_FLIGHT: "Check the flight number and date.", FLIGHT_NOT_FOUND: "We could not find that flight for the selected date.",
      FLIGHT_API_LIMIT: "Flight status checks are temporarily unavailable. Your booking can still continue.",
      FLIGHT_API_NOT_CONFIGURED: "Flight status checking is not configured yet. Your booking can still continue.",
      FLIGHT_API_UNAVAILABLE: "Flight status is unavailable right now. Your booking can still continue.",
    };
    return NextResponse.json({ error: messages[code] ?? messages.FLIGHT_API_UNAVAILABLE, code }, { status: code === "FLIGHT_NOT_FOUND" || code === "INVALID_FLIGHT" ? 404 : 503 });
  }
}

