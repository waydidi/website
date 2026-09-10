import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { driverStatusEvents } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { eventId } = await context.params;
  const [event] = await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.id, eventId)).limit(1);
  if (!event?.evidenceKey || !env.BUCKET) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  const object = await env.BUCKET.get(event.evidenceKey);
  if (!object) return NextResponse.json({ error: "Evidence not found." }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": event.evidenceMime ?? object.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="evidence-${eventId}"`, "X-Content-Type-Options": "nosniff" } });
}
