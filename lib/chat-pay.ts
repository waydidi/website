import { env } from "cloudflare:workers";
import { uniqueBookingReference } from "@/lib/booking-reference-server";
import { quoteHourly, quoteTransfer } from "@/lib/cee/quotes";
import { sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
import { addBotMessage, conversationById } from "@/lib/website-chat";

// Booking from the chat: Non (or staff) sends a payment link for a price the SERVER works out
// again from the price tables. Paying it creates a confirmed booking and tells the customer in
// the same chat.
//
// Payment provider: Pay Solutions plugs in at paysoCheckoutUrl() once its API details and keys
// are known. Until then, PAYSO_TEST_MODE=1 (Cloudflare) shows a "test payment" button so the
// whole flow can be tried without charging anyone. With neither set, links aren't offered.

export const LINK_MINUTES = 30;
type Vars = Record<string, string | undefined>;
const vars = () => env as unknown as Vars;
type Db = { prepare: (s: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> } } };
const db = () => env.DB as unknown as Db;

export const paysoConfigured = () => Boolean(vars().PAYSO_MERCHANT_ID && vars().PAYSO_SECRET_KEY);
export const chatPaymentTestMode = () => vars().PAYSO_TEST_MODE === "1";
export const chatPaymentsEnabled = () => paysoConfigured() || chatPaymentTestMode();

export type LinkInput = {
  kind: "transfer" | "hourly"; pickup: string; dropoff: string; city: string; hours: number;
  date: string; time: string; passengers: number; bags: number; vehicle: string; leadName: string; leadPhone: string;
};
export type LinkRow = { id: string; conversation_id: string; kind: string; details_json: string; vehicle: string; amount: number; customer_name: string; customer_phone: string; customer_email: string;
  status: string; booking_reference: string | null; created_at: string; expires_at: string; paid_at: string | null };
export type Details = { pickup: string; dropoff: string; date: string; time: string; passengers: number; bags: number; hours: number | null; summary: string };

export const linkUrl = (id: string) => `${SITE_URL}/chat-pay/${id}`;
const token = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Re-prices the trip and stores a payment link for this chat. Returns what Non tells the customer. */
export async function createChatPaymentLink(conversationId: string, input: LinkInput, quotes = { quoteTransfer, quoteHourly }) {
  if (!chatPaymentsEnabled()) return { ok: false as const, reason: "Online payment in chat isn't switched on; hand over to staff to book." };
  const c = await conversationById(conversationId);
  if (!c) return { ok: false as const, reason: "Chat not found." };
  const email = c.customer_email ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false as const, reason: "Ask for the customer's email address first." };
  const name = input.leadName.trim().slice(0, 100), phone = input.leadPhone.trim().slice(0, 40);
  if (name.length < 2) return { ok: false as const, reason: "Ask for the lead passenger's full name." };
  if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) return { ok: false as const, reason: "Ask for a phone number (with country code) for the driver to call." };
  if (!(input.vehicle in VEHICLES)) return { ok: false as const, reason: "Ask which car they want from the quote." };
  // The price always comes from the server's own quote, never from the chat.
  const q = input.kind === "hourly"
    ? await quotes.quoteHourly({ city: input.city, pickup: input.pickup, hours: input.hours, date: input.date, time: input.time, passengers: input.passengers, bags: input.bags })
    : await quotes.quoteTransfer({ pickup: input.pickup, dropoff: input.dropoff, date: input.date, time: input.time, passengers: input.passengers, bags: input.bags });
  if (!q.ok) return { ok: false as const, reason: q.reason };
  const car = q.cars.find((x) => x.vehicle === input.vehicle);
  if (!car) return { ok: false as const, reason: "That car doesn't fit this group or isn't available; offer the cars from the quote." };
  // One open link per chat: a new one replaces the old.
  await db().prepare("UPDATE chat_payment_links SET status='replaced' WHERE conversation_id=? AND status='pending'").bind(conversationId).run();
  const id = token(), now = new Date(), expires = new Date(now.getTime() + LINK_MINUTES * 60_000);
  const details: Details = { pickup: input.pickup, dropoff: input.kind === "hourly" ? `${input.hours} hours with driver` : input.dropoff, date: input.date, time: input.time,
    passengers: input.passengers, bags: input.bags, hours: input.kind === "hourly" ? input.hours : null, summary: q.summary };
  await db().prepare(`INSERT INTO chat_payment_links(id,conversation_id,kind,details_json,vehicle,amount,customer_name,customer_phone,customer_email,status,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)`).bind(id, conversationId, input.kind, JSON.stringify(details), car.vehicle, car.price, name, phone, email, now.toISOString(), expires.toISOString()).run();
  return { ok: true as const, url: linkUrl(id), amount: car.price, car: car.name, summary: q.summary, expiresInMinutes: LINK_MINUTES };
}

