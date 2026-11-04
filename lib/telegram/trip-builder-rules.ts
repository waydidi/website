// /trip and /place in the Admin group: staff type a trip (or a new place) and the bot builds it. Pure (no runtime
// imports) so the reading of staff text is unit tested directly (tests/trip-builder-rules.test.mjs). Staff text is
// read once here into checked values; the price is never guessed: no clear price in the message, no trip.
import type { PlaceHours } from "@/lib/google-hours";
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

// An amount never starts right after a digit, ":", "." or "," (so "08:30, THB 3,500" is one price, not 30 and 3,500).
const AMOUNT_NUM = "(?<![\\d:.,])((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)";
const AMOUNT = new RegExp(`(?:(?:THB|฿)\\s*${AMOUNT_NUM})|(?:${AMOUNT_NUM}\\s*(?:THB|บาท|baht|฿))`, "gi");
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

export { hoursFromGoogle, type GooglePeriod, type PlaceHours } from "@/lib/google-hours";

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
  "พิมพ์ /trip ตามด้วย จำนวนคน, วันที่, สถานที่ เรียงแบบไหนก็ได้ คั่นด้วยจุลภาค (,)",
  "",
  "<b>ต้องมี</b>",
  "• จำนวนคน เช่น 2, 2 people หรือ 2 adults 1 child",
  "• วันที่ เช่น 29 Nov, 29/11 หรือ 2026-11-29 (วันก่อนเดือน)",
  "• สถานที่ที่จะไป เรียงตามลำดับที่จะไป (ถ้ายังไม่มีในรายการ บอทจะเพิ่มจาก Google Maps)",
  "",
  "<b>ใส่เพิ่มได้</b>",
  "• ราคา เช่น THB 3,500 (ไม่ใส่ = ราคาตามเรทรายชั่วโมง)",
  "• จุดรับและเวลารับ เช่น pickup Hilton Patong 08:00 (ไม่ใส่ = รอยืนยัน ใส่ทีหลังได้)",
  "• รถ เช่น SUV หรือ Van, กระเป๋า เช่น 3 bags, ชั่วโมง เช่น 6 hours",
  "• จำนวนวัน เช่น 3 days (ทริปหลายวันเมื่อเปิด TRIP_MULTIDAY)",
  "",
  "<b>ตัวอย่าง</b>",
  "<code>/trip 2, 29 Nov, Big Buddha, Wat Chalong, Phuket Old Town</code>",
  "<code>/trip Big Buddha, Promthep Cape, 20 Dec 2026, 2 adults 1 child, SUV, THB 3,500</code>",
  "",
  "สถานที่ที่มีแพ็กเกจ บอทจะถามให้เลือกแพ็กเกจก่อนสร้างทริป",
  "",
  "<b>หรือวางแชตลูกค้า</b>",
  "วางหรือส่งต่อแชตของลูกค้าในกลุ่ม แล้วกดตอบกลับข้อความนั้นด้วย <code>/trip</code> (ใส่ราคาได้ เช่น <code>/trip THB 3,500</code> บอทไม่อ่านราคาจากแชตลูกค้า)",
].join("\n");
export const PLACE_HELP = "เพิ่มสถานที่: <code>/place ชื่อสถานที่ | 09:00-17:00 | พื้นที่ | 90 นาที</code>\nไม่ใส่เวลาเปิด บอทจะดึงเวลาเปิดจาก Google Maps ให้\nใส่เป็นคำบรรยายรูปได้ (ส่งรูปพร้อมพิมพ์ /place …) หรือตอบกลับข้อความยืนยันของบอทด้วยรูปเพื่อเพิ่มรูป";

/**
 * The hours a /trip day is charged when no price is typed: 5 or more places count as 10 hours, 4 places as 6 hours,
 * fewer as the hours the day takes (at least 3). A day that takes longer than that is charged the hours it takes.
 */
export function tripChargeHours(places: number, plannedHours: number) {
  const floor = places >= 5 ? 10 : places === 4 ? 6 : 3;
  return Math.min(16, Math.max(floor, Math.ceil(plannedHours)));
}

// ── Typed /trip, read without AI ─────────────────────────────────────────────────────────────────────────────
// Staff type the number of people, the date and the places in any order (docs: "/trip input template proposal").
// The date and the people are found by their shape wherever they are; the price, car, bags, days, hours and a pickup
// (a part with a time, or starting "pickup" / "รับ") are taken out too; every other comma-separated part is a place,
// in the order written. Nothing is guessed: a missing or doubled part is a problem named back to staff.

