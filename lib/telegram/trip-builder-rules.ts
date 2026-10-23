// /trip and /place in the Admin group: staff type a trip (or a new place) and the bot builds it. Pure (no runtime
// imports) so the reading of staff text is unit tested directly (tests/trip-builder-rules.test.mjs). Staff text is
// read once here into checked values; the price is never guessed: no clear price in the message, no trip.
import { placeKey } from "@/lib/trip-chat-rules";
import { smallestFittingVehicle, vehicleFits, type VehicleId } from "@/lib/vehicles";

/** `/trip <details>` (also `/trip@BotName`): the details, "" when only the command was sent, null when it is not /trip. */
export function parseTripCommand(message: string): string | null {
  const m = /^\/trip(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.trim());
  return m ? (m[1] ?? "").trim() : null;
}

/** `/place <details>` (also as a photo caption): the details, "" when only the command was sent, null otherwise. */
export function parsePlaceCommand(message: string): string | null {
  const m = /^\/place(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.trim());
  return m ? (m[1] ?? "").trim() : null;
}

const AMOUNT = /(?:(?:THB|฿)\s*(\d[\d,]*(?:\.\d+)?))|(?:(\d[\d,]*(?:\.\d+)?)\s*(?:THB|บาท|baht|฿))/gi;
const PRICE_WORD = /(price|ราคา|total|รวม|cost)\W{0,3}$/i;

/**
 * The trip price staff typed, in whole baht. It must carry a currency (THB, ฿, บาท, baht). When several different
 * amounts appear, the one labelled "price" / "ราคา" / "total" wins; otherwise the message is ambiguous.
 */
export function parseStaffPrice(text: string): { ok: true; thb: number } | { ok: false; reason: "missing" | "ambiguous"; amounts: number[] } {
  const found: { thb: number; labelled: boolean }[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const thb = Math.round(Number((m[1] ?? m[2]).replace(/,/g, "")));
    if (!Number.isFinite(thb) || thb <= 0 || thb > 1_000_000) continue;
    found.push({ thb, labelled: PRICE_WORD.test(text.slice(Math.max(0, (m.index ?? 0) - 16), m.index)) });
  }
  const amounts = [...new Set(found.map((f) => f.thb))];
  if (!amounts.length) return { ok: false, reason: "missing", amounts };
  if (amounts.length === 1) return { ok: true, thb: amounts[0] };
  const labelled = [...new Set(found.filter((f) => f.labelled).map((f) => f.thb))];
  return labelled.length === 1 ? { ok: true, thb: labelled[0] } : { ok: false, reason: "ambiguous", amounts };
}

const VEHICLE_WORDS: [RegExp, VehicleId][] = [
  [/\b(mini\s*van|minivan|van|commuter|alphard)\b|รถตู้/i, "premium_minivan"],
  [/\b(suv|fortuner|pajero)\b|ฟอร์จูนเนอร์/i, "comfort_suv"],
  [/\bbmw\b/i, "comfort_bmw"],
  [/\b(economy|sedan|camry|altis)\b|รถเก๋ง/i, "economy_sedan"],
];

/** The car staff named, or else the smallest car that fits the group; not ok when the named car is too small. */
export function pickVehicle(text: string, passengers: number, bags: number): { ok: true; vehicle: VehicleId } | { ok: false; vehicle: VehicleId | null } {
  const named = VEHICLE_WORDS.find(([re]) => re.test(text))?.[1];
  if (named) return vehicleFits(named, passengers, bags) ? { ok: true, vehicle: named } : { ok: false, vehicle: named };
  const smallest = smallestFittingVehicle(passengers, bags);
  return smallest ? { ok: true, vehicle: smallest } : { ok: false, vehicle: null };
}

export type PlaceDetails = { name: string; openTime: string | null; closeTime: string | null; durationMin: number | null; area: string };

const pad = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
function clock(raw: string): string | null {
  const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|น\.?)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0), ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h <= 24 && min < 60 ? pad(h === 24 ? 23 : h, h === 24 ? 59 : min) : null;
}

