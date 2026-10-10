import { env } from "cloudflare:workers";
import { fullName } from "@/lib/person-name";
import { SITE_URL } from "@/lib/site";
import { bookingLinks } from "@/lib/trip-links";
import { VEHICLES } from "@/lib/vehicles";
import { bookingCard, bookingKeyboard, type CardBooking } from "./cards";
import { editCard, sendCard, telegramConfigured } from "./client";

// Booking events on Telegram: one card per booking, edited in place when someone takes it.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as { prepare: (sql: string) => Stmt };
const adminUrl = (ref: string) => `${SITE_URL}/admin/journeys/${encodeURIComponent(ref)}`;

type Row = { created_at: string; return_date: string | null; reference: string; customer_name: string; customer_surname: string | null; pickup: string; dropoff: string; pickup_date: string; pickup_time: string; vehicle: string; passengers: number; luggage: number; total: number; payment_method: string };
async function card(reference: string, acknowledgedBy: string | null): Promise<CardBooking | null> {
  const tasks = await db().prepare("SELECT t.cost_done,t.driver_done,t.driver_form_json,c.total_driver_cost FROM telegram_booking_cards t LEFT JOIN booking_costs c ON c.booking_reference=t.booking_reference WHERE t.booking_reference=?")
    .bind(reference).first<{ cost_done: number; driver_done: number; driver_form_json: string | null; total_driver_cost: number | null }>().catch(() => null);
  const b = await db().prepare("SELECT created_at,return_date,reference,customer_name,customer_surname,pickup,dropoff,pickup_date,pickup_time,vehicle,passengers,luggage,total,payment_method FROM bookings WHERE reference=?").bind(reference).first<Row>();
  if (!b) return null;
  // The booking's two links (made once): customer ride status and the driver's job page.
  const links = await bookingLinks({ reference: b.reference, createdAt: b.created_at, returnDate: b.return_date }).catch(() => null);
  // Read on their own, so the card still works if the map-link table isn't there yet.
  const maps = await db().prepare("SELECT pickup_map_url,dropoff_map_url FROM booking_map_links WHERE booking_reference=?").bind(reference).first<{ pickup_map_url: string | null; dropoff_map_url: string | null }>().catch(() => null);
  return { reference: b.reference, customerName: fullName(b.customer_name, b.customer_surname), pickup: b.pickup, dropoff: b.dropoff, pickupDate: b.pickup_date, pickupTime: b.pickup_time,
    vehicle: VEHICLES[b.vehicle as keyof typeof VEHICLES]?.name ?? b.vehicle, passengers: b.passengers, luggage: b.luggage, total: b.total,
    payment: b.payment_method === "cash" ? "cash on the day" : "paid online", acknowledgedBy,
    costDone: Boolean(tasks?.cost_done), driverDone: Boolean(tasks?.driver_done), driverCost: tasks?.total_driver_cost ?? null,
    driverName: tasks?.driver_form_json ? (JSON.parse(tasks.driver_form_json) as { name?: string }).name ?? null : null,
    rideLink: links?.customer ?? null, driverLink: links?.driver ?? null, pickupMap: Boolean(maps?.pickup_map_url), dropoffMap: Boolean(maps?.dropoff_map_url) };
}

/** Posts the new-booking card once per booking (safe to call repeatedly). */
export async function notifyBookingTelegram(reference: string) {
  if (!telegramConfigured()) return;
  const claimed = await db().prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,0,?) ON CONFLICT(booking_reference) DO NOTHING").bind(reference, new Date().toISOString()).run();
  if (!claimed.meta.changes) return;
  try {
    const c = await card(reference, null);
    if (!c) return;
    const sent = await sendCard(bookingCard(c), bookingKeyboard(c, adminUrl(reference)));
    await db().prepare("UPDATE telegram_booking_cards SET telegram_message_id=? WHERE booking_reference=?").bind(sent.message_id, reference).run();
  } catch (error) {
    // Release the claim so a later confirmation retry can post it.
    await db().prepare("DELETE FROM telegram_booking_cards WHERE booking_reference=? AND telegram_message_id=0").bind(reference).run();
    throw error;
  }
}

/** Catch-up: a confirmed upcoming booking whose card never reached the group (saved without emailing, or
 *  booked before Telegram cards existed) gets one, a few per run. */
export async function postMissingBookingCards(now = new Date()) {
  if (!telegramConfigured()) return;
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10); // Thailand date
  const { results } = await db().prepare(`SELECT b.reference FROM bookings b LEFT JOIN telegram_booking_cards c ON c.booking_reference=b.reference
    WHERE c.booking_reference IS NULL AND b.status='confirmed' AND b.binned_at IS NULL AND (b.pickup_date>=? OR b.return_date>=?) ORDER BY b.pickup_date LIMIT 5`).bind(today, today).all<{ reference: string }>();
  for (const { reference } of results) await notifyBookingTelegram(reference).catch((error) => console.error("telegram booking card failed", error instanceof Error ? error.message : "unknown"));
}

export async function acknowledgeBooking(reference: string, name: string) {
  const done = await db().prepare("UPDATE telegram_booking_cards SET acknowledged_by=? WHERE booking_reference=? AND acknowledged_by IS NULL").bind(name, reference).run();
  if (!done.meta.changes) return false;
  const row = await db().prepare("SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number }>();
  const c = await card(reference, name);
  if (row?.telegram_message_id && c) await editCard(row.telegram_message_id, bookingCard(c), bookingKeyboard(c, adminUrl(reference))).catch(() => undefined);
  return true;
}

/** Re-draws a booking card (after cost or driver details are added). */
export async function refreshBookingCard(reference: string) {
  const row = await db().prepare("SELECT telegram_message_id,acknowledged_by FROM telegram_booking_cards WHERE booking_reference=?").bind(reference).first<{ telegram_message_id: number; acknowledged_by: string | null }>();
  const c = await card(reference, row?.acknowledged_by ?? null);
  if (row?.telegram_message_id && c) await editCard(row.telegram_message_id, bookingCard(c), bookingKeyboard(c, adminUrl(reference))).catch(() => undefined);
}
