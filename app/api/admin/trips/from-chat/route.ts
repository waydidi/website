import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { listAttractions } from "@/lib/attractions";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { chatPlanConfigured, draftFromChat } from "@/lib/trip-from-chat";
import type { PlaceOption } from "@/lib/trip-chat-rules";

const noStore = { "Cache-Control": "no-store" };

// Admin: paste a customer's chat; the answer is a draft trip (checked values, places from our own list).
// Nothing is saved, priced or sent to the customer here.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!chatPlanConfigured()) return NextResponse.json({ error: "The planner assistant is not switched on (ANTHROPIC_API_KEY is not set)." }, { status: 503, headers: noStore });
  const body = await request.json().catch(() => null) as { text?: unknown } | null;
  if (typeof body?.text !== "string") return NextResponse.json({ error: "Paste the customer's chat first." }, { status: 400, headers: noStore });
  const places: PlaceOption[] = (await listAttractions()).map((a) => ({ id: a.id, name: a.customerName || a.name, area: a.area, durationMin: a.durationMin, lat: a.latitude, lng: a.longitude, usedIn: 0 }));
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const result = await draftFromChat(body.text, places, today);
  return result.ok ? NextResponse.json({ draft: result.draft }, { headers: noStore }) : NextResponse.json({ error: result.error }, { status: 422, headers: noStore });
}