/** "09:00-17:00", "9-17", "8.30–16.30", "9am - 5pm", "24 hours" / "24 ชม." → open and close times. */
export function parseOpeningHours(raw: string): { openTime: string; closeTime: string } | null {
  const text = raw.replace(/^(open|opening hours|hours|เปิด|เวลาเปิด)\s*:?\s*/i, "").trim();
  if (/^(24\s*(h|hrs?|hours?|ชม\.?|ชั่วโมง)|open 24)/i.test(text)) return { openTime: "00:00", closeTime: "23:59" };
  const m = /^(.+?)\s*(?:-|–|—|to|ถึง)\s*(.+)$/i.exec(text);
  if (!m) return null;
  const open = clock(m[1]), close = clock(m[2]);
  return open && close && open < close ? { openTime: open, closeTime: close } : null;
}

/** One period of Google Places `regularOpeningHours` (day 0 is Sunday, as in the trip planner). */
export type GooglePeriod = { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };
export type PlaceHours = { openTime: string; closeTime: string; closedDays: number[]; varies: boolean };

const minutesOf = (t: { hour?: number; minute?: number } | undefined) => {
  const h = t?.hour ?? 0, m = t?.minute ?? 0;
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 24 && m >= 0 && m < 60 ? Math.min(h * 60 + m, 1439) : null;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Google's weekly opening hours as the one open and close time an attraction keeps: the hours most days have (a
 * lunch break is bridged, past midnight ends at 23:59), the days with no hours as closed days, and `varies` when the
 * open days do not all share those hours. Null when Google gives none.
 */
export function hoursFromGoogle(periods: GooglePeriod[] | undefined): PlaceHours | null {
  if (!Array.isArray(periods) || !periods.length) return null;
  // Open 24 hours: a single period that opens and never closes.
  if (periods.length === 1 && periods[0]?.open && !periods[0].close) return { openTime: "00:00", closeTime: "23:59", closedDays: [], varies: false };
  const days = new Map<number, { open: number; close: number }>();
  for (const p of periods) {
    const day = p?.open?.day, open = minutesOf(p?.open);
    if (!Number.isInteger(day) || day! < 0 || day! > 6 || open === null || !p.close) continue;
    let close = minutesOf(p.close);
    if (close === null) continue;
    if (p.close.day !== day || close <= open) close = 1439;
    const seen = days.get(day!);
    days.set(day!, seen ? { open: Math.min(seen.open, open), close: Math.max(seen.close, close) } : { open, close });
  }
  if (!days.size) return null;
  const counts = new Map<string, number>();
  for (const { open, close } of days.values()) counts.set(`${open}-${close}`, (counts.get(`${open}-${close}`) ?? 0) + 1);
  // The most common hours; on a tie, the earliest weekday's (Monday first).
  let best = "", most = 0;
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const v = days.get(d); if (!v) continue;
    const k = `${v.open}-${v.close}`, n = counts.get(k)!;
    if (n > most) { best = k; most = n; }
  }
  const [open, close] = best.split("-").map(Number);
  return { openTime: hhmm(open), closeTime: hhmm(close), closedDays: [0, 1, 2, 3, 4, 5, 6].filter((d) => !days.has(d)), varies: counts.size > 1 };
}

const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

/** The hours line of a /place confirmation, saying when they came from Google Maps and when they differ by day. */
export function placeHoursLineTh(hours: { openTime: string | null; closeTime: string | null; closedDays: number[] }, fromGoogle: PlaceHours | null): string {
  if (!hours.openTime || !hours.closeTime) return "ยังไม่มีเวลาเปิด (ไม่พบใน Google Maps ใส่เองได้: /place ชื่อ | 09:00-17:00)";
  const closed = hours.closedDays.length ? ` · ปิดวัน${hours.closedDays.map((d) => TH_DAYS[d]).join(", ")}` : "";
  const source = fromGoogle ? ` (จาก Google Maps${fromGoogle.varies ? " · เวลาไม่เท่ากันทุกวัน ตรวจที่ Admin → Attractions" : ""})` : "";
  return `เปิด ${hours.openTime}–${hours.closeTime}${closed}${source}`;
}