export async function chatPaymentLink(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const row = await db().prepare("SELECT * FROM chat_payment_links WHERE id=?").bind(id).first<LinkRow>();
  if (row && row.status === "pending" && row.expires_at < new Date().toISOString()) {
    await db().prepare("UPDATE chat_payment_links SET status='expired' WHERE id=? AND status='pending'").bind(id).run();
    return { ...row, status: "expired" };
  }
  return row;
}

/** Where the customer pays. Pay Solutions' hosted payment page goes here once connected. */
export async function paysoCheckoutUrl(_link: LinkRow): Promise<string | null> {
  if (!paysoConfigured()) return null;
  throw new Error("PAYSO_NOT_CONNECTED"); // filled in from Pay Solutions' API documentation
}

/**
 * A confirmed payment (from Pay Solutions' notification, or the test button): creates the
 * booking once, and tells the customer and the team.
 */
export async function markChatPaymentPaid(id: string, provider: "payso" | "test") {
  const link = await chatPaymentLink(id);
  if (!link || link.status !== "pending") return { ok: false as const, reason: link?.status === "paid" ? "Already paid." : "This payment link has expired." };
  const claimed = await db().prepare("UPDATE chat_payment_links SET status='paying' WHERE id=? AND status='pending'").bind(id).run();
  if (!claimed.meta.changes) return { ok: false as const, reason: "Already being paid." };
  const d = JSON.parse(link.details_json) as Details;
  let reference: string;
  const now = new Date().toISOString();
  try {
    reference = await uniqueBookingReference();
  await db().prepare(`INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,service_type,booked_hours,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed','paid',?,?,?,?,?,?)`)
    .bind(reference, link.customer_name, link.customer_email, link.customer_phone, d.pickup, d.dropoff, d.date, d.time, d.passengers, d.bags, link.vehicle,
      provider === "test" ? "test" : "payso", link.amount, link.amount, await sha256(token()), link.kind, d.hours, now, now).run();
  await db().prepare("INSERT OR IGNORE INTO booking_sources(booking_reference,source,created_at) VALUES(?,?,?)").bind(reference, "chat", now).run().catch(() => undefined);
  await db().prepare("UPDATE chat_payment_links SET status='paid',booking_reference=?,provider=?,paid_at=? WHERE id=?").bind(reference, provider, now, id).run();
  } catch (error) {
    // Nothing was booked: let the payment be tried again.
    await db().prepare("UPDATE chat_payment_links SET status='pending' WHERE id=? AND status='paying'").bind(id).run();
    throw error;
  }
  const car = VEHICLES[link.vehicle as VehicleId]?.name ?? link.vehicle;
  await addBotMessage(link.conversation_id, `Payment received, thank you! Your booking ${reference} is confirmed: ${d.pickup} → ${d.dropoff}, ${d.date} at ${d.time}, ${car}. We'll send your driver's details before the trip.${provider === "test" ? " (Test payment: no money was charged.)" : ""}`).catch(() => undefined);
  await import("@/lib/telegram/bookings").then((m) => m.notifyBookingTelegram(reference)).catch(() => undefined);
  return { ok: true as const, reference };
}
