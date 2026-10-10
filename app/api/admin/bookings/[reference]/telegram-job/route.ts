import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingCosts, bookings } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { esc } from "@/lib/telegram/cards";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { driverJobText } from "@/lib/telegram/job-text";

// Admin: post the driver job message for one booking to the team Telegram group.
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!telegramConfigured()) return NextResponse.json({ error: "Telegram isn't set up yet." }, { status: 503 });
  const { reference } = await context.params;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.status === "binned") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status === "cancelled") return NextResponse.json({ error: "This booking is cancelled." }, { status: 409 });
  const [cost] = await getDb().select({ total: bookingCosts.totalDriverCost, agreed: bookingCosts.agreedDriverCost }).from(bookingCosts).where(eq(bookingCosts.bookingReference, reference)).limit(1).catch(() => []);
  try {
    await sendCard(esc(driverJobText(booking, cost ? cost.total || cost.agreed : null)));
  } catch (error) {
    console.error("Telegram job post failed", { reference, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Couldn't send to Telegram. Try again." }, { status: 502 });
  }
  console.info("Admin sent job to Telegram", { reference, admin: admin.email });
  return NextResponse.json({ ok: true });
}
