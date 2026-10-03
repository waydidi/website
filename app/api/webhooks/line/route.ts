import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingAssignments, bookingForms, bookings, drivers, driverStatusEvents } from "@/db/schema";
import { notifyLineDriverPayment, replyLine, verifyLineSignature } from "@/lib/line";
import { bookedCard, getLineState, pricePrompt, setLineState } from "@/lib/line-forms";
import { suggestFormPrice } from "@/lib/price-suggest";
import type { FormAnswers, FormService } from "@/lib/booking-form";
import { bookFromForm } from "@/lib/form-booking";
import { safeOrigin } from "@/lib/security";
import { completeJourney, parseLeg } from "@/lib/journey-legs";

type LineEvent = { type?: string; webhookEventId?: string; replyToken?: string; postback?: { data?: string }; message?: { type?: string; text?: string }; source?: { userId?: string; groupId?: string; roomId?: string } };

export async function POST(request: Request) {
  const raw = await request.text();
  if (!(await verifyLineSignature(raw, request.headers.get("x-line-signature") ?? ""))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let body: { events?: LineEvent[] }; try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid payload" }, { status: 400 }); }
  for (const event of body.events ?? []) {
    // Form pricing: "Set price" on a form card, then the price typed as a message.
    if (await handleFormPricing(event, safeOrigin(request))) continue;
    if (event.type !== "postback") continue;
    const chat = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId ?? "";
    if (!env.LINE_ADMIN_TARGET_ID || chat !== env.LINE_ADMIN_TARGET_ID) continue;
    const params = new URLSearchParams(event.postback?.data ?? "");
    if (params.get("action") !== "complete_trip") continue;
    const eventId = params.get("event") ?? "";
    const [statusEvent] = await getDb().select().from(driverStatusEvents).where(eq(driverStatusEvents.id, eventId)).limit(1);
    if (!statusEvent || statusEvent.status !== "completed") continue;
    if (statusEvent.verificationStatus === "verified") continue;
    if (statusEvent.verificationStatus !== "pending_review") continue;
    const [[assignment], [booking]] = await Promise.all([
      getDb().select().from(bookingAssignments).where(eq(bookingAssignments.id, statusEvent.assignmentId)).limit(1),
      getDb().select().from(bookings).where(eq(bookings.reference, statusEvent.bookingReference)).limit(1),
    ]);
    if (!assignment || assignment.revokedAt || !booking || booking.status !== "confirmed") continue;
    const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, assignment.driverId)).limit(1);
    const now = new Date().toISOString();
    const claimed = await env.DB.prepare("UPDATE driver_status_events SET verification_status = 'verified', verified_by = ?, verified_at = ? WHERE id = ? AND verification_status = 'pending_review'").bind("LINE admin", now, statusEvent.id).run();
    if ((claimed.meta.changes ?? 0) !== 1) continue;
    await completeJourney(booking.reference, parseLeg(assignment.leg), "completed");
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO booking_events (booking_reference, event_type, provider_event_id, created_at) VALUES (?, 'trip_completed_verified', ?, ?)").bind(booking.reference, `line-completed:${statusEvent.id}`, now),
    ]);
    if (driver) await notifyLineDriverPayment({ reference: booking.reference, driverName: driver.fullName, bankCode: driver.bankCode, bankAccountNumber: driver.bankAccountNumber }).catch((error) => console.error("LINE payment notification failed", error));
  }
  return NextResponse.json({ ok: true });
}

// Only the admin chat (LINE_ADMIN_TARGET_ID) can price forms.
async function handleFormPricing(event: LineEvent, origin: string) {
  const chat = event.source?.groupId ?? event.source?.roomId ?? event.source?.userId ?? "";
  if (!env.LINE_ADMIN_TARGET_ID || chat !== env.LINE_ADMIN_TARGET_ID) return false;
  const reply = (messages: unknown[]) => replyLine(event.replyToken ?? "", messages);
  const pendingKey = `price-pending:${chat}`;
  if (event.type === "postback" && event.postback?.data?.startsWith("price:")) {
    const token = event.postback.data.slice(6);
    const [form] = await getDb().select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
    if (!form || form.status !== "submitted") { await reply([{ type: "text", text: form?.status === "booked" ? `Already booked as ${form.bookingReference}.` : "That form can't be priced any more." }]); return true; }
    const answers = form.answers ? JSON.parse(form.answers) as FormAnswers : null;
    await setLineState(pendingKey, token);
    const suggestion = answers ? await suggestFormPrice(form.serviceType as FormService, answers).catch(() => null) : null;
    await reply([pricePrompt(token, answers?.name ?? "this customer", suggestion)]);
    return true;
  }
  // Quick reply: book straight away at the tapped price.
  if (event.type === "postback" && event.postback?.data?.startsWith("book:")) {
    const [, token, amount] = event.postback.data.split(":");
    await setLineState(pendingKey, null);
    await book(token, Number(amount));
    return true;
  }
  if (event.type !== "message" || event.message?.type !== "text") return false;
  const token = await getLineState(pendingKey);
  if (!token) return false;
  const typed = (event.message.text ?? "").replace(/[฿,\s]|thb|baht/giu, "");
  if (!/^\d{1,7}$/u.test(typed)) { await reply([{ type: "text", text: "Please type the price as a number, e.g. 3400." }]); return true; }
  await setLineState(pendingKey, null);
  await book(token, Number(typed));
  return true;

  async function book(formToken: string, price: number) {
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) { await reply([{ type: "text", text: "That price isn't valid." }]); return; }
    try {
      const result = await bookFromForm(formToken, price, origin);
      if ("error" in result) { await reply([{ type: "text", text: result.error }]); return; }
      await reply([bookedCard({ reference: result.reference, name: result.name, total: result.total, emailSent: result.emailStatus === "sent", bookingUrl: `${origin}/admin/journeys/${result.reference}` })]);
    } catch (error) {
      console.error("LINE form booking failed", error);
      await reply([{ type: "text", text: "The booking couldn't be saved. Please open the form in admin." }]);
    }
  }
}
