import { partnerDb } from "@/lib/partner-portal";
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
  const token=parsed.data.partnerFormToken;
  if(token){
    const form=await partnerDb().prepare("SELECT agency_id FROM booking_forms WHERE token=? AND status='submitted' AND booking_reference IS NULL").bind(token).first<{agency_id:string|null}>();
    if(!form)return NextResponse.json({error:"This request is unavailable or already booked."},{status:409});
    parsed.data.agencyId=form.agency_id??"";
    const claim=await partnerDb().prepare("UPDATE booking_forms SET status='booking' WHERE token=? AND status='submitted' AND booking_reference IS NULL RETURNING token").bind(token).first();
    if(!claim)return NextResponse.json({error:"This request is being booked."},{status:409});
  }
  try{return NextResponse.json({ ok: true, ...(await createManualBooking(parsed.data, safeOrigin(request))) });}
  catch(error){if(token)await partnerDb().prepare("UPDATE booking_forms SET status='submitted' WHERE token=? AND status='booking' AND booking_reference IS NULL").bind(token).run();throw error;}
}
