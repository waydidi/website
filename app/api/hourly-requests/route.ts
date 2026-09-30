import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import { formAnswersSchema } from "@/lib/booking-form";
import { validBangkokPickup } from "@/lib/booking-time";
import { HOURLY_AREAS } from "@/lib/hourly-areas-data";
import { HOURLY_VEHICLES } from "@/lib/hourly-policy";
import { allowHourlyRequest } from "@/lib/hourly-request-limit";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

const inputSchema = z.object({ requestId: z.string().uuid(), areaSlug: z.string(), note: z.string().trim().max(500).default(""), answers: formAnswersSchema.extend({ hours: z.number().int().min(3).max(10), vehicle: z.enum(HOURLY_VEHICLES) }).strict() }).strict();
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check your contact and itinerary details." }, { status: 400 });
  const input = parsed.data, area = HOURLY_AREAS.find((a) => a.slug === input.areaSlug);
  if (!area || !validBangkokPickup(input.answers.date, input.answers.time)) return NextResponse.json({ error: "Choose a service area and a pickup at least 3 hours from now." }, { status: 400 });
  try {
    const db = getDb();
    // Retries create one operations request and never a payable booking.
    const token = (await sha256(`hourly-request:${input.requestId}`)).slice(0, 20);
    const answers = JSON.stringify(input.answers), note = `Hourly operations quote · Service area: ${area.name}. ${input.note}`;
    const [existing] = await db.select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
    if (existing) return existing.answers === answers && existing.note === note ? NextResponse.json({ ok: true, reused: true }) : NextResponse.json({ error: "The request details changed. Please submit again with a new request." }, { status: 409 });
    if (!await allowHourlyRequest(request, "operations")) return NextResponse.json({ error: "Too many quote requests. Please contact Waydidi." }, { status: 429 });
    const now = new Date().toISOString();
    await db.insert(bookingForms).values({ token, serviceType: "hourly", status: "submitted", answers, note, createdAt: now, submittedAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }).onConflictDoNothing();
    const [saved] = await db.select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
    if (saved?.answers !== answers || saved.note !== note) return NextResponse.json({ error: "The request details changed. Please submit again." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 503 }); }
}