/** "90 min", "90 นาที", "2 hr", "1.5 ชม." → minutes (5 to 720). */
export function parseDuration(raw: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(min|mins|minutes?|นาที|h|hr|hrs|hours?|ชม\.?|ชั่วโมง)$/i.exec(raw.trim());
  if (!m) return null;
  const minutes = Math.round(Number(m[1]) * (/^(min|นาที)/i.test(m[2]) ? 1 : 60));
  return minutes >= 5 && minutes <= 720 ? minutes : null;
}

/**
 * `/place <name> | <opening hours> | <area> | <time spent>`: only the name is required, and the other parts are
 * recognised by their shape in any order. Null when there is no usable name.
 */
export function parsePlaceDetails(details: string): PlaceDetails | null {
  const parts = details.split(/\s*[|\n]\s*/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const name = (parts.shift() ?? "").slice(0, 120);
  if (name.length < 2) return null;
  let hours: ReturnType<typeof parseOpeningHours> = null, durationMin: number | null = null, area = "";
  for (const p of parts) {
    const h = parseOpeningHours(p), d = parseDuration(p);
    if (h && !hours) hours = h;
    else if (d && !durationMin) durationMin = d;
    else if (!area) area = p.slice(0, 60);
  }
  return { name, openTime: hours?.openTime ?? null, closeTime: hours?.closeTime ?? null, durationMin, area };
}

export { placeKey }; // shared with the chat-to-trip reader (lib/trip-chat-rules.ts)

/**
 * The existing attraction a /place name means, so photos and hours go to the place trips already use instead of a
 * duplicate: the same name (any case) first, else the same once brackets and "The" are dropped ("Wat Pho" is
 * "Wat Pho (Reclining Buddha)"), the oldest when several fit. Null when none does.
 */
export function matchPlace<T extends { name: string; customerName: string | null; createdAt: string }>(name: string, rows: T[]): T | null {
  const names = (r: T) => [r.name, r.customerName ?? ""].filter(Boolean);
  const oldest = (xs: T[]) => [...xs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const lower = name.trim().toLowerCase(), key = placeKey(name);
  return oldest(rows.filter((r) => names(r).some((n) => n.trim().toLowerCase() === lower)))
    ?? (key ? oldest(rows.filter((r) => names(r).some((n) => placeKey(n) === key))) : null);
}

export const tripBuilderOn = (vars: Record<string, string | undefined>) => vars.TELEGRAM_TRIP_BUILDER === "1";
/** /trip builds several days when the places need them (Worker variable TRIP_MULTIDAY=1; off until the owner turns it on). */
export const tripMultidayOn = (vars: Record<string, string | undefined>) => vars.TRIP_MULTIDAY === "1";

export type PackageOption = { programId: string; session: string | null; label: string };
type PackageLike = { id: string; name: string; durationMin: number; feeAdult?: number; feeChild?: number; sessions: { time: string }[] };

/**
 * The buttons staff choose from when a place in a /trip has packages: one per package and start time (a package with
 * no start time is one button), with its length and price per person. At most 12, so the question stays readable.
 */
export function packageOptions(programs: PackageLike[]): PackageOption[] {
  const out: PackageOption[] = [];
  for (const p of programs) {
    const hours = p.durationMin >= 60 ? `${Math.round((p.durationMin / 60) * 10) / 10} ชม.` : `${p.durationMin} นาที`;
    const price = p.feeAdult ? ` · ${p.feeAdult.toLocaleString("en-US")} บาท/คน` : "";
    const times = [...new Set(p.sessions.map((s) => s.time))].sort();
    for (const time of times.length ? times : [null]) out.push({ programId: p.id, session: time, label: `${p.name}${time ? ` ${time}` : ""} · ${hours}${price}`.slice(0, 60) });
  }
  return out.slice(0, 12);
}

/** Thai words for the parts the AI could not find in the message. */
export const MISSING_TH: Record<string, string> = { date: "วันที่", "pickup place": "จุดรับ", places: "สถานที่" };
/** What /trip cannot be built without: the date and at least one place (the pickup hotel can follow later). */
export const BLOCKING = ["date", "places"];

/**
 * True when the text after /trip is a request for help rather than a trip, e.g. "/trip", "/trip help" or "/trip create
 * a new trip": a trip always has a date, a pickup time and a price, so text with no digits at all cannot be one.
 */
export function wantsTripGuide(details: string): boolean {
  const text = details.trim();
  return !text || /^((help|how|guide)\b|\?|วิธี|ช่วย|คู่มือ)/i.test(text) || !/[0-9\u0E50-\u0E59]/.test(text);
}

/**
 * The text the AI reads for a /trip: the customer chat staff replied to (pasted or forwarded into the group), with the
 * staff's own /trip line as a note; or just the /trip line. The price never comes from here: it is read from the staff's
 * /trip line alone (parseStaffPrice), so a price the customer mentioned is never used.
 */
export function tripText(staffLine: string, repliedChat: string): string {
  const chat = repliedChat.trim();
  return chat ? `${chat}\n\n(Staff note: ${staffLine.trim() || "none"})` : staffLine.trim();
}

/** What staff need to type after /trip (Thai, for the Admin group). */
export const TRIP_HELP = [
  "📝 <b>วิธีสร้างทริปผ่าน Telegram</b>",
  "พิมพ์ /trip ตามด้วยรายละเอียดในข้อความเดียว เขียนแบบไหนก็ได้",
  "",
  "<b>ต้องมี</b>",
  "• วันที่ เช่น 29 Nov 2026 หรือ 29/11",
  "• สถานที่ที่จะไป เช่น Big Buddha, Wat Chalong (ถ้ายังไม่มีในรายการ บอทจะเพิ่มจาก Google Maps ให้)",
  "",
  "<b>ใส่เพิ่มได้</b>",
  "• ราคา เช่น THB 3,500 (ไม่ใส่ = ราคาตามเรทรายชั่วโมง)",
  "• จุดรับและเวลารับ เช่น Hilton Patong 08:00 (ไม่ใส่ = รอยืนยัน ใส่ทีหลังได้)",
  "• จำนวนคน เช่น 2 people หรือ 2 adults 1 child",
  "• รถ เช่น SUV หรือ Van และจำนวนกระเป๋า",
  "• จำนวนวัน เช่น 3 days (ทริปหลายวันเมื่อเปิด TRIP_MULTIDAY)",
  "",
  "<b>ตัวอย่าง</b>",
  "<code>/trip Big Buddha, Phuket Old Town, Wat Chalong, Promthep Cape 29 Nov 2026, 2 people</code>",
  "",
  "สถานที่ที่มีแพ็กเกจ บอทจะถามให้เลือกแพ็กเกจก่อนสร้างทริป",
  "",
  "<b>หรือวางแชตลูกค้า</b>",
  "วางหรือส่งต่อแชตของลูกค้าในกลุ่ม แล้วกดตอบกลับข้อความนั้นด้วย <code>/trip</code> (ใส่ราคาได้ เช่น <code>/trip THB 3,500</code> บอทไม่อ่านราคาจากแชตลูกค้า)",
].join("\n");
export const PLACE_HELP = "เพิ่มสถานที่: <code>/place ชื่อสถานที่ | 09:00-17:00 | พื้นที่ | 90 นาที</code>\nไม่ใส่เวลาเปิด บอทจะดึงเวลาเปิดจาก Google Maps ให้\nใส่เป็นคำบรรยายรูปได้ (ส่งรูปพร้อมพิมพ์ /place …) หรือตอบกลับข้อความยืนยันของบอทด้วยรูปเพื่อเพิ่มรูป";
