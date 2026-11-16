// /add_trip and /add_attraction in the Admin group: staff type a trip (or a new place) and the bot builds it. Pure (no runtime
// imports) so the reading of staff text is unit tested directly (tests/trip-builder-rules.test.mjs). Staff text is
// read once here into checked values; the price is never guessed: no clear price in the message, no trip.
import type { PlaceHours } from "@/lib/google-hours";
import { placeKey } from "@/lib/trip-chat-rules";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";
import { BEST_TIMES, PLACE_AREAS, PLACE_TYPES, PLACE_TYPE_LABEL, VIBES, type PlaceType } from "@/lib/place-taxonomy";
import { areaOf, categoryOfWord, readTags, type PlaceTags } from "@/lib/place-words";

/** `/add_trip <details>` (also `/add_trip@BotName`): the details, "" when only the command was sent, null when it is not /add_trip. */
export function parseTripCommand(message: string): string | null {
  // /add_trip (owner, 2026-11-16); the older /trip still works.
  const m = /^\/(?:add_trip|trip)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.trim());
  return m ? (m[1] ?? "").trim() : null;
}

/** `/add_attraction <details>` (also as a photo caption): the details, "" when only the command was sent, null otherwise. */
export function parsePlaceCommand(message: string): string | null {
  // /add_attraction (owner, 2026-11-16); the older /place still works.
  const m = /^\/(?:add_attraction|place)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.trim());
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

/** The owner's /add_trip car rule by number of people: 1–2 sedan, 3–4 SUV, 5–10 van (the van seats 10 at most). */
export function carForPeople(people: number): VehicleId | null {
  if (people >= 1 && people <= 2) return "economy_sedan";
  if (people <= 4) return people >= 1 ? "comfort_suv" : null;
  if (people <= VEHICLES.premium_minivan.passengers) return "premium_minivan";
  return null;
}

/** The car staff named when it seats the group, or else the car for the number of people; not ok when the named car is too small or the group is too big. */
export function pickVehicle(text: string, passengers: number): { ok: true; vehicle: VehicleId; named: boolean } | { ok: false; vehicle: VehicleId | null } {
  const named = VEHICLE_WORDS.find(([re]) => re.test(text))?.[1];
  if (named) return passengers <= VEHICLES[named].passengers ? { ok: true, vehicle: named, named: true } : { ok: false, vehicle: named };
  const car = carForPeople(passengers);
  return car ? { ok: true, vehicle: car, named: false } : { ok: false, vehicle: null };
}

export type PlaceDetails = { name: string; openTime: string | null; closeTime: string | null; durationMin: number | null;
  /** One of PLACE_AREAS, or "" when none was typed. */
  area: string;
  /** A beach or district typed instead of the area ("Patong"): kept as the place's neighbourhood. */
  neighbourhood: string | null;
  category: PlaceType | null; bestTime: PlaceTags["bestTime"]; vibes: PlaceTags["vibes"];
  /** Parts that are none of the above (an area not on the list, a misspelt category, an unknown #tag): told back to staff. */
  unknown: string[] };

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

