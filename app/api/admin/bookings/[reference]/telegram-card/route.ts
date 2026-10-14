import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { resendBookingCard } from "@/lib/telegram/bookings";

// Admin: post a booking's card to the team Telegram group again (a new message; the old one is no longer updated).
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { reference } = await context.params;
  const result = await resendBookingCard(reference);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "Booking not found." ? 404 : result.error.startsWith("Only") ? 409 : 503 });
  console.info("Admin re-sent booking card to Telegram", { reference, admin: admin.email });
  return NextResponse.json({ ok: true });
}
