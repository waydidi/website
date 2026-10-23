import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attractions } from "@/db/schema";
import { attractionSchema, attractionsById, listAttractions, saveAttraction } from "@/lib/attractions";
import { findPlace } from "@/lib/cee/quotes";
import { MAX_GALLERY_PHOTOS } from "@/lib/place-taxonomy";
import { putFile } from "@/lib/file-store";
import { publicSiteUrl } from "@/lib/site";
import { HOURLY_MIN_HOURS } from "@/lib/hourly-area-pricing";
import { getTrip, groupDays, inputFromRow, planFor, saveTrip, sendTripDays, splitTrip, suggestedTransport, tripSchema, tripSnapshot, type TripInput } from "@/lib/smart-trips";
import type { PlaceOption } from "@/lib/trip-chat-rules";
import { chatPlanConfigured, draftFromChat, type ModelCall } from "@/lib/trip-from-chat";
import { itineraryPdf } from "@/lib/trip-itinerary-file";
import { MAX_DAY_HOURS } from "@/lib/trip-split";
import { VEHICLES } from "@/lib/vehicles";
import { esc } from "./cards";
import { downloadFile, sendDocument, sendTo, tg, telegramChatId, type InlineKeyboard, type TelegramMessage } from "./client";
import { BLOCKING, MISSING_TH, PLACE_HELP, TRIP_HELP, hoursFromGoogle, packageOptions, tripMultidayOn, matchPlace, parsePlaceCommand, parsePlaceDetails, parseStaffPrice, parseTripCommand, pickVehicle, tripBuilderOn, tripChargeHours, tripText, wantsTripGuide, placeHoursLineTh, type GooglePeriod, type PlaceHours } from "./trip-builder-rules";

// /trip and /place in the Admin group (team list only; the webhook checks that). /trip builds a smart trip from the
// staff's text, sends it (freezes the version and makes the link) and posts the link and the PDF back to the Admin
// group. The bot never messages the customer: staff forward the link. /place adds or updates an attraction (name,
// opening hours, photos) so the next /trip can use it; hours left out are taken from Google Maps. Off until
// TELEGRAM_TRIP_BUILDER=1.

type Stmt = { first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => Stmt }; batch: (statements: Stmt[]) => Promise<unknown> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
export type PlaceInfo = { lat: number; lng: number; hours: PlaceHours | null };
export type BuilderDeps = { call?: ModelCall; locate?: (text: string) => Promise<{ lat: number; lng: number } | null>; place?: (text: string) => Promise<PlaceInfo | null>;
  /** The hourly-rate price of a day (city text, hours, car); null when the area has no rate. */
  rate?: (city: string, hours: number, vehicle: string) => Promise<number | null>; today?: string };
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

let ready: Promise<unknown> | null = null;
function ensureTable() {
  return (ready ??= db().prepare("CREATE TABLE IF NOT EXISTS telegram_trip_builder (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, kind TEXT NOT NULL, ref_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (chat_id, message_id))").bind().run()
    .catch((e) => { ready = null; throw e; }));
}
/** Claims a Telegram message once, so a webhook retry or two deliveries cannot build two trips or add a place twice. */
async function claim(chatId: string, messageId: number, kind: string) {
  await ensureTable();
  const r = await db().prepare("INSERT OR IGNORE INTO telegram_trip_builder(chat_id,message_id,kind,ref_id,created_at) VALUES(?,?,?,NULL,?)").bind(chatId, messageId, kind, new Date().toISOString()).run();
  return r.meta.changes > 0;
}
const remember = (chatId: string, messageId: number, kind: string, refId: string) =>
  db().prepare("INSERT OR REPLACE INTO telegram_trip_builder(chat_id,message_id,kind,ref_id,created_at) VALUES(?,?,?,?,?)").bind(chatId, messageId, kind, refId, new Date().toISOString()).run();

