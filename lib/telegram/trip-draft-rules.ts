// /add_trip check-first summary (owner's design, 2026-11-16): the AI reads staff's free text, the bot looks the pickup and
// drop-off up on Google Maps, picks the car by the number of people, orders the places nearest-first (moving a place
// whose opening hours do not fit) and posts this summary. Nothing is built until a team member taps สร้างทริป; anything
// missing or unsure is asked first and the button only appears when nothing is. Pure, so it is unit tested directly.

import type { HoursMove } from "@/lib/trip-plan";
import type { VehicleId } from "@/lib/vehicles";
import { VEHICLES } from "@/lib/vehicles";

/** `noMaps`: Google Maps is not set up (no GOOGLE_MAPS_SERVER_KEY), so the place is kept as typed, without a map location. */
export type Located = { text: string; found: true; name: string; address: string; lat: number; lng: number } | { text: string; found: false; noMaps?: true };
export type DraftPlace = {
  stopId: string; name: string; attractionId: string | null; lat: number | null; lng: number | null; durationMin: number;
  priority: "must" | "nice"; note?: string; day?: number;
  /** Not in Admin → Attractions: found on Google Maps and added only when the trip is built. */
  fromGoogle?: { openTime: string | null; closeTime: string | null; closedDays: number[]; category?: string | null; area?: string | null };
  /** Not in Attractions and Google Maps could not find it. */
  notFound?: boolean;
  /** With notFound: Google Maps is not set up, so only places in Admin → Attractions can be used. */
  notInList?: boolean;
};
export type StopTime = { stopId: string; arrival: string; end: string };
export type TripDraftState = {
  title: string; area: string; language: "en" | "th" | "zh"; notes: string | null;
  tripDate: string | null; startTime: string | null; hours: number; hoursGiven: boolean;
  adults: number; children: number; peopleGiven: boolean; bags: number;
  pickup: Located | null; dropoff: Located | null;
  car: { ok: true; vehicle: VehicleId; named: boolean } | { ok: false; vehicle: VehicleId | null };
  price: number | null; priceAmbiguous: number[]; rate: number | null;
  places: DraftPlace[]; times: StopTime[]; endAt: string | null; moved: HoursMove[]; warnings: string[];
  unsure: string[]; farApart: string | null;
  /** TRIP_MULTIDAY=1 and the trip needs several days: the days are split when it is built. */
  multiday: { days: number | null } | null;
  /** Places the customer named none of ("suggest some temples"): the bot never picks places itself. */
  suggested: boolean;
};

export const MISSING_LABEL_TH: Record<string, string> = {
  date: "วันที่ (เช่น 20/12/2026)", people: "จำนวนคน (เช่น 4 people)", startTime: "เวลารับ (เช่น pickup 9:00)",
  pickup: "จุดรับ (ชื่อโรงแรมหรือสถานที่)", places: "สถานที่ที่จะไป", price: "ราคา (ไม่มีเรทรายชั่วโมงของพื้นที่นี้ ใส่ เช่น THB 3,500)",
};

/** What must be answered before the trip can be built, in the order staff are asked. */
export function tripDraftMissing(s: TripDraftState): string[] {
  return [
    ...(s.tripDate ? [] : ["date"]), ...(s.peopleGiven ? [] : ["people"]), ...(s.startTime ? [] : ["startTime"]),
    ...(s.pickup ? [] : ["pickup"]), ...(s.places.length ? [] : ["places"]),
    ...(s.price == null && s.rate == null && !s.multiday && s.car.ok && s.places.length ? ["price"] : []),
  ];
}

