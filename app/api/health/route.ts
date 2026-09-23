import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  logOperationalError,
  monitoredHeaders,
  requestIdFor,
} from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  let database: "ok" | "unavailable" = "ok";

  try {
    await getDb().run(sql`SELECT 1`);
  } catch (error) {
    database = "unavailable";
    logOperationalError("health.database_unavailable", requestId, error);
  }

  const integrations = {
    googleMaps: Boolean(env.GOOGLE_MAPS_SERVER_KEY),
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    aviationstack: Boolean(env.AVIATIONSTACK_API_KEY),
    checkoutSecurity: Boolean(
      env.RATE_LIMIT_SALT || env.ADMIN_SESSION_SECRET || env.STRIPE_SECRET_KEY,
    ),
  };
  const fullyConfigured = Object.values(integrations).every(Boolean);
  const status = database !== "ok"
    ? "unavailable"
    : fullyConfigured
      ? "ok"
      : "degraded";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: { database, integrations },
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: monitoredHeaders(requestId, startedAt),
    },
  );
}