/** The hours line of a /add_attraction confirmation, saying when they came from Google Maps and when they differ by day. */
export function placeHoursLineTh(hours: { openTime: string | null; closeTime: string | null; closedDays: number[] }, fromGoogle: PlaceHours | null): string {
  if (!hours.openTime || !hours.closeTime) return "ยังไม่มีเวลาเปิด (ไม่พบใน Google Maps ใส่เองได้: /add_attraction ชื่อ | 09:00-17:00)";
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
 * `/add_attraction <name> | <opening hours> | <area> | <time spent>`: only the name is required, and the other parts are
 * recognised by their shape in any order. Null when there is no usable name.
 */
/**
 * "/add_attraction Big Buddha | temple | Phuket | 07:00-17:00 | 60 min #sunset #instagram": the name first, then in any order the
 * opening hours, the time spent, a category word, the area (or a beach or district in it, kept as the neighbourhood)
 * and #tags (best time and vibes). Anything else is returned in "unknown" so staff are told, never guessed.
 */
export function parsePlaceDetails(details: string): PlaceDetails | null {
  const tagText = (details.match(/#[\p{L}\p{N}-]+/gu) ?? []).join(" ");
  const parts = details.replace(/#[\p{L}\p{N}-]+/gu, " ").split(/\s*[|\n]\s*/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const name = (parts.shift() ?? "").slice(0, 120);
  if (name.length < 2) return null;
  let hours: ReturnType<typeof parseOpeningHours> = null, durationMin: number | null = null, area = "", neighbourhood: string | null = null, category: PlaceType | null = null;
  const unknown: string[] = [];
  for (const p of parts) {
    const h = parseOpeningHours(p), d = parseDuration(p), c = categoryOfWord(p), a = areaOf(p);
    if (h && !hours) hours = h;
    else if (d && !durationMin) durationMin = d;
    else if (c && !category) category = c;
    else if (a && !area) { area = a; if (a.toLowerCase() !== p.toLowerCase()) neighbourhood = p.slice(0, 60); }
    else unknown.push(p.slice(0, 60));
  }
  const tags = readTags(tagText);
  return { name, openTime: hours?.openTime ?? null, closeTime: hours?.closeTime ?? null, durationMin, area, neighbourhood, category, bestTime: tags.bestTime, vibes: tags.vibes,
    unknown: [...unknown, ...tags.unknown.map((t) => `#${t}`)] };
}

export { placeKey }; // shared with the chat-to-trip reader (lib/trip-chat-rules.ts)

/**
 * The existing attraction a /add_attraction name means, so photos and hours go to the place trips already use instead of a
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
/** /add_trip builds several days when the places need them (Worker variable TRIP_MULTIDAY=1; off until the owner turns it on). */
export const tripMultidayOn = (vars: Record<string, string | undefined>) => vars.TRIP_MULTIDAY === "1";

export type PackageOption = { programId: string; session: string | null; label: string };
type PackageLike = { id: string; name: string; durationMin: number; feeAdult?: number; feeChild?: number; sessions: { time: string }[] };

/**
 * The buttons staff choose from when a place in a /add_trip has packages: one per package and start time (a package with
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

/**
 * True when the text after /add_trip is a request for help rather than a trip, e.g. "/add_trip", "/add_trip help" or "/add_trip create
 * a new trip": a trip always has a date, a pickup time and a price, so text with no digits at all cannot be one.
 */
export function wantsTripGuide(details: string): boolean {
  const text = details.trim();
  return !text || /^((help|how|guide)\b|\?|วิธี|ช่วย|คู่มือ)/i.test(text) || !/[0-9\u0E50-\u0E59]/.test(text);
}

/**
 * The text the AI reads for a /add_trip: the customer chat staff replied to (pasted or forwarded into the group), with the
 * staff's own /add_trip line as a note; or just the /add_trip line. The price never comes from here: it is read from the staff's
 * /add_trip line alone (parseStaffPrice), so a price the customer mentioned is never used.
 */
export function tripText(staffLine: string, repliedChat: string): string {
  const chat = repliedChat.trim();
  return chat ? `${chat}\n\n(Staff note: ${staffLine.trim() || "none"})` : staffLine.trim();
}

/** What staff need to type after /add_trip (Thai, for the Admin group). */
export const TRIP_HELP = [
  "📝 <b>วิธีสร้างทริปผ่าน Telegram</b>",
  "พิมพ์ /add_trip แล้วพิมพ์รายละเอียดแบบอิสระ เรียงแบบไหนก็ได้ บอทจะสรุปให้ตรวจก่อนทุกครั้ง",
  "",
  "<b>ต้องมี</b>",
  "• จำนวนคน เช่น 4 people หรือ 2 adults 1 child",
  "• วันที่ เช่น 20/12/2026 หรือ 20 Dec (วันก่อนเดือน)",
  "• จุดรับและเวลารับ เช่น pickup Graceland Resort Patong 9:00 am",
  "• สถานที่ที่จะไป (บอทเรียงให้ ใกล้ที่สุดก่อน)",
  "",
  "<b>ใส่เพิ่มได้</b>",
  "• จุดส่ง ถ้าไม่ใช่ที่เดียวกับจุดรับ เช่น drop off Phuket Airport",
  "• ชั่วโมง เช่น trip 8 hours (ไม่ใส่ = คิดจากจำนวนสถานที่)",
  "• ราคา เช่น THB 3,500 (ไม่ใส่ = ราคาตามเรทรายชั่วโมง)",
  "• รถ (ไม่ใส่ = 1–2 คน Sedan, 3–4 คน SUV, 5–10 คน Van)",
  "",
  "<b>ตัวอย่าง</b>",
  "<code>/add_trip 4 people, pickup graceland resort patong, big buddha, wat chalong, phuket old town, pickup 9:00 am, 20/12/2026, trip 8 hours</code>",
  "",
  "บอทหาจุดรับ/จุดส่งใน Google Maps แล้วส่งสรุปให้ตรวจ ตอบกลับสรุปเพื่อแก้ไข แล้วกด <b>สร้างทริป</b>",
  "สถานที่ที่มีแพ็กเกจ บอทจะถามให้เลือกแพ็กเกจก่อนสร้างทริป",
  "",
  "<b>หรือวางแชตลูกค้า</b>",
  "วางหรือส่งต่อแชตของลูกค้าในกลุ่ม แล้วกดตอบกลับข้อความนั้นด้วย <code>/add_trip</code> (ใส่ราคาได้ เช่น <code>/add_trip THB 3,500</code> บอทไม่อ่านราคาจากแชตลูกค้า)",
].join("\n");
const categoryNamesTh = () => PLACE_TYPES.map((t) => t).join(", ");
export const PLACE_HELP = [
  "เพิ่มสถานที่: <code>/add_attraction ชื่อสถานที่ | หมวด | พื้นที่ | 09:00-17:00 | 90 นาที #sunset #instagram</code>",
  "ต้องมีแค่ชื่อ ส่วนอื่นเรียงแบบไหนก็ได้ คั่นด้วย |",
  `• หมวด (เลือก 1): ${categoryNamesTh()} (ไม่ใส่ = ใช้ประเภทจาก Google Maps)`,
  `• พื้นที่: ${PLACE_AREAS.join(", ")} (พิมพ์หาด/ย่านได้ เช่น Patong = Phuket)`,
  `• แท็ก: #${BEST_TIMES.filter((t) => t !== "any").join(" #")} และ #${VIBES.join(" #")}`,
  "ไม่ใส่เวลาเปิด บอทจะดึงเวลาเปิดจาก Google Maps ให้",
  "ใส่เป็นคำบรรยายรูปได้ (ส่งรูปพร้อมพิมพ์ /add_attraction …) หรือตอบกลับข้อความยืนยันของบอทด้วยรูปเพื่อเพิ่มรูป",
].join("\n");

const FROM_TH = { typed: "", google: " (จาก Google Maps)", kept: "", default: " (ค่าเริ่มต้น เปลี่ยนได้ เช่น <code>/add_attraction ชื่อ | temple</code>)" } as const;
/** The /add_attraction reply line: category, area (and neighbourhood) and tags, with where each came from. */
export function placeFiledTh(p: { name: string; category: string; area: string; neighbourhood: string | null; bestTime: string | null; vibes: string[] },
  from: { categoryFrom: keyof typeof FROM_TH; areaFrom: "typed" | "google" | "kept" }): string {
  const label = PLACE_TYPE_LABEL[p.category as PlaceType] ?? p.category;
  const area = p.area && (PLACE_AREAS as readonly string[]).includes(p.area)
    ? `📍 ${escHtml(p.area)}${p.neighbourhood ? ` (${escHtml(p.neighbourhood)})` : ""}${from.areaFrom === "google" ? " (จาก Google Maps)" : ""}`
    : `❓ ยังไม่มีพื้นที่${p.area ? ` (“${escHtml(p.area)}” ไม่อยู่ในรายการ)` : ""}: ส่ง <code>/add_attraction ${escHtml(p.name)} | Phuket</code>`;
  const tags = [...(p.bestTime ? [p.bestTime] : []), ...p.vibes];
  return `🏷 ${escHtml(label)}${FROM_TH[from.categoryFrom]} · ${area}${tags.length ? ` · ${tags.map((t) => `#${escHtml(t)}`).join(" ")}` : ""}`;
}

/** Parts of a /add_attraction the bot did not understand: not saved, and what it does understand. */
export const placeUnknownTh = (unknown: string[]) =>
  `⚠️ ไม่เข้าใจ (ไม่ได้บันทึก): ${unknown.map(escHtml).join(", ")}\nหมวดที่ใช้ได้: ${categoryNamesTh()}\nพื้นที่ที่ใช้ได้: ${PLACE_AREAS.join(", ")}`;

/**
 * The hours a /add_trip day is charged when no price is typed: 5 or more places count as 10 hours, 4 places as 6 hours,
 * fewer as the hours the day takes (at least 3). A day that takes longer than that is charged the hours it takes.
 */
export function tripChargeHours(places: number, plannedHours: number) {
  const floor = places >= 5 ? 10 : places === 4 ? 6 : 3;
  return Math.min(16, Math.max(floor, Math.ceil(plannedHours)));
}

// ── Typed /add_trip, read without AI ─────────────────────────────────────────────────────────────────────────────
// Staff type the number of people, the date and the places in any order (docs: "/add_trip input template proposal").
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

/** The car words /add_trip knows (the same as pickVehicle): a part that is only a car is not a place. */
const CAR_ONLY = /^(?:by\s+)?(?:an?\s+)?(?:mini\s*van|minivan|van|commuter|alphard|suv|fortuner|pajero|bmw|economy|sedan|camry|altis|รถตู้|ฟอร์จูนเนอร์|รถเก๋ง)(?:\s+car)?$/iu;
const FILLER = /^(?:and|then|to|&|และ|date|วันที่|price|ราคา|total|รวม|people|pax)$/iu;
const CLOCK = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm|น\.?)?|\b(1[0-2]|0?[1-9])\s*(am|pm)\b/iu;

/** Reads a typed /add_trip (the text after the command). Pure; `today` is the Thailand date (YYYY-MM-DD). */
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

/** The Thai reply when two places can't be one day trip. */
export const farApartTh = (far: { a: string; b: string; km: number }) =>
  `⚠️ ยังไม่ได้สร้างทริป: ${escHtml(far.a)} กับ ${escHtml(far.b)} ห่างกันประมาณ ${Math.round(far.km).toLocaleString("en-US")} กม. ไปในวันเดียวไม่ได้ ตรวจชื่อสถานที่อีกครั้ง`;

/** One date written any way /add_trip reads one (2026-11-29, 29/11, 29 Nov, Nov 29, 29 พ.ย.), as YYYY-MM-DD; no year = the next one. Null otherwise. */
export function readDate(raw: string, today: string): string | null {
  const t = raw.trim();
  let m: RegExpExecArray | null;
  const pick = (y: string | undefined, mo: number, d: string) => isoDate(y ? Number(y) : null, mo, Number(d), today)?.iso ?? null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return pick(m[1], Number(m[2]), m[3]);
  if ((m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?$/.exec(t))) return pick(m[3], Number(m[2]), m[1]);
  if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${EN_MONTH}\\.?(?:\\s*,?\\s*(\\d{4}))?$`, "iu").exec(t))) return pick(m[3], EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, m[1]);
  if ((m = new RegExp(`^${EN_MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?$`, "iu").exec(t))) return pick(m[3], EN_MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, m[2]);
  if ((m = new RegExp(`^(\\d{1,2})\\s*${TH_MONTH}(?:\\s*(\\d{4}))?$`, "u").exec(t))) return pick(m[3], thMonthIndex(m[2]) + 1, m[1]);
  return null;
}

/** A clock time ("08:30", "8.30", "8pm", "20.00 น."), as HH:MM, or null. */
export const readClock = (raw: string) => clock(raw);

/** The car class named in the text (the same words as /add_trip), or null. */
export const namedVehicle = (text: string): VehicleId | null => VEHICLE_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