export type TypedTrip = {
  adults: number; children: number; tripDate: string; places: string[];
  bags: number | null; days: number | null; hours: number | null; pickupText: string; startTime: string | null;
};
export type TypedTripProblem =
  | { code: "no_date" } | { code: "two_dates"; dates: string[] } | { code: "past_date"; date: string }
  | { code: "no_people" } | { code: "two_people" } | { code: "no_places" } | { code: "too_many_places" } | { code: "long_place"; place: string };

const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const EN_MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const TH_MONTHS = [["ม.ค.", "มกราคม"], ["ก.พ.", "กุมภาพันธ์"], ["มี.ค.", "มีนาคม"], ["เม.ย.", "เมษายน"], ["พ.ค.", "พฤษภาคม"], ["มิ.ย.", "มิถุนายน"],
  ["ก.ค.", "กรกฎาคม"], ["ส.ค.", "สิงหาคม"], ["ก.ย.", "กันยายน"], ["ต.ค.", "ตุลาคม"], ["พ.ย.", "พฤศจิกายน"], ["ธ.ค.", "ธันวาคม"]];
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TH_MONTH = `(${TH_MONTHS.flat().sort((a, b) => b.length - a.length).map(escRe).join("|")})`;
const thMonthIndex = (m: string) => TH_MONTHS.findIndex((names) => names.includes(m));

/** A real calendar date as YYYY-MM-DD, or null. Two-digit years are 20xx; Buddhist years (2500+) are converted. */
function isoDate(y: number | null, month: number, day: number, today: string): { iso: string; yearGiven: boolean } | null {
  const yearGiven = y !== null;
  let year = y ?? Number(today.slice(0, 4));
  if (year < 100) year += 2000;
  if (year >= 2400) year -= 543;
  const make = (yr: number) => {
    const d = new Date(Date.UTC(yr, month - 1, day));
    return d.getUTCFullYear() === yr && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : null;
  };
  let iso = make(year);
  if (!iso) return null;
  // No year: the next such date from today.
  if (!yearGiven && iso < today) iso = make(year + 1);
  return iso ? { iso, yearGiven } : null;
}

const SEP = " , ";
const take = (text: string, re: RegExp, found: (m: RegExpExecArray) => void) => text.replace(re, (...args) => {
  const m = args.slice(0, -2) as unknown as RegExpExecArray;
  found(m);
  return SEP;
});

/** The car words /trip knows (the same as pickVehicle): a part that is only a car is not a place. */
const CAR_ONLY = /^(?:by\s+)?(?:an?\s+)?(?:mini\s*van|minivan|van|commuter|alphard|suv|fortuner|pajero|bmw|economy|sedan|camry|altis|รถตู้|ฟอร์จูนเนอร์|รถเก๋ง)(?:\s+car)?$/iu;
const FILLER = /^(?:and|then|to|&|และ|date|วันที่|price|ราคา|total|รวม|people|pax)$/iu;
const CLOCK = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm|น\.?)?|\b(1[0-2]|0?[1-9])\s*(am|pm)\b/iu;

