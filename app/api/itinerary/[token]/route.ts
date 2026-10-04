import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { smartTrips } from "@/db/schema";
import { overRateLimit } from "@/lib/customer-auth";
import { isJsonRequest, safeOrigin, sameOrigin } from "@/lib/security";
import { tripByToken, tripSnapshot } from "@/lib/smart-trips";
import { startTripCheckout } from "@/lib/trip-booking";
import { notifyTripReply } from "@/lib/trip-notify";

const acceptSchema = z.object({
  action: z.literal("accept"),
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(254),
  phone: z.string().trim().min(5, "Enter a phone number we can reach on the day.").max(40),
  agree: z.literal(true, { errorMap: () => ({ message: "Please accept the terms and cancellation policy." }) }),
});
const feedbackSchema = z.object({ action: z.literal("feedback"), rating: z.number().int().min(1, "Tap the stars to rate your day.").max(5), comment: z.string().trim().max(1500).optional().default("") });
const changeSchema = z.object({ action: z.literal("change"), message: z.string().trim().min(3, "Tell us what to change.").max(1500) });

// Customer: accept and pay, or ask for changes. The link itself is the key.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (await overRateLimit(request, "itinerary", 20, 15, env.RATE_LIMIT_SALT ?? "waydidi")) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  const trip = await tripByToken((await params).token);
  const snap = trip ? tripSnapshot(trip) : null;
  if (!trip || !snap || trip.status === "cancelled" || trip.status === "draft" || trip.status === "pricing") return NextResponse.json({ error: "This itinerary isn't available. Please contact us." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const origin = safeOrigin(request);

  if ((body as { action?: string })?.action === "feedback") {
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    if (trip.status !== "accepted" || !snap.tripDate || snap.tripDate > new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)) return NextResponse.json({ error: "Feedback opens after your trip." }, { status: 409 });
    if (trip.feedbackAt) return NextResponse.json({ error: "Thanks, we already have your feedback." }, { status: 409 });
    await getDb().update(smartTrips).set({ feedbackRating: parsed.data.rating, feedbackComment: parsed.data.comment || null, feedbackAt: new Date().toISOString() }).where(eq(smartTrips.id, trip.id));
    // Staff hear about every rating; low ones need a reply.
    const { pushLine } = await import("@/lib/line");
    await pushLine([{ type: "text", text: `${"★".repeat(parsed.data.rating)}${"☆".repeat(5 - parsed.data.rating)} ${trip.customerName || "Guest"} rated trip ${trip.ref}${parsed.data.rating <= 3 ? " — please follow up" : ""}${parsed.data.comment ? `\n“${parsed.data.comment.slice(0, 400)}”` : ""}\n${origin}/admin/trips/${trip.id}` }]).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }

  if ((body as { action?: string })?.action === "change") {
    const parsed = changeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    if (trip.status === "accepted") return NextResponse.json({ error: "Your trip is paid. Chat with us to change it." }, { status: 409 });
    const now = new Date().toISOString();
    await getDb().update(smartTrips).set({ status: "changes_requested", changeRequest: parsed.data.message, updatedAt: now }).where(eq(smartTrips.id, trip.id));
    await notifyTripReply(trip, "change", parsed.data.message, origin);
    return NextResponse.json({ ok: true });
  }

  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  if (trip.status === "accepted") return NextResponse.json({ error: "This trip is already paid." }, { status: 409 });
  if (!snap.tripDate || snap.tripDate < new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)) return NextResponse.json({ error: "This date has passed. Please ask us for a new itinerary." }, { status: 410 });
  if (trip.sentAt && Date.now() - Date.parse(trip.sentAt) > trip.holdDays * 86_400_000) return NextResponse.json({ error: `This price was held for ${trip.holdDays} days and has expired. Ask us to confirm it again.` }, { status: 410 });
  try {
    const result = await startTripCheckout(trip, snap, parsed.data, origin);
    if (result.alreadyPaid) return NextResponse.json({ error: "This trip is already paid." }, { status: 409 });
    return NextResponse.json({ checkoutUrl: result.checkoutUrl });
  } catch (error) {
    console.error("trip checkout failed", error);
    return NextResponse.json({ error: "Payment couldn't start right now. Please try again or chat with us." }, { status: 503 });
  }
}
