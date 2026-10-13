import { ensureReliabilityTables } from "@/lib/telegram/reliability-db";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingFreeAddons, bookingMemberDiscounts, bookings, promoRedemptions } from "@/db/schema";
import { addonsTotal } from "./addons";
import { bangkokDepartureTimestamp } from "./booking-time";
import { toSatang } from "./money";
import type { SecurityDatabase } from "./worker-db";

/** Keep the accepted add-ons and discounts when replacing the route fare. */
export async function revisedBookingTotal(booking: typeof bookings.$inferSelect, fare: number) {
  if (booking.outboundTotal !== null) {
    return Math.max(0, fare + booking.total - booking.outboundTotal - (booking.returnTotal ?? 0));
  }
  // Older/manual bookings may not have separate leg fares.
  const db = getDb();
  const [[free], [member], discounts] = await Promise.all([
    db.select().from(bookingFreeAddons).where(eq(bookingFreeAddons.bookingReference, booking.reference)).limit(1),
    db.select().from(bookingMemberDiscounts).where(eq(bookingMemberDiscounts.bookingReference, booking.reference)).limit(1),
    db.select().from(promoRedemptions).where(eq(promoRedemptions.bookingReference, booking.reference)),
  ]);
  const notes = booking.specialRequests ?? "";
  const ferry = /Ferry & hotel transfer requested for (\d+)/i.exec(notes);
  const extras = booking.createdAt >= "2026-09-24T14:30:00.000Z"
    ? addonsTotal(booking.childSeats, /Currency exchange stop requested/i.test(notes), free, Number(ferry?.[1] ?? 0)) : 0;
  return Math.max(0, fare + extras - (member?.discount ?? 0) - discounts.reduce((sum, d) => sum + d.discount, 0));
}

export function validChangedSchedule(date: string, time: string, returnDate: string | null, returnTime: string | null) {
  const out = bangkokDepartureTimestamp(date, time);
  if (out === null) return false;
  if (!returnDate && !returnTime) return true;
  const back = returnDate && returnTime ? bangkokDepartureTimestamp(returnDate, returnTime) : null;
  return back !== null && back > out;
}

type Change = { id: string; booking_reference: string; status: string; booking_version: number; original_total: number; revised_total: number; vehicle_id: string; fare_quote_id: string; return_fare_quote_id: string | null; pickup_date: string; pickup_time: string };
type Quote = { id: string; pickup_place_id: string; dropoff_place_id: string; pickup_text: string; dropoff_text: string; departure_date: string; departure_time: string; pickup_latitude: number | null; pickup_longitude: number | null; dropoff_latitude: number | null; dropoff_longitude: number | null; distance_meters: number; duration_seconds: number; route_polyline: string | null; area_name: string; pricing_version: number; vehicle_prices_json: string };