/** Problems that also hold the button back (each says what to reply). */
export function tripDraftProblems(s: TripDraftState): string[] {
  const out: string[] = [];
  if (s.suggested) out.push("ใส่ชื่อสถานที่ที่จะไป (บอทไม่เลือกสถานที่ให้เอง)");
  if (s.pickup && !s.pickup.found && !s.pickup.noMaps) out.push(`ไม่พบจุดรับ “${s.pickup.text}” ใน Google Maps: ตอบกลับด้วยชื่อที่ชัดขึ้น เช่น ชื่อโรงแรมเต็มและหาด/อำเภอ`);
  if (s.dropoff && !s.dropoff.found && !s.dropoff.noMaps) out.push(`ไม่พบจุดส่ง “${s.dropoff.text}” ใน Google Maps: ตอบกลับด้วยชื่อที่ชัดขึ้น`);
  for (const p of s.places.filter((x) => x.notFound)) out.push(p.notInList
    ? `“${p.name}” ไม่มีในรายการสถานที่ (ยังไม่ได้ตั้งค่า Google Maps จึงใช้ได้เฉพาะสถานที่ในรายการ): ตอบกลับด้วยชื่อตามรายการ หรือ “ไม่เอา ${p.name}” เพิ่มสถานที่ได้ด้วย /add_attraction`
    : `ไม่พบ “${p.name}” ใน Google Maps: ตอบกลับด้วยชื่อที่ถูกต้อง หรือ “ไม่เอา ${p.name}”`);
  if (!s.car.ok) {
    const people = s.adults + s.children;
    out.push(s.car.vehicle ? `${VEHICLES[s.car.vehicle].name} นั่งได้ ${VEHICLES[s.car.vehicle].passengers} คน ไม่พอสำหรับ ${people} คน: เปลี่ยนรถหรือแก้จำนวนคน`
      : `${people} คนเกินรถตู้ (นั่งได้ ${VEHICLES.premium_minivan.passengers} คน): แยกเป็นหลายคันใน Admin หรือแก้จำนวนคน`);
  }
  if (s.priceAmbiguous.length) out.push(`พบหลายราคา (${s.priceAmbiguous.map((n) => `THB ${n.toLocaleString("en-US")}`).join(", ")}): ตอบกลับด้วยราคาเดียว เช่น ราคา THB 3,500`);
  if (s.farApart) out.push(s.farApart);
  return [...out, ...s.unsure];
}

export const tripDraftReady = (s: TripDraftState) => !tripDraftMissing(s).length && !tripDraftProblems(s).length;

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const thaiDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const place = (l: Located) => (l.found ? `${esc(l.name)}${l.address && !l.address.startsWith(l.name) ? `, ${esc(l.address)}` : ""} (Google Maps)`
  : l.noMaps ? `${esc(l.text)} (ตามที่พิมพ์ ยังไม่มีพิกัด)` : `${esc(l.text)} ⚠️ ไม่พบใน Google Maps`);

