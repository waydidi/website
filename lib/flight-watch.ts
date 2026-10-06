import { env } from "cloudflare:workers";
import { flightApiConfigured, flightStatus, type FlightStatus } from "@/lib/aerodatabox";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";
import { airportByCode, cleanFlightNumber } from "@/lib/thai-flights";

// Watches the flights of upcoming airport pickups. Every 15 minutes, from 6 hours before pickup until
// 2 hours after, each booking's flight is checked (saved results are reused, so a flight shared by
// several bookings costs one call). When the landing time moves 30+ minutes from the pickup time, or
// the flight is cancelled or diverted, the team gets a ⚠️ notice in Thai on that booking's card.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<unknown> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SHIFT = 30; // minutes between pickup time and landing that is worth telling the team about
const MOVED = 20; // a later notice only when the landing time moves this much again

type Row = { reference: string; flight_number: string; pickup_date: string; pickup_time: string; pickup: string; card_id: number | null; last_eta: string | null; last_status: string | null };
const clock = (local: string | null) => local?.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
const toMin = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00Z`) / 60000;

/** The leg landing in Thailand (for a flight number with stops). */
const thaiArrival = (flights: FlightStatus[]) => flights.find((f) => f.arrival.iata && airportByCode(f.arrival.iata)) ?? null;

export async function watchBookingFlights(at: Date) {
  if (!flightApiConfigured() || !telegramConfigured()) return;
  if (at.getUTCMinutes() % 15 !== 0) return;
  // Pickup times are Thailand time; compare in "Bangkok minutes".
  const nowBkk = (at.getTime() + 7 * 3600_000) / 60000;
  const today = new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(at.getTime() + 31 * 3600_000).toISOString().slice(0, 10);
  const { results } = await db().prepare(`SELECT b.reference,b.flight_number,b.pickup_date,b.pickup_time,b.pickup,c.telegram_message_id card_id,w.last_eta,w.last_status
    FROM bookings b LEFT JOIN telegram_booking_cards c ON c.booking_reference=b.reference LEFT JOIN flight_watch w ON w.booking_reference=b.reference
    WHERE b.status='confirmed' AND b.flight_number IS NOT NULL AND TRIM(b.flight_number)<>'' AND b.pickup_date IN (?,?) LIMIT 50`).bind(today, tomorrow).all<Row>();
  for (const b of results) {
    const pickupMin = toMin(b.pickup_date, b.pickup_time);
    if (nowBkk < pickupMin - 6 * 60 || nowBkk > pickupMin + 2 * 60) continue;
    const no = cleanFlightNumber(b.flight_number);
    if (!no) continue;
    let leg: FlightStatus | null = null;
    // The flight may have left the day before (overnight international flights).
    for (const day of [b.pickup_date, new Date(Date.parse(`${b.pickup_date}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10)]) {
      try { leg = thaiArrival(await flightStatus(no, day)); } catch { leg = null; }
      if (leg && clock(leg.arrival.scheduled)?.[1] === b.pickup_date) break;
      leg = null;
    }
    const now = new Date().toISOString();
    await db().prepare("INSERT INTO flight_watch(booking_reference,flight_number,checked_at) VALUES(?,?,?) ON CONFLICT(booking_reference) DO UPDATE SET checked_at=excluded.checked_at,flight_number=excluded.flight_number").bind(b.reference, no, now).run();
    if (!leg) continue;
    const eta = clock(leg.arrival.actual ?? leg.arrival.revised ?? leg.arrival.scheduled);
    if (!eta) continue;
    const etaText = `${eta[1]} ${eta[2]}`;
    const shift = toMin(eta[1], eta[2]) - pickupMin;
    const bad = /Canceled|Diverted/.test(leg.status);
    const lastShift = b.last_eta ? toMin(b.last_eta.slice(0, 10), b.last_eta.slice(11, 16)) - pickupMin : 0;
    const worth = bad ? b.last_status !== leg.status : Math.abs(shift) >= SHIFT && Math.abs(shift - lastShift) >= MOVED;
    if (!worth) continue;
    const what = bad ? (/Canceled/.test(leg.status) ? "เที่ยวบินถูกยกเลิก" : "เที่ยวบินเปลี่ยนเส้นทาง")
      : shift > 0 ? `เครื่องลงช้ากว่าเวลารับ ${Math.round(shift)} นาที` : `เครื่องลงเร็วกว่าเวลารับ ${Math.round(-shift)} นาที`;
    const text = [
      `⚠️ ${what}`, "",
      `การจอง: ${esc(b.reference)}`,
      `ไฟลท์: ${esc(no)}${leg.arrival.iata ? ` (ลงที่ ${esc(leg.arrival.iata)}${leg.arrival.terminal ? ` อาคาร ${esc(leg.arrival.terminal)}` : ""})` : ""}`,
      `เวลารับเดิม: ${esc(b.pickup_time)}`,
      bad ? `สถานะ: ${esc(leg.status)}` : `เครื่องลงโดยประมาณ: ${esc(eta[2])}`,
      "", bad ? "กรุณาติดต่อลูกค้าก่อนออกรับ" : "กรุณาแจ้งคนขับและปรับเวลาออกรับ",
    ].join("\n");
    try {
      await sendCard(text, undefined, b.card_id ?? undefined);
      await db().prepare("UPDATE flight_watch SET last_eta=?,last_status=?,notified_at=? WHERE booking_reference=?").bind(etaText, leg.status, now, b.reference).run();
    } catch (e) { console.error("flight watch notice failed", e instanceof Error ? e.message : "unknown"); }
  }
}
