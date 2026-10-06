import { env } from "cloudflare:workers";
import { legacySurname, normalizeSurname } from "@/lib/booking-reference";
import { constantTimeEqual, sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import { VEHICLES } from "@/lib/vehicles";

// "Check my booking" in the chat (website, WhatsApp, LINE): the booking reference AND the lead
// passenger's surname must both match. Wrong guesses are limited per chat so references can't be tried out.

const MAX_FAILS = 5; // per chat per day
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

type Row = { reference: string; customer_name: string; customer_surname: string | null; status: string; pickup: string; dropoff: string; pickup_date: string; pickup_time: string;
  return_date: string | null; return_time: string | null; vehicle: string; passengers: number; luggage: number; flight_number: string | null; payment_method: string; payment_status: string;
  total: number; amount_paid: number; service_type: string; booked_hours: number | null };
export type BookingStatus = { reference: string; status: string; statusText: string; leadName: string; rows: [string, string][]; cashDue: number; driver: { name: string; car: string | null; plate: string | null; phone: string | null } | null; manageUrl: string };

const STATUS: Record<string, string> = { confirmed: "Confirmed", pending: "Waiting for payment", pending_payment: "Waiting for payment", cancelled: "Cancelled", completed: "Completed", binned: "Not found" };
const day = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };

async function failKey(conversationId: string) { return `lookup:${(await sha256(`lookup:${conversationId}`)).slice(0, 32)}`; }
async function fails(conversationId: string) {
  const w = Math.floor(Date.now() / 86400_000);
  return (await db().prepare("SELECT attempts FROM security_rate_windows WHERE fingerprint=? AND window=?").bind(await failKey(conversationId), w).first<{ attempts: number }>())?.attempts ?? 0;
}
async function addFail(conversationId: string) {
  const w = Math.floor(Date.now() / 86400_000);
  await db().prepare("INSERT INTO security_rate_windows(fingerprint,window,attempts) VALUES(?,?,1) ON CONFLICT(fingerprint,window) DO UPDATE SET attempts=attempts+1").bind(await failKey(conversationId), w).run();
}

export async function checkBooking(conversationId: string, referenceIn: string, surnameIn: string): Promise<{ ok: true; booking: BookingStatus } | { ok: false; reason: string }> {
  if ((await fails(conversationId)) >= MAX_FAILS) return { ok: false, reason: "Too many tries in this chat today. Ask the customer to check the confirmation email, or hand over to the team." };
  const reference = referenceIn.trim().toUpperCase().replace(/\s+/g, "");
  const surname = normalizeSurname(surnameIn ?? "");
  if (!/^(?:[A-HJ-NP-Z2-9]{6}|WD-[A-F0-9]{12})$/.test(reference)) return { ok: false, reason: "That doesn't look like a booking reference (6 letters/numbers, e.g. MC7Q2P, from the confirmation email). Ask them to check it." };
  if (!surname) return { ok: false, reason: "Ask for the lead passenger's surname (last name) as written on the booking." };
  const b = await db().prepare(`SELECT reference,customer_name,customer_surname,status,pickup,dropoff,pickup_date,pickup_time,return_date,return_time,vehicle,passengers,luggage,flight_number,
    payment_method,payment_status,total,amount_paid,service_type,booked_hours FROM bookings WHERE reference=?`).bind(reference).first<Row>();
  const match = b && b.status !== "binned" && constantTimeEqual(await sha256(surname), await sha256(normalizeSurname(b.customer_surname || legacySurname(b.customer_name))));
  if (!b || !match) { await addFail(conversationId); return { ok: false, reason: "No booking matches that reference and surname. Ask them to check both (as on the confirmation email). Don't say which one is wrong." }; }

  // The driver (if assigned); the phone number only from 24 hours before pickup.
  const driver = await db().prepare(`SELECT d.full_name name,d.vehicle car,d.car_plate plate,d.phone phone FROM booking_assignments a JOIN drivers d ON d.id=a.driver_id
    WHERE a.booking_reference=? AND a.revoked_at IS NULL ORDER BY a.assigned_at DESC LIMIT 1`).bind(reference).first<{ name: string; car: string | null; plate: string | null; phone: string | null }>().catch(() => null);
  const soon = new Date(`${b.pickup_date}T${b.pickup_time}:00+07:00`).getTime() - Date.now() < 24 * 3600_000;
  const car = (VEHICLES as Record<string, { name: string }>)[b.vehicle]?.name ?? b.vehicle;
  const cashDue = b.payment_method === "cash" ? Math.max(0, b.total - (b.amount_paid ?? 0)) : 0;
  const rows: [string, string][] = [
    ["From", b.pickup], [b.service_type === "hourly" ? "Service" : "To", b.service_type === "hourly" ? `${b.booked_hours ?? ""} hours with driver` : b.dropoff],
    ["Pickup", `${day(b.pickup_date)} ${b.pickup_time}`],
    ...(b.return_date && b.return_time ? [["Return", `${day(b.return_date)} ${b.return_time}`] as [string, string]] : []),
    ...(b.flight_number ? [["Flight", b.flight_number] as [string, string]] : []),
    ["Car", `${car} · ${b.passengers} people, ${b.luggage} bags`],
    ["Payment", cashDue ? `฿${cashDue.toLocaleString("en-US")} (Cash to driver)` : b.payment_status === "paid" || b.amount_paid >= b.total ? `฿${b.total.toLocaleString("en-US")} (Paid)` : `฿${b.total.toLocaleString("en-US")} (${b.payment_status === "pending" ? "Not paid yet" : b.payment_status})`],
  ];
  return { ok: true, booking: {
    reference: b.reference, status: b.status, statusText: STATUS[b.status] ?? b.status, leadName: `${b.customer_name} ${b.customer_surname ?? ""}`.trim(), rows, cashDue,
    driver: driver ? { name: driver.name, car: driver.car, plate: driver.plate, phone: soon ? driver.phone : null } : null,
    manageUrl: `${SITE_URL}/booking/manage`,
  } };
}
