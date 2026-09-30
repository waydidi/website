import { env } from "cloudflare:workers";
import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { checkoutAttempts } from "@/db/schema";
import { sha256 } from "@/lib/security";

export async function allowHourlyRequest(request: Request, kind: "quote" | "operations") {
  const fingerprintHash = await sha256(`hourly:${kind}:${env.RATE_LIMIT_SALT ?? "waydidi"}:${request.headers.get("cf-connecting-ip") ?? "unknown"}`);
  const db = getDb();
  const [{ attempts }] = await db.select({ attempts: count() }).from(checkoutAttempts).where(and(eq(checkoutAttempts.fingerprintHash, fingerprintHash), gt(checkoutAttempts.createdAt, new Date(Date.now() - 600000).toISOString())));
  if (attempts >= (kind === "quote" ? 80 : 10)) return false;
  await db.insert(checkoutAttempts).values({ fingerprintHash, createdAt: new Date().toISOString() });
  return true;
}