/** Reads a typed /trip (the text after the command). Pure; `today` is the Thailand date (YYYY-MM-DD). */
export function parseTypedTrip(details: string, today: string): { ok: true; trip: TypedTrip } | { ok: false; problem: TypedTripProblem } {
  // Prices first (they hold commas, "THB 3,500"); the price itself is read by parseStaffPrice.
  const NUM = "(?<![\\d:.,])(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
  let text = details.replace(new RegExp(`(?:\\b(?:price|total|cost|car|tickets?)\\b|ราคา|รวม)?\\s*:?\\s*(?:(?:THB|฿)\\s*${NUM}|${NUM}\\s*(?:THB|บาท|baht|฿))`, "giu"), SEP)
    .replace(/\b(?:date|on)\s*:?\s*(?=\d)|วันที่\s*(?=\d)/giu, " ");

  // Dates, anywhere: 2026-11-29, 29/11(/2026), 29 Nov (2026), Nov 29 (2026), 29 พ.ย. (2569).
  const dates: { iso: string; yearGiven: boolean }[] = [];
  const add = (y: string | undefined, mo: number, d: string) => { const r = isoDate(y ? Number(y) : null, mo, Number(d), today); if (r) dates.push(r); };
  text = take(text, /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => add(m[1], Number(m[2]), m[3]));
  text = take(text, /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g, (m) => add(m[3], Number(m[2]), m[1]));
  text = take(text, new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${EN_MONTH}\\.?(?:\\s*,?\\s*(\\d{4}))?(?![\\p{L}])`, "giu"), (m) => add(m[3], EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, m[1]));
  text = take(text, new RegExp(`\\b${EN_MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, "giu"), (m) => add(m[3], EN_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, m[2]));
  text = take(text, new RegExp(`(\\d{1,2})\\s*${TH_MONTH}(?:\\s*(\\d{4}))?`, "gu"), (m) => add(m[3], thMonthIndex(m[2]) + 1, m[1]));
  const distinct = [...new Map(dates.map((d) => [d.iso, d])).values()];
  if (distinct.length > 1) return { ok: false, problem: { code: "two_dates", dates: distinct.map((d) => d.iso) } };
  if (!distinct.length) return { ok: false, problem: { code: "no_date" } };
  if (distinct[0].iso < today) return { ok: false, problem: { code: "past_date", date: distinct[0].iso } };

  // People: "2 adults 1 child", "ผู้ใหญ่ 2 เด็ก 1", "2 people / pax / คน", or a number alone between commas (below).
  const adults: number[] = [], children: number[] = [], groups: number[] = [];
  text = take(text, /(\d{1,2})\s*(?:adults?|ผู้ใหญ่)|ผู้ใหญ่\s*(\d{1,2})/giu, (m) => { adults.push(Number(m[1] ?? m[2])); });
  text = take(text, /(\d{1,2})\s*(?:child(?:ren)?|kids?|เด็ก)|เด็ก\s*(\d{1,2})/giu, (m) => { children.push(Number(m[1] ?? m[2])); });
  text = take(text, /(\d{1,2})\s*(?:people|persons?|pax|guests?|travell?ers?|คน|ท่าน)(?![\p{L}])/giu, (m) => { groups.push(Number(m[1])); });

  // Bags, days and hours are optional; they are never places.
  const extra: { bags: number | null; days: number | null; hours: number | null } = { bags: null, days: null, hours: null };
  text = take(text, /(\d{1,2})\s*(?:bags?|luggage|suitcases?|กระเป๋า)(?![\p{L}])/giu, (m) => { extra.bags = Number(m[1]); });
  text = take(text, /(\d{1,2})\s*(?:days?|วัน)(?![\p{L}])/giu, (m) => { extra.days = Number(m[1]); });
  text = take(text, /(\d{1,2})\s*(?:hours?|hrs?|ชม\.?|ชั่วโมง)(?![\p{L}])/giu, (m) => { extra.hours = Number(m[1]); });

  // What is left, part by part: the pickup (a part starting "pickup" / "รับ", or with a clock time: a place to visit
  // has no time), a plain number (people), a car word or filler (skipped), else a place.
  let pickupText = "", startTime: string | null = null;
  const places: string[] = [], seen = new Set<string>();
  for (const raw of text.split(/[\n,;]+/)) {
    const part = raw.replace(/^[\s.&\-–—:]+|[\s.&\-–—:]+$/g, "").replace(/\s+/g, " ").replace(/^(?:and|then|to|และ)\s+/i, "");
    if (!part || FILLER.test(part) || CAR_ONLY.test(part)) continue;
    if (/^\d{1,2}$/.test(part)) { groups.push(Number(part)); continue; }
    const keyword = /^(?:pick\s*-?\s*up|รับที่|รับ)(?:\s*(?:at|from|ที่))?\s*:?\s*/iu.exec(part);
    const clock = CLOCK.exec(part);
    if (!pickupText && !startTime && (keyword || clock)) {
      if (clock) {
        let h = Number(clock[1] ?? clock[4]); const min = Number(clock[2] ?? 0), ap = (clock[3] ?? clock[5] ?? "").toLowerCase();
        if (ap === "pm" && h < 12) h += 12;
        if (ap === "am" && h === 12) h = 0;
        startTime = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
      pickupText = part.replace(keyword?.[0] ?? "", "").replace(CLOCK, "").replace(/\s+(?:at|@)\s*$/i, "").replace(/\s+/g, " ").trim().slice(0, 300);
      continue;
    }
    const key = placeKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    places.push(part.slice(0, 120));
  }

  // A sentence is not a place ("recommendation tour package for … as they requested"): places are short names.
  const long = places.find((p) => p.split(" ").length > 7);
  if (long) return { ok: false, problem: { code: "long_place", place: long } };
  // One number of people. "3 people, 1 child" = 2 adults and 1 child; adults given must add up with the group.
  if (adults.length > 1 || children.length > 1 || groups.length > 1) return { ok: false, problem: { code: "two_people" } };
  const childCount = children[0] ?? 0;
  const adultCount = adults.length ? adults[0] : groups.length ? groups[0] - childCount : 0;
  if (groups.length && adults.length && groups[0] !== adultCount + childCount) return { ok: false, problem: { code: "two_people" } };
  if (adultCount < 0) return { ok: false, problem: { code: "two_people" } };
  if (adultCount + childCount === 0) return { ok: false, problem: { code: "no_people" } };
  if (!places.length) return { ok: false, problem: { code: "no_places" } };
  if (places.length > 10) return { ok: false, problem: { code: "too_many_places" } };
  return { ok: true, trip: { adults: adultCount, children: childCount, tripDate: distinct[0].iso, places, ...extra, pickupText, startTime } };
}

/**
 * A typed place name matched to a listed place: exactly (matchPlace), else the one listed place whose name contains the
 * typed words as whole words, or whose words are all in the typed name ("Elephant Sanctuary" → "Phuket Elephant
 * Sanctuary", "Big Buddha Phuket" → "Big Buddha"). Two candidates, or a one-word name: no match (Google decides).
 */
export function looseMatchPlace<T extends { name: string; customerName: string | null; createdAt: string }>(name: string, rows: T[]): T | null {
  const exact = matchPlace(name, rows);
  if (exact) return exact;
  const typed = placeKey(name);
  if (typed.split(" ").length < 2) return null;
  const within = (a: string, b: string) => ` ${b} `.includes(` ${a} `);
  const hits = rows.filter((r) => [r.name, r.customerName ?? ""].filter(Boolean).some((n) => {
    const listed = placeKey(n);
    return listed.split(" ").length >= 2 && (within(typed, listed) || within(listed, typed));
  }));
  return hits.length === 1 ? hits[0] : null;
}

/** The two places furthest apart (km, straight line), for the "places far apart" check. */
export function farthestPair(points: { name: string; lat: number | null; lng: number | null }[]): { a: string; b: string; km: number } | null {
  const ok = points.filter((p): p is { name: string; lat: number; lng: number } => typeof p.lat === "number" && typeof p.lng === "number");
  let best: { a: string; b: string; km: number } | null = null;
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const r = Math.PI / 180, dLat = (ok[j].lat - ok[i].lat) * r, dLng = (ok[j].lng - ok[i].lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(ok[i].lat * r) * Math.cos(ok[j].lat * r) * Math.sin(dLng / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.sqrt(h));
    if (!best || km > best.km) best = { a: ok[i].name, b: ok[j].name, km };
  }
  return best;
}
/** Places further apart than this can't be one day trip. */
export const FAR_APART_KM = 200;

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-29" → "29 Nov 2026": the month spelled out, so a day/month mix-up is easy to see. */
export const spellDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** The Thai reply when a typed /trip can't be read: what is wrong, then one example. */
export function typedTripProblemTh(problem: TypedTripProblem): string {
  const why = problem.code === "no_date" ? "ใส่วันที่ เช่น 29 Nov"
    : problem.code === "two_dates" ? `พบวันที่ ${problem.dates.length} วัน (${problem.dates.map(spellDate).join(", ")}) ใส่วันเดียว`
    : problem.code === "past_date" ? `วันที่ ${spellDate(problem.date)} ผ่านมาแล้ว`
    : problem.code === "no_people" ? "ใส่จำนวนคน เช่น 2 people หรือ 2 adults 1 child"
    : problem.code === "two_people" ? "พบจำนวนคนมากกว่าหนึ่งแบบ ใส่จำนวนคนครั้งเดียว เช่น 2 adults 1 child"
    : problem.code === "no_places" ? "ใส่สถานที่อย่างน้อย 1 แห่ง"
    : problem.code === "too_many_places" ? "ใส่สถานที่ได้ไม่เกิน 10 แห่ง"
    : `"${escHtml(problem.place.slice(0, 80))}" ยาวเกินไปสำหรับชื่อสถานที่ แยกแต่ละสถานที่ด้วยจุลภาค (,)`;
  return `⚠️ ยังไม่ได้สร้างทริป: ${why}\nตัวอย่าง: <code>/trip 2, 29 Nov, Big Buddha, Wat Chalong</code> (ดูวิธีเขียน: <code>/trip help</code>)`;
}

/** The Thai reply when two places can't be one day trip. */
export const farApartTh = (far: { a: string; b: string; km: number }) =>
  `⚠️ ยังไม่ได้สร้างทริป: ${escHtml(far.a)} กับ ${escHtml(far.b)} ห่างกันประมาณ ${Math.round(far.km).toLocaleString("en-US")} กม. ไปในวันเดียวไม่ได้ ตรวจชื่อสถานที่อีกครั้ง`;
