import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { countSearch, flightStatus, routeFlights } from "@/lib/aerodatabox";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { cleanFlightNumber } from "@/lib/thai-flights";

const MESSAGES: Record<string, [string, number]> = {
  INVALID: ["Enter a flight number, e.g. TG103, and a date.", 400],
  FLIGHT_NOT_FOUND: ["We couldn't find that flight on this date. Check the number and date.", 404],
  NOT_THAILAND: ["We only show flights within, to or from Thailand.", 404],
  AIRPORT_NOT_FOUND: ["Check the airport codes, e.g. BKK or SIN.", 404],
  SAME_AIRPORT: ["Choose two different airports.", 400],
  RATE: ["Too many searches. Please try again in a few minutes.", 429],
  FLIGHT_API_LIMIT: ["Flight status is busy right now. Please try again later.", 503],
  FLIGHT_API_NOT_CONFIGURED: ["Flight status isn't available yet. Please check with your airline.", 503],
  FLIGHT_API_UNAVAILABLE: ["Flight status is unavailable right now. Please try again shortly.", 503],
};
const fail = (code: string) => NextResponse.json({ error: (MESSAGES[code] ?? MESSAGES.FLIGHT_API_UNAVAILABLE)[0], code }, { status: (MESSAGES[code] ?? MESSAGES.FLIGHT_API_UNAVAILABLE)[1] });

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const body = await request.json().catch(() => null) as { flightNumber?: string; from?: string; to?: string; date?: string } | null;
  const route = Boolean(body?.from || body?.to);
  const number = route ? "route" : cleanFlightNumber(body?.flightNumber ?? "");
  const from = (body?.from ?? "").toUpperCase(), to = (body?.to ?? "").toUpperCase();
  const date = body?.date ?? "";
  if (route && (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to))) return fail("AIRPORT_NOT_FOUND");
  if (route && from === to) return fail("SAME_AIRPORT");
  // Yesterday up to a year ahead.
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(t > Date.now() - 2 * 86400_000 && t < Date.now() + 365 * 86400_000)) return fail("INVALID");
  // 30 searches per visitor per 10 minutes.
  const db = env.DB as unknown as { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> } } };
  const who = await sha256(`flights:${(env as unknown as Record<string, string>).RATE_LIMIT_SALT ?? "waydidi"}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
  const window = Math.floor(Date.now() / 600_000);
  const row = await db.prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1 RETURNING attempts").bind(who, window).first<{ attempts: number }>();
  if ((row?.attempts ?? 0) > 30) return fail("RATE");
  try {
    if (route) return NextResponse.json({ route: await routeFlights(from, to, date) });
    const flights = await flightStatus(number, date);
    await countSearch(number, date).catch(() => undefined);
    return NextResponse.json({ flights });
  }
  catch (e) { return fail(e instanceof Error ? e.message : "FLIGHT_API_UNAVAILABLE"); }
}
