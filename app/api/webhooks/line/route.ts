import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import { replyLine, verifyLineSignature } from "@/lib/line";
import { bookedCard, getLineState, pricePrompt, setLineState } from "@/lib/line-forms";
import { suggestFormPrice } from "@/lib/price-suggest";
import type { FormAnswers, FormService } from "@/lib/booking-form";
import { bookFromForm } from "@/lib/form-booking";
import { safeOrigin } from "@/lib/security";
import { verifyTripCompletion } from "@/lib/trip-completion";

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
    await verifyTripCompletion(params.get("event") ?? "", "LINE admin");
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
