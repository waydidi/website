import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import { formAnswersSchema } from "@/lib/booking-form";
import { validBangkokPickup } from "@/lib/booking-time";
import { sendFormAlert } from "@/lib/email";
import { allowHourlyRequest } from "@/lib/hourly-request-limit";
import { multiCityNote, multiCityRequestSchema } from "@/lib/multi-city";
import { multiCityEnabled } from "@/lib/multi-city-server";
import { isJsonRequest, sameOrigin, sha256 } from "@/lib/security";
import { smallestFittingVehicle } from "@/lib/vehicles";

export async function POST(request: Request) {
  if (!multiCityEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = multiCityRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check your contact details and that each leg starts after the one before." }, { status: 400 });
  const input = parsed.data, first = input.legs[0];
  if (!input.legs.every((leg) => validBangkokPickup(leg.date, leg.time))) return NextResponse.json({ error: "Each pickup must be at least 3 hours from now." }, { status: 400 });
  // Staff choose the real vehicle when they quote; a form needs one to start from.
  const answers = formAnswersSchema.safeParse({ name: input.name, phone: input.phone, email: input.email, pickup: first.from, dropoff: first.to, date: first.date, time: first.time,
    passengers: input.passengers, luggage: input.luggage, vehicle: smallestFittingVehicle(input.passengers, input.luggage) ?? "premium_minivan" });
  if (!answers.success) return NextResponse.json({ error: "Please check your contact details." }, { status: 400 });
  try {
    const db = getDb();
    // Retries create one request and never a payable booking.
    const token = (await sha256(`multi-city-request:${input.requestId}`)).slice(0, 20);
    const saved = JSON.stringify(answers.data), note = multiCityNote(input);
    const [existing] = await db.select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
    if (existing) return existing.answers === saved && existing.note === note ? NextResponse.json({ ok: true, reused: true }) : NextResponse.json({ error: "The request details changed. Please submit again." }, { status: 409 });
    if (!await allowHourlyRequest(request, "operations")) return NextResponse.json({ error: "Too many requests. Please contact Waydidi." }, { status: 429 });
    const now = new Date().toISOString();
    const inserted = await db.insert(bookingForms).values({ token, serviceType: "transfer", status: "submitted", answers: saved, note, createdAt: now, submittedAt: now, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }).onConflictDoNothing().returning({ token: bookingForms.token });
    const [stored] = await db.select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
    if (stored?.answers !== saved || stored.note !== note) return NextResponse.json({ error: "The request details changed. Please submit again." }, { status: 409 });
    // Only the request that saved the row alerts staff. It stays in Admin -> Bookings even if this email fails.
    if (inserted.length) await sendFormAlert({ token, answers: answers.data, service: "transfer", agency: null, note, price: null }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not submit your request. Please try again." }, { status: 503 }); }
}