const defaultLocate = async (text: string) => { const p = await findPlace(text).catch(() => null); return p?.location ? { lat: p.location.latitude, lng: p.location.longitude } : null; };
/** A /place on Google Maps: where it is and its regular opening hours (Places API, the server key /trip already uses). */
async function defaultPlaceInfo(text: string): Promise<PlaceInfo | null> {
  const key = vars().GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location,places.regularOpeningHours.periods" },
    body: JSON.stringify({ textQuery: text.slice(0, 200), regionCode: "TH", languageCode: "en", pageSize: 1, locationRestriction: { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } } }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => ({})) as { places?: { location?: { latitude?: number; longitude?: number }; regularOpeningHours?: { periods?: GooglePeriod[] } }[] };
  const p = data.places?.[0], lat = p?.location?.latitude, lng = p?.location?.longitude;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng, hours: hoursFromGoogle(p?.regularOpeningHours?.periods) } : null;
}
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const thaiDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "-");
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** True when the message was /trip or /place (handled here, whatever the outcome). */
export async function handleTripBuilder(m: TelegramMessage, member: { display_name: string } | null, deps: BuilderDeps = {}) {
  const raw = (m.text ?? m.caption ?? "").trim(), chatId = String(m.chat.id);
  const trip = parseTripCommand(raw), place = trip === null ? parsePlaceCommand(raw) : null;
  if (trip === null && place === null) return false;
  const reply = (text: string) => sendTo(chatId, text, undefined, m.message_id).catch(() => undefined);
  if (chatId !== telegramChatId()) return true; // only the Admin group
  if (!member) { await reply(`เฉพาะทีม Waydidi ใน Telegram เท่านั้นที่ใช้ /trip และ /place ได้ Telegram ID ของคุณคือ <code>${m.from?.id ?? "unknown"}</code>`); return true; }
  if (!tripBuilderOn(vars())) { await reply("คำสั่ง /trip และ /place ยังไม่ได้เปิดใช้ (เจ้าของตั้ง TELEGRAM_TRIP_BUILDER=1 ใน Cloudflare)"); return true; }
  try {
    if (trip !== null) await buildTrip(trip, m, member, reply, deps);
    else await addPlace(place!, m, reply, deps);
  } catch (error) {
    console.error("trip builder failed", error instanceof Error ? error.message : "unknown");
    await reply(trip !== null ? "⚠️ สร้างทริปไม่สำเร็จ ส่ง /trip ใหม่อีกครั้ง (ข้อความใหม่)" : "⚠️ บันทึกสถานที่ไม่สำเร็จ ส่ง /place ใหม่อีกครั้ง");
  }
  return true;
}

