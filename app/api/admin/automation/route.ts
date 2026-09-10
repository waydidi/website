import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingNotifications, operationsAlerts } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { runOperationsAutomation } from "@/lib/operations-automation";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function GET() {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [alerts, notifications] = await Promise.all([
    getDb().select().from(operationsAlerts).orderBy(desc(operationsAlerts.detectedAt)).limit(100),
    getDb().select().from(bookingNotifications).orderBy(desc(bookingNotifications.createdAt)).limit(100),
  ]);
  return NextResponse.json({ alerts, notifications }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const input = await request.json() as { action?: string; alertId?: string; resolutionNote?: string };
  if (input.action === "run_now") return NextResponse.json({ summary: await runOperationsAutomation() });
  if (!input.alertId || !["acknowledge_alert", "resolve_alert"].includes(input.action ?? "")) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  const [alert] = await getDb().select().from(operationsAlerts).where(eq(operationsAlerts.id, input.alertId)).limit(1);
  if (!alert || !["open", "acknowledged"].includes(alert.status)) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  const now = new Date().toISOString();
  if (input.action === "acknowledge_alert") {
    await getDb().update(operationsAlerts).set({ status: "acknowledged", acknowledgedAt: now, acknowledgedBy: admin.email, updatedAt: now }).where(eq(operationsAlerts.id, input.alertId));
  } else {
    await getDb().update(operationsAlerts).set({ status: "resolved", resolvedAt: now, resolutionNote: typeof input.resolutionNote === "string" ? input.resolutionNote.trim().slice(0, 500) || "Resolved by administrator." : "Resolved by administrator.", updatedAt: now }).where(eq(operationsAlerts.id, input.alertId));
  }
  return NextResponse.json({ ok: true });
}
