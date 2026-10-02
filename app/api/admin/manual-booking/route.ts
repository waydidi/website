import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { createManualBooking, manualBookingProblem, manualBookingSchema } from "@/lib/manual-booking";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";

// Admin: record a booking taken by phone, LINE or an agency.
export async function POST(request: Request) {
  try {
    return await saveManualBooking(request);
  } catch (error) {
    // Admin-only endpoint: show the real reason so it can be fixed (e.g. a missing secret).
    console.error("Manual booking failed", error);
    const message = error instanceof Error ? error.message : String(error);
    const hint = /TRIP_PIN_SECRET/.test(message) ? " Add a WAYDIDI_TRIP_PIN_SECRET (32+ characters) in Cloudflare → Workers → waydidi-website → Settings → Variables and Secrets." : "";
    return NextResponse.json({ error: `The booking could not be saved: ${message}.${hint}` }, { status: 500 });
  }
}

async function saveManualBooking(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = manualBookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Check ${String(issue?.path?.[0] ?? "the form")}: ${issue?.message ?? "invalid value"}.` }, { status: 400 });
  }
  const problem = manualBookingProblem(parsed.data);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await createManualBooking(parsed.data, safeOrigin(request))) });
}