async function buildTrip(details: string, m: TelegramMessage, member: { display_name: string }, reply: (t: string) => Promise<unknown>, deps: BuilderDeps) {
  const chatId = String(m.chat.id);
  // "Paste a chat": /trip sent as a reply to the customer's chat (pasted or forwarded into the group). Not to a bot message.
  const replied = m.reply_to_message && !m.reply_to_message.from?.is_bot ? (m.reply_to_message.text ?? m.reply_to_message.caption ?? "").trim() : "";
  if (!replied && wantsTripGuide(details)) { await reply(TRIP_HELP); return; } // "/trip", "/trip help", "/trip create a new trip"
  // The price comes from the staff's own words, before any AI. None typed: the hourly rates set it later. Two prices: ask.
  const price = parseStaffPrice(details);
  if (!price.ok && price.reason === "ambiguous") {
    await reply(`⚠️ ยังไม่ได้สร้างทริป: พบหลายราคา (${price.amounts.map(thb).join(", ")}) เขียนราคาทริปให้ชัด เช่น <code>ราคา 3500 บาท</code> หรือไม่ใส่ราคาเพื่อใช้ราคาตามเรทรายชั่วโมง`);
    return;
  }
  if (!deps.call && !chatPlanConfigured()) { await reply("ยังไม่ได้เปิดผู้ช่วย AI (ANTHROPIC_API_KEY) จึงอ่านรายละเอียดทริปไม่ได้"); return; }
  if (!(await claim(chatId, m.message_id, "trip"))) return;
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  const list = await listAttractions();
  const places: PlaceOption[] = list.map((a) => ({ id: a.id, name: a.customerName || a.name, area: a.area, durationMin: a.durationMin, lat: a.latitude, lng: a.longitude, usedIn: 0 }));
  const drafted = await draftFromChat(tripText(details, replied), places, deps.today ?? bangkokToday(), ...(deps.call ? [deps.call] : [])).catch(() => null);
  if (!drafted) { await reply("⚠️ สร้างทริปไม่สำเร็จ ลองส่ง /trip อีกครั้ง"); return; }
  if (!drafted.ok) { await reply(`⚠️ ยังไม่ได้สร้างทริป: ${esc(drafted.error)}`); return; }
  const d = drafted.draft;
  if (d.suggested) { await reply("⚠️ ยังไม่ได้สร้างทริป: ระบุชื่อสถานที่ที่จะไปด้วย (บอทไม่เลือกสถานที่ให้เอง)"); return; }
  // A place not in Admin → Attractions is looked up on Google Maps and added, like /place; one Google can't find is left out.
  const added: string[] = [], notFound: string[] = [];
  const stops: TripInput["stops"] = [];
  for (const s of d.stops) {
    let stop: TripInput["stops"][number] | null = { id: s.id, kind: s.kind, name: s.name, attractionId: s.attractionId, lat: s.lat ?? null, lng: s.lng ?? null, durationMin: s.durationMin, priority: s.priority, ...(s.note ? { note: s.note } : {}) };
    if (s.kind === "custom") {
      const row = await findByName(s.name) ?? await addFromGoogle(s.name, d.area, deps);
      if (row && !list.some((a) => a.id === row.id)) added.push(row.name);
      stop = row ? { ...stop, kind: "attraction", name: row.customerName || row.name, attractionId: row.id, lat: row.latitude, lng: row.longitude, durationMin: row.durationMin } : null;
      if (!stop) notFound.push(s.name);
    }
    if (stop) stops.push(stop);
  }
  const missing = d.missing.filter((x) => BLOCKING.includes(x) && !(x === "places" && stops.length));
  if (!stops.length) missing.push("places");
  if ([...new Set(missing)].length) {
    await reply(`⚠️ ยังไม่ได้สร้างทริป: ขาด${[...new Set(missing)].map((x) => MISSING_TH[x] ?? x).join(", ")}${notFound.length ? `\nไม่พบใน Google Maps: ${notFound.map(esc).join(", ")}` : ""}\n\n${TRIP_HELP}`);
    return;
  }
  const car = pickVehicle(details, d.adults + d.children, d.bags);
  if (!car.ok) {
    await reply(car.vehicle ? `⚠️ ยังไม่ได้สร้างทริป: ${VEHICLES[car.vehicle].name} นั่งได้ ${VEHICLES[car.vehicle].passengers} คน ${VEHICLES[car.vehicle].bags} กระเป๋า ไม่พอสำหรับ ${d.adults + d.children} คน ${d.bags} กระเป๋า`
      : `⚠️ ยังไม่ได้สร้างทริป: ไม่มีรถที่นั่งพอสำหรับ ${d.adults + d.children} คน ${d.bags} กระเป๋า`);
    return;
  }
  const multiday = tripMultidayOn(vars());
  const pinned = multiday ? Object.fromEntries(d.stops.flatMap((s) => (s.day && stops.some((x) => x.id === s.id) ? [[s.id, s.day - 1]] : []))) : {};
  const pending: Pending = {
    chatId, messageId: m.message_id, by: `Telegram · ${member.display_name}`.slice(0, 80), member: member.display_name, price: price.ok ? price.thb : null,
    days: multiday ? d.days : null, pinned, hoursGiven: d.hoursGiven, multiday, added, notFound, cityHint: d.area || list.find((a) => a.id === stops.find((x) => x.attractionId)?.attractionId)?.area || "",
    input: { title: d.title, area: d.area, tripDate: d.tripDate, startTime: d.startTime, pickupText: d.pickupText, durationHours: multiday && !d.hoursGiven ? MAX_DAY_HOURS : d.durationHours,
      adults: d.adults, children: d.children, bags: d.bags, vehicle: car.vehicle, language: d.language, customerName: d.customerName, notes: d.notes, stops },
    // Places with packages: staff choose the package in Telegram before the trip is built.
    queue: stops.filter((x) => (list.find((a) => a.id === x.attractionId)?.programs.length ?? 0) > 0).map((x) => x.id),
  };
  if (!pending.queue.length) { await finishTrip(pending, deps); return; }
  const id = crypto.randomUUID();
  await ensurePending();
  // Unanswered questions hold the trip's details, so they are removed once they expire.
  const now = new Date();
  await db().batch([
    db().prepare("DELETE FROM telegram_trip_pending WHERE created_at < ?").bind(new Date(now.getTime() - PENDING_HOURS * 3600_000).toISOString()),
    db().prepare("INSERT INTO telegram_trip_pending(id,chat_id,message_id,step,payload_json,created_at) VALUES(?,?,?,0,?,?)").bind(id, chatId, m.message_id, JSON.stringify(pending), now.toISOString()),
  ]);
  await askPackage(id, pending, 0);
}

