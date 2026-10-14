import { ensureReliabilityTables } from "./reliability-db";
import { queueTelegram } from "./outbox";
import { env } from "cloudflare:workers";
import { fullName } from "@/lib/person-name";
import { SITE_URL } from "@/lib/site";
import { bookingLinks } from "@/lib/trip-links";
import { VEHICLES } from "@/lib/vehicles";
import { bookingCard, bookingKeyboard, type CardBooking } from "./cards";
import { editCard, telegramChatId, telegramConfigured } from "./client";

// Booking events on Telegram: one card per booking, edited in place when someone takes it.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as { prepare: (sql: string) => Stmt };
const adminUrl = (ref: string) => `${SITE_URL}/admin/journeys/${encodeURIComponent(ref)}`;

type Row = { status:string; created_at: string; return_date: string | null; reference: string; customer_name: string; customer_surname: string | null; pickup: string; dropoff: string; pickup_date: string; pickup_time: string; vehicle: string; passengers: number; luggage: number; total: number; payment_method: string; payment_status: string };
async function card(reference: string, acknowledgedBy: string | null): Promise<CardBooking | null> {
  await ensureReliabilityTables();
  const returnCost=await db().prepare("SELECT cost_minor FROM telegram_driver_leg_costs WHERE booking_reference=? AND leg='return'").bind(reference).first<{cost_minor:number}>();
  const tasks = await db().prepare("SELECT t.cost_done,t.driver_done,t.driver_form_json,c.total_driver_cost FROM telegram_booking_cards t LEFT JOIN booking_costs c ON c.booking_reference=t.booking_reference WHERE t.booking_reference=?")
    .bind(reference).first<{ cost_done: number; driver_done: number; driver_form_json: string | null; total_driver_cost: number | null }>().catch(() => null);
  const b = await db().prepare("SELECT status,created_at,return_date,reference,customer_name,customer_surname,pickup,dropoff,pickup_date,pickup_time,vehicle,passengers,luggage,total,payment_method,payment_status FROM bookings WHERE reference=?").bind(reference).first<Row>();
  if (!b) return null;
  // The booking's two links (made once): customer ride status and the driver's job page.
  const links = await bookingLinks({ reference: b.reference, createdAt: b.created_at, returnDate: b.return_date }).catch(() => null);
  return { status:b.status,reference: b.reference, customerName: fullName(b.customer_name, b.customer_surname), pickup: b.pickup, dropoff: b.dropoff, pickupDate: b.pickup_date, pickupTime: b.pickup_time,
    vehicle: VEHICLES[b.vehicle as keyof typeof VEHICLES]?.name ?? b.vehicle, passengers: b.passengers, luggage: b.luggage, total: b.total,
    payment: b.payment_method === "cash" ? "cash on the day" : b.payment_method === "transfer" ? (b.payment_status === "paid" ? "paid by bank transfer" : "waiting for bank transfer") : "paid online", acknowledgedBy,
    costDone: Boolean(tasks?.cost_done), driverDone: Boolean(tasks?.driver_done), driverCost: tasks?.total_driver_cost ?? null,
    driverName: tasks?.driver_form_json ? (JSON.parse(tasks.driver_form_json) as { name?: string }).name ?? null : null,
    rideLink: links?.customer ?? null, driverLink: links?.driver ?? null, driverReturnLink:links?.driverReturn??null, returnCostSet:Boolean(returnCost), returnAvailable:Boolean(b.return_date)&&(env as unknown as Record<string,string>).TELEGRAM_RETURN_DRIVER_JOBS==="1" };
}

/** Posts the new-booking card once per booking (safe to call repeatedly). */
export async function notifyBookingTelegram(reference: string) {
  if (!telegramConfigured()) return;
  const inserted=await db().prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,0,?) ON CONFLICT(booking_reference) DO NOTHING").bind(reference,new Date().toISOString()).run();
  const row=await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{telegram_message_id:number}>();
  if (row?.telegram_message_id) return;
  // A re-sent card (Admin → Re-send card) still on its way: the catch-up must not post another.
  if (await db().prepare("SELECT 1 x FROM telegram_delivery_jobs WHERE booking_reference=? AND id LIKE 'booking-card:%:resend:%' AND status IN ('queued','failed')").bind(reference).first().catch(() => null)) return;
  const c=await card(reference,null);
  if (!c) return;
  await queueTelegram({id:`booking-card:${reference}`,reference,legacyUncertain:!inserted.meta.changes,destination:telegramChatId(),payload:{text:bookingCard(c),keyboard:bookingKeyboard(c,adminUrl(reference)),target:{kind:"booking_card",id:reference},activeBooking:true}});

}