/** The summary staff check (Thai, HTML). */
export function tripDraftSummary(s: TripDraftState): string {
  const people = `${s.adults} ผู้ใหญ่${s.children ? ` ${s.children} เด็ก` : ""}`;
  const missing = tripDraftMissing(s), problems = tripDraftProblems(s);
  const lines = [
    "🧭 <b>ทริปใหม่ (ร่าง) ตรวจก่อนสร้าง</b>",
    `📅 ${s.tripDate ? thaiDate(s.tripDate) : "❓ วันที่"} · รับ ${s.startTime ?? "❓"} · ${s.multiday ? `${s.multiday.days ?? "หลาย"} วัน` : `${s.hours} ชม.${s.hoursGiven ? "" : " ❔ ไม่ได้ระบุ (คิดจากจำนวนสถานที่ ตอบกลับเพื่อเปลี่ยน)"}`}`,
    `👥 ${s.peopleGiven ? people : "❓ จำนวนคน"}${s.car.ok ? ` · 🚗 ${esc(VEHICLES[s.car.vehicle].name)}${s.car.named ? "" : " (อัตโนมัติตามจำนวนคน)"}` : ""}`,
    `📍 รับ: ${s.pickup ? place(s.pickup) : "❓"}`,
    `🏁 ส่ง: ${s.dropoff ? place(s.dropoff) : s.pickup ? "❔ ที่เดียวกับจุดรับ (ถ้าส่งที่อื่น ตอบกลับ เช่น drop off Phuket Airport)" : "❓"}`,
  ];
  if (s.places.length) {
    if (s.multiday || !s.times.length) {
      lines.push(`🗺 ${s.multiday ? "สถานที่ (ระบบแบ่งวันตอนสร้าง)" : "สถานที่"}:`, ...s.places.map((p, i) => `${i + 1}. ${esc(p.name)}${p.fromGoogle ? " ➕" : ""}`));
    } else {
      const at = new Map(s.times.map((t) => [t.stopId, t]));
      lines.push("🗺 <b>เส้นทาง (ใกล้ที่สุดก่อน)</b>", `${s.startTime ?? "--:--"} รับที่จุดรับ`,
        ...s.places.map((p, i) => { const t = at.get(p.stopId); return `${i + 1}. ${t ? `${t.arrival}–${t.end} ` : ""}${esc(p.name)}${p.fromGoogle ? " ➕" : ""}`; }),
        ...(s.endAt ? [`${s.endAt} ถึงจุดส่ง`] : []));
    }
    if (s.places.some((p) => p.fromGoogle)) lines.push("➕ ยังไม่มีในรายการสถานที่: จะเพิ่มจาก Google Maps ตอนสร้างทริป");
  }
  for (const m of s.moved) lines.push(`↪️ ย้าย ${esc(m.name)} ${m.reason === "closed_by_then" ? "เพราะถ้าไปตามระยะทางจะถึงหลังปิด" : "เพราะถ้าไปตามระยะทางจะถึงก่อนเปิดนาน"}`);
  if (s.price != null) lines.push(`💰 ${thb(s.price)} (ราคาที่พิมพ์)`);
  else if (s.rate != null) lines.push(`💰 ประมาณ ${thb(s.rate)} ตามเรทรายชั่วโมง (${s.hours} ชม.) ใส่ราคาเองได้ เช่น THB 3,500`);
  else if (s.multiday) lines.push("💰 ราคาตามเรทรายชั่วโมงของแต่ละวัน (คิดตอนสร้าง)");
  if (s.warnings.length) lines.push("⚠️ <b>ตรวจก่อน:</b>", ...s.warnings.map((w) => `• ${esc(w)}`));
  lines.push("");
  if (missing.length) lines.push(`❓ <b>ยังขาด:</b> ${missing.map((k) => MISSING_LABEL_TH[k] ?? k).join(", ")}`);
  for (const p of problems) lines.push(`❓ ${esc(p)}`);
  lines.push(missing.length || problems.length ? "ตอบกลับข้อความนี้เพื่อเพิ่มหรือแก้ไข (พิมพ์อิสระได้)" : "✅ ข้อมูลครบ ตรวจแล้วกด <b>สร้างทริป</b> หรือตอบกลับข้อความนี้เพื่อแก้ไข");
  return lines.join("\n");
}

/**
 * Where the code reader and the AI disagree, staff are asked rather than one being trusted: the date and the number of
 * people are read by both. `typed` is null when the code could not read the text.
 */
export function crossCheck(ai: { tripDate: string | null; people: number; peopleGiven: boolean }, typed: { tripDate: string | null; people: number } | null): string[] {
  if (!typed) return [];
  const out: string[] = [];
  if (typed.tripDate && ai.tripDate && typed.tripDate !== ai.tripDate) out.push(`ไม่แน่ใจวันที่: ${typed.tripDate} หรือ ${ai.tripDate}? ตอบกลับด้วยวันที่ที่ถูก`);
  if (typed.people && ai.peopleGiven && typed.people !== ai.people) out.push(`ไม่แน่ใจจำนวนคน: ${typed.people} หรือ ${ai.people} คน? ตอบกลับด้วยจำนวนที่ถูก`);
  return out;
}

/** The price staff typed, newest message first: a later "THB 3,500" replaces an earlier price instead of making two. */
export function latestPrice(lines: string[], read: (text: string) => { ok: true; thb: number } | { ok: false; reason: "missing" | "ambiguous"; amounts: number[] }): { price: number | null; ambiguous: number[] } {
  for (const line of [...lines].reverse()) {
    const r = read(line);
    if (r.ok) return { price: r.thb, ambiguous: [] };
    if (r.reason === "ambiguous") return { price: null, ambiguous: r.amounts };
  }
  return { price: null, ambiguous: [] };
}

export const isCancelTrip = (text: string) => /^(?:cancel|stop|ยกเลิก|ไม่เอาแล้ว)$/iu.test(text.trim());
export const MAX_TRIP_LINE = 2000;
export const TRIP_DRAFT_HOURS = 48;