/** A /trip waiting for package choices (telegram_trip_pending.payload_json). */
type Pending = {
  chatId: string; messageId: number; by: string; member: string; price: number | null; days: number | null; pinned: Record<string, number>;
  hoursGiven: boolean; multiday: boolean; added: string[]; notFound: string[]; cityHint: string; queue: string[];
  input: Omit<TripInput, "pickupLat" | "pickupLng" | "endText" | "endLat" | "endLng" | "transportPrice" | "discount" | "holdDays" | "isTemplate" | "templateName" | "customerEmail" | "customerPhone"> & { customerPhone?: null };
};

let pendingReady: Promise<unknown> | null = null;
const ensurePending = () => (pendingReady ??= db().prepare("CREATE TABLE IF NOT EXISTS telegram_trip_pending (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, step INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)").bind().run()
  .catch((e) => { pendingReady = null; throw e; }));
const PENDING_HOURS = 48;

/** Asks which package of the place at queue[step] the trip uses: one button per package and start time, or a general visit. */
async function askPackage(id: string, p: Pending, step: number) {
  const stop = p.input.stops.find((x) => x.id === p.queue[step]);
  const place = stop?.attractionId ? (await attractionsById([stop.attractionId]))[stop.attractionId] : undefined;
  const options = packageOptions(place?.programs ?? []);
  const keyboard: InlineKeyboard = [...options.map((o, k) => [{ text: o.label, callback_data: `tp_pkg:${id}:${step}.${k}` }]), [{ text: "เข้าชมทั่วไป (ไม่ใช้แพ็กเกจ)", callback_data: `tp_pkg:${id}:${step}.g` }]];
  await sendTo(p.chatId, `🎟 <b>${esc(stop?.name ?? "")}</b> มีแพ็กเกจ เลือกแพ็กเกจสำหรับทริปนี้ (${step + 1}/${p.queue.length})`, keyboard, p.messageId);
}

/** A package button under a /trip question (Admin group, team only; the webhook checks both). */
export async function handleTripPackageChoice(q: { id: string; data?: string; message?: TelegramMessage }, member: { display_name: string }, deps: BuilderDeps = {}) {
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert }).catch(() => undefined);
  const [, id = "", choice = ""] = (q.data ?? "").split(":");
  const [stepText, pick] = choice.split(".");
  const step = Number(stepText);
  if (!tripBuilderOn(vars())) return answer("คำสั่ง /trip ยังไม่ได้เปิดใช้", true);
  await ensurePending();
  const row = await db().prepare("SELECT step, payload_json, created_at FROM telegram_trip_pending WHERE id = ?").bind(id).first<{ step: number; payload_json: string; created_at: string }>();
  if (!row || !Number.isInteger(step)) return answer("ไม่พบทริปนี้ ส่ง /trip ใหม่", true);
  if (Date.now() - Date.parse(row.created_at) > PENDING_HOURS * 3600_000) return answer("หมดเวลาเลือกแล้ว ส่ง /trip ใหม่", true);
  if (row.step !== step) return answer("ข้อนี้เลือกไปแล้ว");
  const p = JSON.parse(row.payload_json) as Pending;
  const stop = p.input.stops.find((x) => x.id === p.queue[step]);
  const place = stop?.attractionId ? (await attractionsById([stop.attractionId]))[stop.attractionId] : undefined;
  if (!stop) return answer("ไม่พบทริปนี้ ส่ง /trip ใหม่", true);
  const option = pick === "g" ? null : packageOptions(place?.programs ?? [])[Number(pick)];
  if (pick !== "g" && !option) return answer("ตัวเลือกนี้ใช้ไม่ได้แล้ว ส่ง /trip ใหม่", true);
  const program = option ? place?.programs.find((x) => x.id === option.programId) : undefined;
  if (option && program) Object.assign(stop, { programId: program.id, feeIncluded: true, durationMin: program.durationMin, ...(option.session ? { sessionTime: option.session, priority: "fixed" as const } : {}) });
  // Only one tap per question counts: the step moves on only from the step this button was for.
  const moved = await db().prepare("UPDATE telegram_trip_pending SET step = step + 1, payload_json = ? WHERE id = ? AND step = ?").bind(JSON.stringify(p), id, step).run();
  if (!moved.meta.changes) return answer("ข้อนี้เลือกไปแล้ว");
  await answer("บันทึกแล้ว");
  if (q.message) await tg("editMessageText", { chat_id: p.chatId, message_id: q.message.message_id, parse_mode: "HTML",
    text: `✅ <b>${esc(stop.name)}</b>: ${esc(option?.label ?? "เข้าชมทั่วไป (ไม่ใช้แพ็กเกจ)")} · ${esc(member.display_name)}` }).catch(() => undefined);
  if (step + 1 < p.queue.length) { await askPackage(id, p, step + 1); return; }
  await db().prepare("DELETE FROM telegram_trip_pending WHERE id = ?").bind(id).run();
  try { await finishTrip(p, deps); }
  catch (error) {
    console.error("trip builder failed", error instanceof Error ? error.message : "unknown");
    await sendTo(p.chatId, "⚠️ สร้างทริปไม่สำเร็จ ส่ง /trip ใหม่อีกครั้ง (ข้อความใหม่)", undefined, p.messageId).catch(() => undefined);
  }
}

