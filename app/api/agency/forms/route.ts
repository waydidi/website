import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import { agencyForCustomer } from "@/lib/agency";
import { FORM_LINK_DAYS, formToken } from "@/lib/booking-form";
import { customerFromRequest, overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { env } from "cloudflare:workers";

const schema = z.object({ serviceType: z.enum(["transfer", "hourly", "tour"]), note: z.string().trim().max(200).optional().default("") });

// Agency portal: start a new ride request. Returns a form link the agency fills in
// itself or forwards to its client; the answers reach Waydidi tagged with the agency.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  const agency = await agencyForCustomer(session?.customer ?? null);
  if (!agency) return NextResponse.json({ error: "Please sign in with your agency email." }, { status: 401 });
  if (await overRateLimit(request, `agency-form:${agency.id}`, 60, 60, env.RATE_LIMIT_SALT ?? "waydidi")) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a service." }, { status: 400 });
  const now = new Date();
  const token = formToken();
  await getDb().insert(bookingForms).values({
    token, serviceType: parsed.data.serviceType, note: parsed.data.note || null, status: "waiting", agencyId: agency.id,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + FORM_LINK_DAYS * 86_400_000).toISOString(),
  });
  return NextResponse.json({ token });
}
