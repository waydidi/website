import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { managedBooking } from "@/lib/booking-management";
import { bookingChangeHistory } from "@/lib/booking-change-history";
import { logOperationalError, requestIdFor } from "@/lib/observability";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const booking = await managedBooking(request);
  if (!booking) return NextResponse.json({ error: "Your management session expired." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const offset = params.get("offset") ?? "0";
  if (!/^\d{1,9}$/.test(offset) || Number(offset) % 20 !== 0 || params.has("reference")) return NextResponse.json({ error: "Invalid history page." }, { status: 400, headers });
  try {
    return NextResponse.json(await bookingChangeHistory(env.DB, booking.reference, Number(offset)), { headers });
  } catch (error) {
    logOperationalError("booking_change_history_failed", requestIdFor(request), error);
    return NextResponse.json({ error: "Journey change history could not be loaded." }, { status: 503, headers });
  }
}
