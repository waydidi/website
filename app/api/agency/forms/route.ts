import { canBook, partnerDb, partnerProfile, partnerRate, thaiToday } from "@/lib/partner-portal";
import { NextResponse } from "next/server";
import { z } from "zod";
import { agencyForCustomer } from "@/lib/agency";
import { FORM_LINK_DAYS, formToken } from "@/lib/booking-form";
import { customerFromRequest, overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { env } from "cloudflare:workers";

const schema = z.object({ serviceType: z.enum(["transfer", "hourly", "tour"]), note: z.string().trim().max(200).optional().default(""), rateId:z.string().max(80).optional() });

// Agency portal: start a new ride request. Returns a form link the agency fills in
// itself or forwards to its client; the answers reach Waydidi tagged with the agency.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  const agency = await agencyForCustomer(session?.customer ?? null);
  if (!agency) return NextResponse.json({ error: "Please sign in with your agency email." }, { status: 401 });
  if (!canBook(agency.portalRole)) return NextResponse.json({error:"Your team role cannot create bookings."},{status:403});
  if (await overRateLimit(request, `agency-form:${agency.id}`, 60, 60, env.RATE_LIMIT_SALT ?? "waydidi")) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a service." }, { status: 400 });
  const now = new Date();
  const token = formToken();
  const rate=parsed.data.rateId?await partnerRate(parsed.data.rateId,agency.id):null;
  if(parsed.data.rateId&&(!rate||!rate.active||rate.valid_until<thaiToday()||rate.service_type!==parsed.data.serviceType))return NextResponse.json({error:"Choose an available rate for this service."},{status:400});
  const profile=await partnerProfile(agency);
  const prefill=rate?JSON.stringify({pickup:rate.pickup,dropoff:rate.dropoff,vehicle:rate.vehicle,price:rate.price_minor/100,...(rate.booked_hours?{hours:rate.booked_hours}:{})}):null;
  await partnerDb().batch([
    partnerDb().prepare("INSERT INTO booking_forms(token,service_type,note,status,agency_id,prefill,created_at,expires_at) VALUES(?,?,?,'waiting',?,?,?,?)").bind(token,parsed.data.serviceType,parsed.data.note||null,agency.id,prefill,now.toISOString(),new Date(now.getTime()+FORM_LINK_DAYS*86400000).toISOString()),
    partnerDb().prepare("INSERT INTO partner_request_terms(form_token,agency_id,rate_id,rate_snapshot,commission_bps,created_at) VALUES(?,?,?,?,?,?)").bind(token,agency.id,rate?.id??null,rate?JSON.stringify(rate):null,profile.commission_bps,now.toISOString()),
  ]);
  return NextResponse.json({ token });
}
