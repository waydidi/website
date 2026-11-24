import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { ACTIVITY_EVENTS, activityCost, activityRetentionDays, listActivity } from "@/lib/sales-ai/activity-log";

// AI activity log (owner only): what Non and the WhatsApp channel did, with model cost. Read-only:
// the log has no edit or delete action. allowedStaffRoute also refuses this path for every other role.
const headers = { "Cache-Control": "no-store" };
const STATUSES = ["ok", "error", "suppressed", "skipped"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// Bangkok calendar day boundaries as UTC instants.
const bangkokStart = (day: string) => new Date(Date.parse(`${day}T00:00:00+07:00`)).toISOString();

export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || staff.role !== "owner") return NextResponse.json({ error: "Owner access required." }, { status: 403, headers });
  const q = new URL(request.url).searchParams;
  const event = q.get("event") ?? "", status = q.get("status") ?? "", conversation = (q.get("conversation") ?? "").trim();
  const fromDay = q.get("from") ?? "", toDay = q.get("to") ?? "", before = q.get("before") ?? "";
  if (event && !(ACTIVITY_EVENTS as readonly string[]).includes(event)) return NextResponse.json({ error: "Unknown event type." }, { status: 400, headers });
  if (status && !STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400, headers });
  if ((fromDay && !ISO_DAY.test(fromDay)) || (toDay && !ISO_DAY.test(toDay))) return NextResponse.json({ error: "Dates must be YYYY-MM-DD." }, { status: 400, headers });
  if (conversation && !/^[A-Za-z0-9_-]{1,80}$/.test(conversation)) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400, headers });
  if (before && !/^[0-9T:.Z-]{20,30}\|[0-9a-f-]{36}$/.test(before)) return NextResponse.json({ error: "Invalid page cursor." }, { status: 400, headers });
  const from = fromDay ? bangkokStart(fromDay) : undefined;
  const to = toDay ? new Date(Date.parse(bangkokStart(toDay)) + 86400000).toISOString() : undefined;
  const page = await listActivity({ event: event || undefined, status: status || undefined, conversationId: conversation || undefined, from, to, before: before || undefined, limit: 50 });
  const now = new Date(), monthStart = bangkokStart(new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 8) + "01");
  const cost = await activityCost(monthStart, now.toISOString());
  return NextResponse.json({ ...page, events: ACTIVITY_EVENTS, retentionDays: activityRetentionDays(), month: cost }, { headers });
}
