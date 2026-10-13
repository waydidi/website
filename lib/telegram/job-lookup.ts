import { env } from "cloudflare:workers";
import { COMMITTED_SQL } from "@/lib/booking-status";
import { esc } from "@/lib/telegram/cards";
import { sendCard } from "@/lib/telegram/client";
import { driverJobText } from "@/lib/telegram/job-text";
import { bangkokToday, LOOKUP_MAX_RESULTS, looksLikeReference, namePattern } from "@/lib/telegram/job-lookup-rules";

// Team members ask the group bot for a booking's driver job message by customer name or
// booking reference; the bot replies with the same message as Admin → "Send job to Telegram".
// Read only: nothing is assigned, changed or sent to customers.

type Row = {
  reference: string; status: string; vehicle: string; customer_name: string; customer_surname: string | null; passengers: number; luggage: number;
  pickup_date: string; pickup_time: string; flight_number: string | null; pickup: string; dropoff: string;
  service_type: string | null; pricing_area: string | null; booked_hours: number | null; cost: number | null;
};
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { all: <T>() => Promise<{ results: T[] }> } } };
const db = () => env.DB as unknown as Db;

const COLUMNS = `b.reference,b.status,b.vehicle,b.customer_name,b.customer_surname,b.passengers,b.luggage,b.pickup_date,b.pickup_time,b.flight_number,b.pickup,b.dropoff,
  b.service_type,b.pricing_area,b.booked_hours,NULLIF(COALESCE(NULLIF(c.total_driver_cost,0),c.agreed_driver_cost),0) AS cost`;

/** Upcoming live bookings for a customer name (nearest first), or any booking for an exact reference. */
export async function findJobs(query: string, today = bangkokToday()) {
  if (looksLikeReference(query)) {
    const { results } = await db().prepare(`SELECT ${COLUMNS} FROM bookings b LEFT JOIN booking_costs c ON c.booking_reference=b.reference WHERE b.reference=? AND b.status<>'binned'`)
      .bind(query.toUpperCase()).all<Row>();
    if (results.length) return results;
  }
  const { results } = await db().prepare(`SELECT ${COLUMNS} FROM bookings b LEFT JOIN booking_costs c ON c.booking_reference=b.reference
    WHERE b.status IN (${COMMITTED_SQL}) AND b.pickup_date>=?
      AND (lower(b.customer_name || ' ' || COALESCE(b.customer_surname,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.customer_surname,'') || ' ' || b.customer_name) LIKE ? ESCAPE '\\')
    ORDER BY b.pickup_date, b.pickup_time LIMIT ?`).bind(today, namePattern(query), namePattern(query), LOOKUP_MAX_RESULTS + 1).all<Row>();
  return results;
}

export function jobReply(row: Row) {
  const note = row.status === "cancelled" ? "\n⚠️ ยกเลิกแล้ว (cancelled)" : "";
  return `<b>${esc(row.reference)}</b>${note}\n\n` + esc(driverJobText({
    vehicle: row.vehicle, customerName: row.customer_name, customerSurname: row.customer_surname, passengers: row.passengers, luggage: row.luggage,
    pickupDate: row.pickup_date, pickupTime: row.pickup_time, flightNumber: row.flight_number, pickup: row.pickup, dropoff: row.dropoff,
    serviceType: row.service_type, pricingArea: row.pricing_area, bookedHours: row.booked_hours,
  }, row.cost));
}

/** Replies under the asking message: one job message per match, or a short "not found". */
export async function answerJobLookup(query: string, replyTo: number, options: { quietWhenNone?: boolean } = {}) {
  const rows = await findJobs(query);
  if (!rows.length) {
    // The assistant can look wider (past trips, other spellings), so it may answer instead.
    if (!options.quietWhenNone) await sendCard(`No upcoming booking found for “${esc(query)}”. Try the surname or the booking reference.`, undefined, replyTo);
    return 0;
  }
  for (const row of rows.slice(0, LOOKUP_MAX_RESULTS)) await sendCard(jobReply(row), undefined, replyTo);
  if (rows.length > LOOKUP_MAX_RESULTS) await sendCard(`Showing the first ${LOOKUP_MAX_RESULTS}. Add the surname or the booking reference to narrow it down.`, undefined, replyTo);
  return rows.length;
}