/** D1 batches are transactions: claim, route, ledger and request commit together. */
export async function applyBookingChange(id: string, at: string) {
  await ensureReliabilityTables();
  const db = env.DB as unknown as SecurityDatabase;
  const c = await db.prepare("SELECT * FROM booking_change_requests WHERE id=?").bind(id).first<Change>();
  if (!c || c.status !== "pending") return "handled";
  const b = await db.prepare("SELECT return_date,return_time FROM bookings WHERE reference=?").bind(c.booking_reference).first<{ return_date: string | null; return_time: string | null }>();
  const out = await db.prepare("SELECT * FROM fare_quotes WHERE id=?").bind(c.fare_quote_id).first<Quote>();
  const back = c.return_fare_quote_id ? await db.prepare("SELECT * FROM fare_quotes WHERE id=?").bind(c.return_fare_quote_id).first<Quote>() : null;
  if (!b || !out || out.departure_date !== c.pickup_date || out.departure_time !== c.pickup_time || !validChangedSchedule(c.pickup_date, c.pickup_time, b.return_date, b.return_time)) return "invalid";
  if (b.return_date && (!back || back.departure_date !== b.return_date || back.departure_time !== b.return_time || back.pickup_place_id !== out.dropoff_place_id || back.dropoff_place_id !== out.pickup_place_id)) return "invalid";
  const price = JSON.parse(out.vehicle_prices_json)[c.vehicle_id] as { total: number; basePrice?: number; distanceSurcharge?: number } | undefined;
  const returnPrice = back ? JSON.parse(back.vehicle_prices_json)[c.vehicle_id] as { total: number } | undefined : null;
  if (!price || !Number.isSafeInteger(price.total) || price.total <= 0 || (back && (!returnPrice || !Number.isSafeInteger(returnPrice.total) || returnPrice.total <= 0)) || !Number.isSafeInteger(c.revised_total) || c.revised_total < 0) return "invalid";
  const claim = `applying:${crypto.randomUUID()}`;
  const owned = "EXISTS(SELECT 1 FROM booking_change_requests WHERE id=? AND status=?)";
  const statements = [
    db.prepare("UPDATE booking_change_requests SET status=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM bookings WHERE reference=? AND booking_version=? AND total=? AND status='confirmed')").bind(claim, id, c.booking_reference, c.booking_version, c.original_total),
    db.prepare(`UPDATE bookings SET pickup=?,dropoff=?,pickup_date=?,pickup_time=?,vehicle=?,total=?,fare_quote_id=?,return_fare_quote_id=?,outbound_total=?,return_total=?,return_pickup=?,return_dropoff=?,return_distance_meters=?,return_duration_seconds=?,return_route_polyline=?,pickup_latitude=?,pickup_longitude=?,dropoff_latitude=?,dropoff_longitude=?,route_distance_meters=?,route_duration_seconds=?,expected_route_polyline=?,pricing_area=?,pricing_version=?,base_price=?,distance_surcharge=?,payment_status=CASE WHEN payment_method='cash' AND payment_status NOT IN ('refunded','partially_refunded','disputed') THEN CASE WHEN amount_paid>=? THEN 'paid' ELSE 'cash_due' END ELSE payment_status END,booking_version=booking_version+1,updated_at=? WHERE reference=? AND ${owned}`)
      .bind(out.pickup_text, out.dropoff_text, c.pickup_date, c.pickup_time, c.vehicle_id, c.revised_total, out.id, back?.id ?? null, price.total, returnPrice?.total ?? null, back?.pickup_text ?? null, back?.dropoff_text ?? null, back?.distance_meters ?? null, back?.duration_seconds ?? null, back?.route_polyline ?? null, out.pickup_latitude, out.pickup_longitude, out.dropoff_latitude, out.dropoff_longitude, out.distance_meters, out.duration_seconds, out.route_polyline, out.area_name, out.pricing_version, price.basePrice ?? price.total, price.distanceSurcharge ?? 0, c.revised_total, at, c.booking_reference, id, claim),
    db.prepare(`UPDATE booking_payments SET amount_expected=?,amount_expected_minor=?,status=CASE WHEN provider='cash' THEN (SELECT payment_status FROM bookings WHERE reference=?) ELSE status END,updated_at=? WHERE id=? AND ${owned}`).bind(c.revised_total, toSatang(c.revised_total), c.booking_reference, at, `primary:${c.booking_reference}`, id, claim),
    db.prepare(`UPDATE journey_legs SET pickup_date=NULL,pickup_time=NULL,flight_date=NULL,arrival_pickup_offset_minutes=NULL,updated_at=? WHERE booking_reference=? AND ${owned}`).bind(at, c.booking_reference, id, claim),
    // Saved driver map links refer to the old route.
    db.prepare(`DELETE FROM booking_map_links WHERE booking_reference=? AND ${owned}`).bind(c.booking_reference, id, claim),
    db.prepare(`UPDATE dispatch_revision SET version=version+1 WHERE id=1 AND ${owned}`).bind(id,claim),
    db.prepare("UPDATE booking_change_requests SET status='approved',resolved_at=? WHERE id=? AND status=?").bind(at, id, claim),
  ];
  const results = await db.batch(statements);
  if (results[0].meta.changes) return "applied";
  const current = await db.prepare("SELECT status FROM booking_change_requests WHERE id=?").bind(id).first<{ status: string }>();
  return current?.status !== "pending" ? "handled" : "stale";
}
