import { env } from "cloudflare:workers";
import { and, count, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { checkoutAttempts } from "@/db/schema";
import { parseRideSearch } from "@/lib/ride-search-rules";
import { saveRideSearch } from "@/lib/ride-search-db";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

const MAX_PER_10_MIN = 60;

// Saves the search the customer just ran, for the /reservation?ride=… address.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const ride = parseRideSearch(await request.json().catch(() => null));
  if (!ride) return NextResponse.json({ error: "Invalid search" }, { status: 400 });
  const fingerprintHash = await sha256(`ride:${env.RATE_LIMIT_SALT ?? "waydidi"}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
  const db = getDb();
  const [{ attempts }] = await db.select({ attempts: count() }).from(checkoutAttempts)
    .where(and(eq(checkoutAttempts.fingerprintHash, fingerprintHash), gt(checkoutAttempts.createdAt, new Date(Date.now() - 600_000).toISOString())));
  if (attempts >= MAX_PER_10_MIN) return NextResponse.json({ error: "Too many searches. Please wait a few minutes." }, { status: 429 });
  await db.insert(checkoutAttempts).values({ fingerprintHash, createdAt: new Date().toISOString() });
  const ride_id = await saveRideSearch(ride);
  return NextResponse.json({ ride: ride_id }, { headers: { "Cache-Control": "no-store" } });
}