/**
 * Admin → "Re-send card": posts the booking's card to the team group again (as a new message, with its current
 * state and the Assign / cost / driver buttons), for a booking whose card was missed or lost. The old card message is
 * no longer updated; the new one takes over. Only a confirmed booking.
 */
export async function resendBookingCard(reference: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!telegramConfigured()) return { ok: false, error: "Telegram isn't set up yet." };
  await ensureReliabilityTables();
  const b = await db().prepare("SELECT status FROM bookings WHERE reference=? AND binned_at IS NULL").bind(reference).first<{ status: string }>();
  if (!b) return { ok: false, error: "Booking not found." };
  if (b.status !== "confirmed") return { ok: false, error: "Only a confirmed booking has a card." };
  await db().prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,0,?) ON CONFLICT(booking_reference) DO NOTHING").bind(reference, new Date().toISOString()).run();
  const row = await db().prepare("SELECT acknowledged_by FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ acknowledged_by: string | null }>();
  const c = await card(reference, row?.acknowledged_by ?? null);
  if (!c) return { ok: false, error: "Booking not found." };
  await db().prepare("UPDATE telegram_booking_cards SET telegram_message_id=0 WHERE booking_reference=?").bind(reference).run();
  const sent = await queueTelegram({ id: `booking-card:${reference}:resend:${Date.now().toString(36)}`, reference, destination: telegramChatId(), payload: { text: bookingCard(c), keyboard: bookingKeyboard(c, adminUrl(reference)), target: { kind: "booking_card", id: reference }, activeBooking: true } });
  // Not sent yet (Telegram busy): it stays queued and is retried; the catch-up will not post a second one.
  return sent === "sent" || sent === "queued" ? { ok: true } : { ok: false, error: "Couldn't send to Telegram. It will be retried." };
}

/** Catch-up: a confirmed upcoming booking whose card never reached the group (saved without emailing, or
 *  booked before Telegram cards existed) gets one, a few per run. */
export async function postMissingBookingCards(now = new Date()) {
  if (!telegramConfigured()) return;
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10); // Thailand date
  const { results } = await db().prepare(`SELECT b.reference FROM bookings b LEFT JOIN telegram_booking_cards c ON c.booking_reference=b.reference
    WHERE (c.booking_reference IS NULL OR c.telegram_message_id=0) AND b.status='confirmed' AND b.binned_at IS NULL AND (b.pickup_date>=? OR b.return_date>=?) ORDER BY b.pickup_date LIMIT 5`).bind(today, today).all<{ reference: string }>();
  for (const { reference } of results) await notifyBookingTelegram(reference).catch((error) => console.error("telegram booking card failed", error instanceof Error ? error.message : "unknown"));
}

export async function acknowledgeBooking(reference: string, name: string) {
  const done = await db().prepare("UPDATE telegram_booking_cards SET acknowledged_by=? WHERE booking_reference=? AND acknowledged_by IS NULL AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND status='confirmed')").bind(name, reference,reference).run();
  if (!done.meta.changes) return false;
  const row = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>();
  const c = await card(reference, name);
  if (row?.telegram_message_id && c) await editCard(row.telegram_message_id, bookingCard(c), bookingKeyboard(c, adminUrl(reference))).catch(() => undefined);
  return true;
}

const syncDriverGroup = (reference: string) => import("./driver-group").then((m) => m.syncDriverOffer(reference))
  .catch((error) => console.error("driver group offer failed", error instanceof Error ? error.message : "unknown"));

/** Re-draws a booking card (after cost or driver details are added). */
export async function refreshBookingCard(reference: string) {
  const row = await db().prepare("SELECT telegram_message_id,acknowledged_by FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number; acknowledged_by: string | null }>();
  const c = await card(reference, row?.acknowledged_by ?? null);
  if (row?.telegram_message_id && c) await editCard(row.telegram_message_id, bookingCard(c), bookingKeyboard(c, adminUrl(reference))).catch(() => undefined);
  // The driver group's offer follows: posted once the driver cost is set, closed once a driver is set or the booking is cancelled.
  await syncDriverGroup(reference);
}