/** Builds, prices and sends the trip (several days when TRIP_MULTIDAY=1 and the places need them), then posts it back. */
async function finishTrip(p: Pending, deps: BuilderDeps) {
  const reply = (text: string) => sendTo(p.chatId, text, undefined, p.messageId).catch(() => undefined);
  const pickup = p.input.pickupText ? await (deps.locate ?? defaultLocate)(p.input.pickupText) : null;
  const input = tripSchema.parse({ ...p.input, pickupLat: pickup?.lat ?? null, pickupLng: pickup?.lng ?? null, transportPrice: p.price ?? 0, holdDays: 7 });
  const saved = await saveTrip(input, { name: p.by });
  await remember(p.chatId, p.messageId, "trip", saved.id);
  let lead = await getTrip(saved.id);
  if (!lead) return;
  if (p.multiday) {
    const split = await splitTrip(lead, { name: p.by }, { days: p.days, pinned: p.pinned });
    // One day after all, and the customer gave no hours: book the hours the day takes, not the 12-hour planning cap.
    if (!split && !p.hoursGiven) {
      const { plan } = await planFor(input);
      const hours = Math.min(MAX_DAY_HOURS, Math.max(HOURLY_MIN_HOURS, Math.ceil((plan.returnAt - plan.startAt) / 60)));
      await saveTrip({ ...inputFromRow(lead), id: lead.id, durationHours: hours }, { name: p.by });
    }
    lead = await getTrip(saved.id);
    if (!lead) return;
  }
  // groupDays returns a one-day trip's own row as given, so each step reads the trip again after writing to it.
  const current = async () => { const row = await getTrip(saved.id); return row ? groupDays(row) : []; };
  let days = await current();
  const origin = publicSiteUrl(vars().WAYDIDI_PUBLIC_URL);
  // No price typed: each day is charged hours × the hourly rate for its car. The hours follow the places that day
  // (tripChargeHours), or the hours staff typed. No rate for the car: staff set the price first.
  let charged: number[] = [];
  if (p.price == null) {
    const city = p.input.pickupText || p.cityHint;
    charged = await Promise.all(days.map(async (d) => {
      const stops = inputFromRow(d).stops.filter((s) => !s.skipped && s.kind !== "meal");
      if (p.hoursGiven && !p.multiday) return d.durationHours;
      const { plan } = await planFor(inputFromRow(d));
      return tripChargeHours(stops.length, (plan.returnAt - plan.startAt) / 60);
    }));
    const rates = await Promise.all(days.map((d, i) => (deps.rate ?? defaultRate)(city, charged[i]!, d.vehicle)));
    if (rates.some((r) => r == null)) {
      await reply([`⚠️ สร้างทริป <b>${esc(lead.ref)}</b> ไว้แล้วแต่ยังไม่ได้ส่ง: ไม่มีเรทรายชั่วโมงสำหรับพื้นที่นี้`,
        `ใส่ราคาที่ Admin → Smart trips แล้วกดส่ง: ${esc(`${origin}/admin/trips/${lead.id}`)}`, "หรือส่ง /trip ใหม่พร้อมราคา เช่น <code>THB 3,500</code>"].join("\n"));
      return;
    }
    for (const [i, d] of days.entries()) await saveTrip({ ...inputFromRow(d), id: d.id, durationHours: charged[i]!, transportPrice: rates[i]! }, { name: p.by, agencyId: d.agencyId });
    days = await current();
  }
  const { total, warnings } = await sendTripDays(days, p.by, "First itinerary (Telegram)");
  const snaps = (await current()).map((d) => tripSnapshot(d)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const first = snaps[0];
  if (!first) return;
  const link = `${origin}/itinerary/${lead.token}`;
  const transport = snaps.reduce((n, x) => n + x.transportPrice, 0), tickets = snaps.reduce((n, x) => n + x.feesIncluded, 0), onSite = snaps.reduce((n, x) => n + x.feesOnSite, 0);
  const people = `${first.adults} ผู้ใหญ่${first.children ? ` ${first.children} เด็ก` : ""}`;
  const route = (x: (typeof snaps)[number]) => x.stops.map((s) => esc(s.name)).join(" → ");
  const lines = [
    `✅ สร้างและส่งทริป <b>${esc(first.ref)}</b> แล้ว${snaps.length > 1 ? ` (${snaps.length} วัน)` : ""} (โดย ${esc(p.member)})`,
    `<b>${esc(first.title)}</b>`,
    `📅 ${thaiDate(first.tripDate)}${snaps.length > 1 ? ` – ${thaiDate(snaps.at(-1)!.tripDate)}` : ""} · รับ ${first.startTime} ${first.pickupText ? esc(first.pickupText) : "(จุดรับ: รอยืนยัน ใส่โรงแรมได้ที่ Admin)"}`,
    ...(snaps.length > 1 ? snaps.map((x, i) => `📍 วันที่ ${i + 1} (${thaiDate(x.tripDate)}): ${route(x)}`) : [`📍 ${route(first)}`]),
    `🚗 ${esc(first.vehicleName)} · ${people}`,
    `💰 ${thb(total)}${tickets ? ` (รถ ${thb(transport)} + แพ็กเกจ/ตั๋ว ${thb(tickets)})` : ""}${p.price == null ? ` · ราคารถตามเรทรายชั่วโมง (${charged.join(" + ")} ชม.) แก้ได้ที่ Admin` : ""}${onSite ? ` · ค่าเข้าชมจ่ายหน้างานประมาณ ${thb(onSite)}` : ""}`,
    ...(p.added.length ? [`➕ เพิ่มสถานที่ใหม่จาก Google Maps: ${p.added.map(esc).join(", ")}`] : []),
    ...(p.notFound.length ? [`⚠️ ไม่พบใน Google Maps (ไม่ได้ใส่ในทริป): ${p.notFound.map(esc).join(", ")} เพิ่มได้ด้วย /place`] : []),
    ...(warnings.length ? [`⚠️ ตรวจก่อนส่งลูกค้า:\n${warnings.map((w) => `• ${esc(w)}`).join("\n")}`] : []),
    `🔗 ${esc(link)}`,
    "บอทไม่ได้ส่งให้ลูกค้า ส่งลิงก์นี้ให้ลูกค้าเอง แก้ไขได้ที่ Admin → Smart trips",
  ];
  await reply(lines.join("\n"));
  const sentLead = await getTrip(saved.id);
  const pdf = sentLead ? await itineraryPdf(sentLead, origin).catch(() => null) : null;
  if (pdf) await sendDocument(pdf.bytes, `Waydidi-${pdf.ref}-itinerary.pdf`, "application/pdf", `📄 แผนการเดินทาง ${esc(pdf.ref)}`, p.chatId, p.messageId).catch((e) => console.error("trip builder pdf failed", e instanceof Error ? e.message : "unknown"));
}

const defaultRate = async (city: string, hours: number, vehicle: string) => (await suggestedTransport(city, hours, vehicle).catch(() => null))?.total ?? null;

/** A place staff named that is not in Attractions: added from Google Maps (location and opening hours), like /place. */
async function addFromGoogle(name: string, area: string, deps: BuilderDeps) {
  const info = await (deps.place ?? defaultPlaceInfo)([name, area].filter(Boolean).join(", ")).catch(() => null);
  if (!info) return null;
  const id = await saveAttraction(attractionSchema.parse({ name, area, openTime: info.hours?.openTime ?? null, closeTime: info.hours?.closeTime ?? null, closedDays: info.hours?.closedDays ?? [],
    durationMin: 60, latitude: info.lat, longitude: info.lng, internalNotes: `Added from Telegram (/trip)${info.hours ? "; opening hours from Google Maps" : ""}` }));
  const [row] = await getDb().select().from(attractions).where(eq(attractions.id, id)).limit(1);
  return row ?? null;
}

type AttractionRow = typeof attractions.$inferSelect;
const findByName = async (name: string) => {
  // A visible place first: a hidden duplicate is never the one staff mean while the original is shown.
  const rows = await getDb().select({ id: attractions.id, name: attractions.name, customerName: attractions.customerName, createdAt: attractions.createdAt, status: attractions.status }).from(attractions);
  const match = matchPlace(name, rows.filter((r) => r.status === "active")) ?? matchPlace(name, rows);
  if (!match) return null;
  const [row] = await getDb().select().from(attractions).where(eq(attractions.id, match.id)).limit(1);
  return row ?? null;
};

/** The largest version of a Telegram photo, stored like an Admin upload; its public URL, or null. */
async function storePhoto(m: TelegramMessage) {
  const best = [...(m.photo ?? [])].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!best) return null;
  const bytes = await downloadFile(best.file_id, MAX_PHOTO_BYTES).catch(() => null);
  if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // Telegram photos are JPEG; anything else is refused
  // A UUID-shaped name (the public image route serves only those), the same for the same Telegram photo, so a retry
  // stores it once.
  const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tg-photo:${best.file_unique_id ?? best.file_id}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const name = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}.jpg`;
  await putFile(`blog/${name}`, bytes, "image/jpeg");
  return `/api/blog-images/${name}`;
}

async function addPhoto(row: AttractionRow, url: string) {
  const gallery = (() => { try { return JSON.parse(row.galleryJson) as string[]; } catch { return []; } })();
  if (row.coverImage === url || gallery.includes(url)) return gallery.length + (row.coverImage ? 1 : 0);
  if (!row.coverImage) await getDb().update(attractions).set({ coverImage: url, updatedAt: new Date().toISOString() }).where(eq(attractions.id, row.id));
  else if (gallery.length < MAX_GALLERY_PHOTOS) await getDb().update(attractions).set({ galleryJson: JSON.stringify([...gallery, url]), updatedAt: new Date().toISOString() }).where(eq(attractions.id, row.id));
  return gallery.length + 1 + (row.coverImage ? 1 : 0);
}

async function addPlace(details: string, m: TelegramMessage, reply: (t: string) => Promise<unknown>, deps: BuilderDeps) {
  const chatId = String(m.chat.id);
  const place = parsePlaceDetails(details);
  if (!place) { await reply(PLACE_HELP); return; }
  if (!(await claim(chatId, m.message_id, "place"))) return;
  let row = await findByName(place.name);
  const created = !row;
  const typed = place.openTime ? { openTime: place.openTime, closeTime: place.closeTime } : null;
  const lookup = () => (deps.place ?? defaultPlaceInfo)([place.name, place.area].filter(Boolean).join(", ")).catch(() => null);
  let fromGoogle: PlaceHours | null = null;
  if (row) {
    // Google only fills hours nobody has entered: staff hours, typed now or before, always win.
    const info = !typed && !row.openTime ? await lookup() : null;
    fromGoogle = info?.hours ?? null;
    const changes = { ...(typed ?? {}), ...(fromGoogle ? { openTime: fromGoogle.openTime, closeTime: fromGoogle.closeTime, closedDaysJson: JSON.stringify(fromGoogle.closedDays) } : {}),
      ...(info && row.latitude == null ? { latitude: info.lat, longitude: info.lng } : {}),
      ...(place.durationMin ? { durationMin: place.durationMin } : {}), ...(place.area && !row.area ? { area: place.area } : {}) };
    if (Object.keys(changes).length) await getDb().update(attractions).set({ ...changes, updatedAt: new Date().toISOString() }).where(eq(attractions.id, row.id));
  } else {
    const info = await lookup();
    fromGoogle = typed ? null : info?.hours ?? null;
    const id = await saveAttraction(attractionSchema.parse({ name: place.name, area: place.area, openTime: typed?.openTime ?? fromGoogle?.openTime ?? null, closeTime: typed?.closeTime ?? fromGoogle?.closeTime ?? null,
      closedDays: fromGoogle?.closedDays ?? [], durationMin: place.durationMin ?? 60, latitude: info?.lat ?? null, longitude: info?.lng ?? null,
      internalNotes: `Added from Telegram (/place)${fromGoogle ? "; opening hours from Google Maps" : ""}` }));
    [row] = await getDb().select().from(attractions).where(eq(attractions.id, id)).limit(1);
  }
  if (!row) return;
  const photo = m.photo?.length ? await storePhoto(m) : null;
  if (photo) await addPhoto(row, photo);
  [row] = await getDb().select().from(attractions).where(eq(attractions.id, row.id)).limit(1);
  const photos = (row.coverImage ? 1 : 0) + ((() => { try { return (JSON.parse(row.galleryJson) as string[]).length; } catch { return 0; } })());
  const sent = await sendTo(chatId, [
    `✅ ${created ? "เพิ่ม" : "อัปเดต"}สถานที่ <b>${esc(row.name)}</b> ${created ? "ในรายการสถานที่แล้ว" : "แล้ว"}`,
    `🕘 ${placeHoursLineTh({ openTime: row.openTime, closeTime: row.closeTime, closedDays: (() => { try { return JSON.parse(row.closedDaysJson) as number[]; } catch { return []; } })() }, fromGoogle)} · ใช้เวลาประมาณ ${row.durationMin} นาที${row.area ? ` · ${esc(row.area)}` : ""}`,
    `📷 รูป ${photos} รูป${m.photo?.length && !photo ? " (บันทึกรูปไม่สำเร็จ ลองส่งใหม่)" : ""}`,
    created && row.latitude == null ? "📍 ยังไม่มีพิกัด: ระยะเวลาขับรถจะเป็นค่าประมาณ แก้ได้ที่ Admin → Attractions" : "",
    "ตอบกลับข้อความนี้ด้วยรูปเพื่อเพิ่มรูป",
  ].filter(Boolean).join("\n"), undefined, m.message_id).catch(() => null);
  if (sent) await remember(chatId, sent.message_id, "place_reply", row.id);
}

/** A photo sent as a reply to a /place confirmation: added to that attraction. True when handled. */
export async function handlePlacePhotoReply(m: TelegramMessage, member: { display_name: string } | null) {
  if (!member || !m.photo?.length || !m.reply_to_message || String(m.chat.id) !== telegramChatId() || !tripBuilderOn(vars())) return false;
  await ensureTable();
  const target = await db().prepare("SELECT ref_id FROM telegram_trip_builder WHERE chat_id=? AND message_id=? AND kind='place_reply'").bind(String(m.chat.id), m.reply_to_message.message_id).first<{ ref_id: string }>();
  if (!target) return false;
  if (!(await claim(String(m.chat.id), m.message_id, "place_photo"))) return true;
  const [row] = await getDb().select().from(attractions).where(eq(attractions.id, target.ref_id)).limit(1);
  const url = row ? await storePhoto(m) : null;
  if (!row || !url) { await sendTo(String(m.chat.id), "⚠️ บันทึกรูปไม่สำเร็จ ลองส่งใหม่", undefined, m.message_id).catch(() => undefined); return true; }
  await addPhoto(row, url);
  await tg("setMessageReaction", { chat_id: m.chat.id, message_id: m.message_id, reaction: [{ type: "emoji", emoji: "👍" }] }).catch(() => undefined);
  return true;
}
