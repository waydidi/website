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
import { esc } from "./cards";
import { downloadFile, sendDocument, sendTo, tg, telegramChatId, type InlineKeyboard, type TelegramMessage } from "./client";
import { FAR_APART_KM, PLACE_HELP, placeFiledTh, placeUnknownTh, TRIP_HELP, farApartTh, farthestPair, hoursFromGoogle, namedVehicle, parseTypedTrip, packageOptions, tripMultidayOn, matchPlace, parsePlaceCommand, parsePlaceDetails, parseStaffPrice, parseTripCommand, pickVehicle, tripBuilderOn, tripChargeHours, tripText, wantsTripGuide, placeHoursLineTh, type GooglePeriod, type PlaceHours } from "./trip-builder-rules";
import { MAX_TRIP_LINE, TRIP_DRAFT_HOURS, crossCheck, isCancelTrip, latestPrice, tripDraftReady, tripDraftSummary, type DraftPlace, type Located, type TripDraftState } from "./trip-draft-rules";
import { alertAiOutOfCredit } from "./ai-credit-alert";
import { areaOf, categoryFromGoogle } from "@/lib/place-words";
import { fmt, nearestFirst, schedule, type TripStop } from "@/lib/trip-plan";

// /add_trip and /add_attraction in the Admin group (team list only; the webhook checks that). /add_trip builds a smart trip from the
// staff's text, sends it (freezes the version and makes the link) and posts the link and the PDF back to the Admin
// group. The bot never messages the customer: staff forward the link. /add_attraction adds or updates an attraction (name,
// opening hours, photos) so the next /add_trip can use it; hours left out are taken from Google Maps. Off until
// TELEGRAM_TRIP_BUILDER=1.

type Stmt = { first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => Stmt }; batch: (statements: Stmt[]) => Promise<unknown> };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
/** A place on Google Maps: where it is, its opening hours and (for its category and area) its types and address. */
export type PlaceInfo = { lat: number; lng: number; hours: PlaceHours | null; primaryType?: string | null; types?: string[]; address?: string | null };
export type BuilderDeps = { call?: ModelCall; locate?: (text: string) => Promise<{ lat: number; lng: number; name?: string; address?: string } | null>; place?: (text: string) => Promise<PlaceInfo | null>;
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

/** A /add_attraction on Google Maps: where it is and its regular opening hours (Places API, the server key /add_trip already uses). */
async function defaultPlaceInfo(text: string): Promise<PlaceInfo | null> {
  const key = vars().GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.location,places.regularOpeningHours.periods,places.primaryType,places.types,places.formattedAddress" },
    body: JSON.stringify({ textQuery: text.slice(0, 200), regionCode: "TH", languageCode: "en", pageSize: 1, locationRestriction: { rectangle: { low: { latitude: 5.5, longitude: 97.3 }, high: { latitude: 20.5, longitude: 105.7 } } } }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => ({})) as { places?: { location?: { latitude?: number; longitude?: number }; regularOpeningHours?: { periods?: GooglePeriod[] }; primaryType?: string; types?: string[]; formattedAddress?: string }[] };
  const p = data.places?.[0], lat = p?.location?.latitude, lng = p?.location?.longitude;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng, hours: hoursFromGoogle(p?.regularOpeningHours?.periods), primaryType: p?.primaryType ?? null, types: p?.types ?? [], address: p?.formattedAddress ?? null } : null;
}
const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const thaiDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "-");
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** True when the message was /add_trip or /add_attraction (handled here, whatever the outcome). */
export async function handleTripBuilder(m: TelegramMessage, member: { display_name: string } | null, deps: BuilderDeps = {}) {
  const raw = (m.text ?? m.caption ?? "").trim(), chatId = String(m.chat.id);
  const trip = parseTripCommand(raw), place = trip === null ? parsePlaceCommand(raw) : null;
  // Not a command: maybe a reply to a /add_trip summary (adds to or corrects that draft).
  if (trip === null && place === null) return handleTripDraftReply(m, member, deps).catch(async (error) => {
    console.error("trip draft reply failed", error instanceof Error ? error.message : "unknown");
    await sendTo(chatId, "⚠️ แก้ร่างทริปไม่สำเร็จ ลองตอบกลับอีกครั้ง", undefined, m.message_id).catch(() => undefined);
    return true;
  });
  const reply = (text: string) => sendTo(chatId, text, undefined, m.message_id).catch(() => undefined);
  if (chatId !== telegramChatId()) return true; // only the Admin group
  if (!member) { await reply(`เฉพาะทีม Waydidi ใน Telegram เท่านั้นที่ใช้ /add_trip และ /add_attraction ได้ Telegram ID ของคุณคือ <code>${m.from?.id ?? "unknown"}</code>`); return true; }
  if (!tripBuilderOn(vars())) { await reply("คำสั่ง /add_trip และ /add_attraction ยังไม่ได้เปิดใช้ (เจ้าของตั้ง TELEGRAM_TRIP_BUILDER=1 ใน Cloudflare)"); return true; }
  try {
    if (trip !== null) await buildTrip(trip, m, member, reply, deps);
    else await addPlace(place!, m, reply, deps);
  } catch (error) {
    console.error("trip builder failed", error instanceof Error ? error.message : "unknown");
    await reply(trip !== null ? "⚠️ สร้างทริปไม่สำเร็จ ส่ง /add_trip ใหม่อีกครั้ง (ข้อความใหม่)" : "⚠️ บันทึกสถานที่ไม่สำเร็จ ส่ง /add_attraction ใหม่อีกครั้ง");
  }
  return true;
}

// ── /add_trip: read freely, check first, build after the tap ─────────────────────────────────────────────────────────
// The AI reads staff's text (and a customer chat it replies to); the code reader only double-checks the date and the
// people. The bot looks the pickup and drop-off up on Google Maps, picks the car by the number of people, orders the
// places nearest-first (moving a place whose hours do not fit) and posts a summary. Staff reply to it to change anything
// (the text is read again with the reply); สร้างทริป builds exactly the summary that was shown (its version). Nothing
// is built, sent or added to Attractions before that tap. Drafts (which may hold a pasted customer chat) are deleted
// after TRIP_DRAFT_HOURS, and the chat is cleared as soon as the draft is built or cancelled.

type DraftRow = { id: string; chat_id: string; request_message_id: number; created_by_name: string; lines_json: string; replied_chat: string | null;
  version: number; status: string; state_json: string | null; updated_at: string };
let draftReady: Promise<unknown> | null = null;
/** Also in drizzle/0126_telegram_trip_drafts.sql; Workers Builds does not apply migrations, so they are made on first use. */
const ensureDrafts = () => (draftReady ??= (async () => {
  await db().prepare(`CREATE TABLE IF NOT EXISTS telegram_trip_drafts (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, request_message_id INTEGER NOT NULL,
    created_by TEXT NOT NULL, created_by_name TEXT NOT NULL, lines_json TEXT NOT NULL DEFAULT '[]', replied_chat TEXT, version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft', state_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`).bind().run();
  await db().prepare("CREATE UNIQUE INDEX IF NOT EXISTS telegram_trip_drafts_request ON telegram_trip_drafts(chat_id, request_message_id)").bind().run();
  await db().prepare("CREATE TABLE IF NOT EXISTS telegram_trip_draft_messages (chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, draft_id TEXT NOT NULL, PRIMARY KEY (chat_id, message_id))").bind().run();
})().catch((e) => { draftReady = null; throw e; }));
const MAX_LINES = 12;
const parse = <T>(json: string | null, fallback: T): T => { try { return json ? JSON.parse(json) as T : fallback; } catch { return fallback; } };
const fresh = (row: { updated_at: string }) => Date.now() - Date.parse(row.updated_at) < TRIP_DRAFT_HOURS * 3_600_000;

async function buildTrip(details: string, m: TelegramMessage, member: { display_name: string }, reply: (t: string) => Promise<unknown>, deps: BuilderDeps) {
  const chatId = String(m.chat.id);
  // "Paste a chat": /add_trip sent as a reply to the customer's chat (pasted or forwarded into the group). Not to a bot message.
  const replied = m.reply_to_message && !m.reply_to_message.from?.is_bot ? (m.reply_to_message.text ?? m.reply_to_message.caption ?? "").trim() : "";
  if (!replied && wantsTripGuide(details)) { await reply(TRIP_HELP); return; } // "/add_trip", "/add_trip help", "/add_trip create a new trip"
  if (!deps.call && !chatPlanConfigured()) { await reply("ยังไม่ได้เปิดผู้ช่วย AI (ANTHROPIC_API_KEY) จึงอ่าน /add_trip ไม่ได้"); return; }
  if (details.length > MAX_TRIP_LINE) { await reply(`ยาวเกินไป (ไม่เกิน ${MAX_TRIP_LINE.toLocaleString("en-US")} ตัวอักษร)`); return; }
  await ensureDrafts();
  const now = new Date(), id = crypto.randomUUID();
  // One draft per /add_trip message: a webhook retry or a second delivery finds the same row and does nothing more.
  const [, claimed] = await db().batch([
    db().prepare("DELETE FROM telegram_trip_drafts WHERE updated_at < ? AND status <> 'building'").bind(new Date(now.getTime() - TRIP_DRAFT_HOURS * 3_600_000).toISOString()),
    db().prepare(`INSERT OR IGNORE INTO telegram_trip_drafts(id,chat_id,request_message_id,created_by,created_by_name,lines_json,replied_chat,version,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,1,'draft',?,?)`).bind(id, chatId, m.message_id, String(m.from?.id ?? ""), member.display_name, JSON.stringify([details]), replied || null, now.toISOString(), now.toISOString()),
  ]) as [unknown, { meta: { changes: number } }];
  if (!claimed.meta.changes) return;
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  const state = await readTripDraft([details], replied, null, deps);
  if ("error" in state) {
    await db().prepare("UPDATE telegram_trip_drafts SET status='failed',replied_chat=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
    await reply(state.error);
    return;
  }
  await db().prepare("UPDATE telegram_trip_drafts SET state_json=?,updated_at=? WHERE id=?").bind(JSON.stringify(state), new Date().toISOString(), id).run();
  await postTripSummary({ id, chat_id: chatId, version: 1 }, state, m.message_id);
}

const tripKeyboard = (d: { id: string; version: number }, s: TripDraftState): InlineKeyboard => tripDraftReady(s)
  ? [[{ text: "✅ สร้างทริป", callback_data: `tpd_ok:${d.id}:${d.version}` }, { text: "ยกเลิก", callback_data: `tpd_no:${d.id}:${d.version}` }]]
  : [[{ text: "ยกเลิก", callback_data: `tpd_no:${d.id}:${d.version}` }]];

/** Posts the summary as a reply and remembers it, so a reply to it reaches this draft. */
async function postTripSummary(d: { id: string; chat_id: string; version: number }, s: TripDraftState, replyTo: number) {
  const sent = await sendTo(d.chat_id, tripDraftSummary(s), tripKeyboard(d, s), replyTo);
  if (sent?.message_id) await db().prepare("INSERT OR IGNORE INTO telegram_trip_draft_messages(chat_id,message_id,draft_id) VALUES(?,?,?)").bind(d.chat_id, sent.message_id, d.id).run();
}

const defaultLocatePlace = async (text: string): Promise<{ lat: number; lng: number; name?: string; address?: string } | null> => {
  const p = await findPlace(text).catch(() => null);
  return p?.location ? { lat: p.location.latitude, lng: p.location.longitude, name: p.displayName?.text, address: p.formattedAddress } : null;
};

/** A pickup or drop-off on Google Maps (the same lookup as before for the same text, so a correction does not pay twice). */
async function locate(text: string, previous: Located | null, deps: BuilderDeps): Promise<Located> {
  if (previous && previous.text.toLowerCase() === text.toLowerCase()) return previous;
  const p = await (deps.locate ?? defaultLocatePlace)(text).catch(() => null) as { lat: number; lng: number; name?: string; address?: string } | null;
  return p ? { text, found: true, name: p.name || text, address: p.address || "", lat: p.lat, lng: p.lng } : { text, found: false };
}

/** The car named in staff's latest line that names one; otherwise the owner's rule by the number of people. */
function carFrom(lines: string[], people: number): TripDraftState["car"] {
  const line = [...lines].reverse().find((l) => namedVehicle(l));
  return pickVehicle(line ?? "", people);
}

/** Staff's lines (and a pasted chat) → the checked summary. Reads with AI; looks places up on Google Maps (nothing saved). */
async function readTripDraft(lines: string[], replied: string, previous: TripDraftState | null, deps: BuilderDeps): Promise<TripDraftState | { error: string }> {
  const today = deps.today ?? bangkokToday();
  const list = await listAttractions();
  const options: PlaceOption[] = list.map((a) => ({ id: a.id, name: a.customerName || a.name, area: a.area, durationMin: a.durationMin, lat: a.latitude, lng: a.longitude, usedIn: 0 }));
  const staff = lines.map((l, i) => (i ? `Correction: ${l}` : l)).join("\n");
  const drafted = await draftFromChat(tripText(staff, replied), options, today, ...(deps.call ? [deps.call] : []));
  if (!drafted.ok) {
    if (drafted.failure?.code === "credit") { await alertAiOutOfCredit(); return { error: "⚠️ เครดิต AI หมด จึงอ่าน /add_trip ไม่ได้ แจ้งแอดมินในกลุ่มให้เติมแล้ว เติมเสร็จส่ง /add_trip ใหม่" }; }
    return { error: `⚠️ ยังไม่ได้สร้างทริป: ${esc(drafted.error)}` };
  }
  const d = drafted.draft;
  const people = d.adults + d.children;
  // The code reader double-checks the first line's date and people; a disagreement is asked, never guessed.
  const typed = !replied && lines.length === 1 ? parseTypedTrip(lines[0], today) : null;
  const unsure = crossCheck({ tripDate: d.tripDate, people, peopleGiven: d.given.people }, typed?.ok ? { tripDate: typed.trip.tripDate, people: typed.trip.adults + typed.trip.children } : null);

  const places: DraftPlace[] = [];
  for (const s of d.stops) {
    const base = { stopId: s.id, name: s.name, durationMin: s.durationMin, priority: s.priority, ...(s.note ? { note: s.note } : {}), ...(s.day ? { day: s.day } : {}) };
    if (s.kind === "attraction" && s.attractionId) { places.push({ ...base, attractionId: s.attractionId, lat: s.lat ?? null, lng: s.lng ?? null }); continue; }
    const row = await findByName(s.name);
    if (row) { places.push({ ...base, name: row.customerName || row.name, attractionId: row.id, lat: row.latitude, lng: row.longitude, durationMin: row.durationMin }); continue; }
    const before = previous?.places.find((p) => p.fromGoogle !== undefined && p.name.toLowerCase() === s.name.toLowerCase());
    if (before) { places.push({ ...before, stopId: s.id }); continue; }
    const info = await (deps.place ?? defaultPlaceInfo)([s.name, d.area].filter(Boolean).join(", ")).catch(() => null);
    places.push(info ? { ...base, attractionId: null, lat: info.lat, lng: info.lng, durationMin: 60, fromGoogle: { openTime: info.hours?.openTime ?? null, closeTime: info.hours?.closeTime ?? null,
      closedDays: info.hours?.closedDays ?? [], category: categoryFromGoogle(info.primaryType, info.types), area: areaOf(info.address) } }
      : { ...base, attractionId: null, lat: null, lng: null, notFound: true });
  }
  const pickup = d.pickupText ? await locate(d.pickupText, previous?.pickup ?? null, deps) : null;
  const dropoff = d.dropoffText ? await locate(d.dropoffText, previous?.dropoff ?? null, deps) : null;
  const car = carFrom(lines, people);
  const { price, ambiguous } = latestPrice(lines, parseStaffPrice);
  const multiday = tripMultidayOn(vars()) && (d.days ?? 1) > 1 ? { days: d.days } : null;
  const usable = places.filter((p) => !p.notFound);
  const far = multiday ? null : farthestPair(usable.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng })));
  const state: TripDraftState = {
    title: d.title, area: d.area, language: d.language, notes: d.notes, tripDate: d.tripDate, startTime: d.given.startTime ? d.startTime : null,
    hours: d.durationHours, hoursGiven: d.hoursGiven, adults: d.adults, children: d.children, peopleGiven: d.given.people, bags: d.bags,
    pickup, dropoff, car, price, priceAmbiguous: ambiguous, rate: null, places, times: [], endAt: null, moved: [], warnings: [], unsure,
    farApart: far && far.km > FAR_APART_KM ? farApartTh(far).replace(/^⚠️ ยังไม่ได้สร้างทริป: /, "") : null, multiday, suggested: d.suggested,
  };
  if (multiday || !usable.length || !car.ok) return state;
  return planTripDraft(state, deps);
}

/** Nearest-first order, the times of each stop, hours problems and (no price typed) the hourly-rate estimate. */
async function planTripDraft(state: TripDraftState, deps: BuilderDeps): Promise<TripDraftState> {
  if (!state.car.ok) return state;
  const usable = state.places.filter((p) => !p.notFound);
  const start = state.startTime ?? "08:00";
  const pickup = state.pickup?.found ? state.pickup : null, dropoff = state.dropoff?.found ? state.dropoff : null;
  // Places found on Google (not saved yet) are planned with Google's hours under a temporary id.
  const stops = usable.map((p) => ({ id: p.stopId, kind: "attraction" as const, name: p.name, attractionId: p.attractionId ?? `google:${p.stopId}`, lat: p.lat, lng: p.lng, durationMin: p.durationMin, priority: p.priority }));
  const input = { tripDate: state.tripDate, startTime: start, pickupLat: pickup?.lat ?? null, pickupLng: pickup?.lng ?? null, endLat: dropoff?.lat ?? null, endLng: dropoff?.lng ?? null,
    durationHours: state.hoursGiven ? state.hours : MAX_DAY_HOURS, stops, adults: state.adults, children: state.children, vehicle: state.car.vehicle,
    pickupText: pickup?.text ?? "", transportPrice: 0, discount: 0 } as Parameters<typeof planFor>[0];
  const { planInput } = await planFor(input);
  for (const p of usable.filter((x) => x.fromGoogle !== undefined)) planInput.attractions[`google:${p.stopId}`] = {
    id: `google:${p.stopId}`, name: p.name, latitude: p.lat, longitude: p.lng, openTime: p.fromGoogle?.openTime ?? null, closeTime: p.fromGoogle?.closeTime ?? null,
    lastEntry: null, closedDays: p.fromGoogle?.closedDays ?? [], durationMin: p.durationMin, arrivalBufferMin: 0, programs: [], exceptions: [], tags: [] };
  const ordered = nearestFirst(stops as TripStop[], planInput);
  let plan = schedule(ordered.stops, planInput);
  let hours = state.hours;
  // TRIP_MULTIDAY=1 and the places need more than a day: split into days when it is built, as before.
  if (tripMultidayOn(vars()) && !state.hoursGiven && (plan.returnAt - plan.startAt) / 60 > MAX_DAY_HOURS) return { ...state, multiday: { days: null } };
  // No hours typed: the hours the places take (at least by the number of places), then planned again inside them.
  if (!state.hoursGiven) {
    hours = tripChargeHours(usable.length, (plan.returnAt - plan.startAt) / 60);
    planInput.endLimit = planInput.startMin + hours * 60;
    plan = schedule(ordered.stops, planInput);
  }
  const byId = new Map(state.places.map((p) => [p.stopId, p]));
  const places = [...ordered.stops.map((s) => byId.get(s.id)!), ...state.places.filter((p) => p.notFound)];
  const warnings = [...new Set(plan.problems.filter((x) => !(x.message.startsWith("Pickup has no map location") && !state.pickup)).map((x) => x.message))];
  const rate = state.price == null ? await (deps.rate ?? defaultRate)(pickup?.text ?? state.pickup?.text ?? state.area, hours, state.car.vehicle) : null;
  return { ...state, hours, places, moved: ordered.moved, warnings, rate,
    times: plan.stops.map((s) => ({ stopId: s.id, arrival: fmt(s.start), end: fmt(s.end) })), endAt: fmt(plan.returnAt) };
}

/** A reply to one of a /add_trip draft's summaries: read again with the reply (or ยกเลิก). True when handled. */
async function handleTripDraftReply(m: TelegramMessage, member: { display_name: string } | null, deps: BuilderDeps) {
  const chatId = String(m.chat.id), repliedTo = m.reply_to_message?.message_id;
  if (!repliedTo || chatId !== telegramChatId() || !tripBuilderOn(vars())) return false;
  await ensureDrafts();
  const link = await db().prepare("SELECT draft_id FROM telegram_trip_draft_messages WHERE chat_id=? AND message_id=?").bind(chatId, repliedTo).first<{ draft_id: string }>();
  if (!link) return false;
  const reply = (text: string) => sendTo(chatId, text, undefined, m.message_id).catch(() => undefined);
  if (!member) { await reply(`เฉพาะทีม Waydidi ใน Telegram เท่านั้นที่แก้ทริปได้ Telegram ID ของคุณคือ <code>${m.from?.id ?? "unknown"}</code>`); return true; }
  const text = (m.text ?? m.caption ?? "").trim();
  const draft = await db().prepare("SELECT * FROM telegram_trip_drafts WHERE id=?").bind(link.draft_id).first<DraftRow>();
  if (!draft || draft.status !== "draft") { await reply(draft?.status === "built" ? "ทริปนี้สร้างแล้ว แก้ไขที่ Admin → Smart trips" : "ร่างนี้ปิดแล้ว ส่ง /add_trip ใหม่"); return true; }
  if (!fresh(draft)) { await reply(`ร่างนี้หมดอายุแล้ว (${TRIP_DRAFT_HOURS} ชั่วโมง) ส่ง /add_trip ใหม่`); return true; }
  if (!text) return true;
  if (isCancelTrip(text)) {
    const done = await db().prepare("UPDATE telegram_trip_drafts SET status='cancelled',replied_chat=NULL,state_json=NULL,updated_at=? WHERE id=? AND status='draft'").bind(new Date().toISOString(), draft.id).run();
    await reply(done.meta.changes ? "ยกเลิกร่างทริปแล้ว" : "ร่างนี้ปิดแล้ว");
    return true;
  }
  if (text.length > MAX_TRIP_LINE) { await reply(`ยาวเกินไป (ไม่เกิน ${MAX_TRIP_LINE.toLocaleString("en-US")} ตัวอักษร)`); return true; }
  const lines = [...parse<string[]>(draft.lines_json, []), text].slice(-MAX_LINES);
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  const state = await readTripDraft(lines, draft.replied_chat ?? "", parse<TripDraftState | null>(draft.state_json, null), deps);
  if ("error" in state) { await reply(state.error); return true; }
  // Two replies at once: only the one that moves the version it read saves; the other is asked to send again.
  const saved = await db().prepare("UPDATE telegram_trip_drafts SET lines_json=?,state_json=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status='draft'")
    .bind(JSON.stringify(lines), JSON.stringify(state), new Date().toISOString(), draft.id, draft.version).run();
  if (!saved.meta.changes) { await reply("มีคนแก้ร่างนี้พร้อมกัน ตอบกลับข้อความล่าสุดอีกครั้ง"); return true; }
  await postTripSummary({ id: draft.id, chat_id: chatId, version: draft.version + 1 }, state, m.message_id);
  return true;
}

/**
 * สร้างทริป / ยกเลิก under a /add_trip summary (Admin group, team only; the webhook checks both). The button carries the
 * version it was shown for: one under an older summary does nothing, and only the tap that moves draft → building
 * builds, so two taps, two people or a webhook retry build one trip.
 */
export async function handleTripDraftCallback(action: string, id: string, versionText: string, member: { display_name: string }, q: { id: string; message?: TelegramMessage }, deps: BuilderDeps = {}) {
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert }).catch(() => undefined);
  if (!tripBuilderOn(vars())) return answer("คำสั่ง /add_trip ยังไม่ได้เปิดใช้", true);
  await ensureDrafts();
  const version = Number(versionText);
  const draft = await db().prepare("SELECT * FROM telegram_trip_drafts WHERE id=?").bind(id).first<DraftRow>();
  if (!draft || draft.chat_id !== telegramChatId()) return answer("ไม่พบร่างนี้ ส่ง /add_trip ใหม่", true);
  if (draft.status === "built" || draft.status === "building") return answer("ทริปนี้กำลังสร้างหรือสร้างแล้ว", true);
  if (draft.status !== "draft") return answer("ร่างนี้ปิดแล้ว ส่ง /add_trip ใหม่", true);
  if (!Number.isInteger(version) || version !== draft.version) return answer("ข้อมูลเปลี่ยนแล้ว ใช้ปุ่มใต้ข้อความล่าสุด", true);
  const markup = (text: string) => q.message ? tg("editMessageReplyMarkup", { chat_id: draft.chat_id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: `tpd_done:${id}:0` }]] } }).catch(() => undefined) : undefined;
  if (action === "tpd_no") {
    const done = await db().prepare("UPDATE telegram_trip_drafts SET status='cancelled',replied_chat=NULL,state_json=NULL,updated_at=? WHERE id=? AND status='draft' AND version=?").bind(new Date().toISOString(), id, version).run();
    if (done.meta.changes) await markup(`ยกเลิกแล้ว · ${member.display_name}`);
    return answer(done.meta.changes ? "ยกเลิกแล้ว" : "ร่างนี้ปิดแล้ว");
  }
  if (action !== "tpd_ok") return answer("");
  if (!fresh(draft)) return answer(`ร่างนี้หมดอายุแล้ว (${TRIP_DRAFT_HOURS} ชั่วโมง) ส่ง /add_trip ใหม่`, true);
  const state = parse<TripDraftState | null>(draft.state_json, null);
  if (!state || !tripDraftReady(state) || !state.car.ok) return answer("ยังสร้างไม่ได้: ข้อมูลยังไม่ครบ ตอบกลับข้อความเพื่อแก้", true);
  if (state.tripDate && state.tripDate < (deps.today ?? bangkokToday())) return answer("วันที่ผ่านไปแล้ว ตอบกลับเพื่อแก้วันที่", true);
  const claimed = await db().prepare("UPDATE telegram_trip_drafts SET status='building',updated_at=? WHERE id=? AND status='draft' AND version=?").bind(new Date().toISOString(), id, version).run();
  if (!claimed.meta.changes) return answer("ทริปนี้กำลังสร้างหรือสร้างแล้ว", true);
  await answer("กำลังสร้างทริป…");
  await markup(`✅ สร้างแล้ว · ${member.display_name}`);
  try {
    await buildFromDraft(draft, state, member, deps);
    await db().prepare("UPDATE telegram_trip_drafts SET status='built',replied_chat=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
  } catch (error) {
    console.error("trip builder failed", error instanceof Error ? error.message : "unknown");
    // Not put back to draft: the trip may already exist. Staff check Admin → Smart trips first.
    await db().prepare("UPDATE telegram_trip_drafts SET status='failed',replied_chat=NULL,updated_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
    await sendTo(draft.chat_id, "⚠️ สร้างทริปไม่สำเร็จ ตรวจที่ Admin → Smart trips ก่อนว่ามีทริปนี้หรือยัง แล้วค่อยส่ง /add_trip ใหม่", undefined, draft.request_message_id).catch(() => undefined);
  }
}

/** The confirmed summary → the trip: new places from Google are saved now, then packages are asked or the trip is built. */
async function buildFromDraft(draft: DraftRow, s: TripDraftState, member: { display_name: string }, deps: BuilderDeps) {
  if (!s.car.ok) return;
  const list = await listAttractions();
  const added: string[] = [];
  const stops: TripInput["stops"] = [];
  for (const p of s.places.filter((x) => !x.notFound)) {
    let attractionId = p.attractionId, name = p.name, lat = p.lat, lng = p.lng, durationMin = p.durationMin;
    if (!attractionId) {
      const row = await findByName(p.name) ?? await saveGooglePlace(p, s.area);
      if (!row) continue;
      if (!list.some((a) => a.id === row.id)) added.push(row.name);
      attractionId = row.id; name = row.customerName || row.name; lat = row.latitude; lng = row.longitude; durationMin = row.durationMin;
    }
    stops.push({ id: p.stopId, kind: "attraction", name, attractionId, lat, lng, durationMin, priority: p.priority, ...(p.note ? { note: p.note } : {}) });
  }
  const pickup = s.pickup?.found ? s.pickup : null, dropoff = s.dropoff?.found ? s.dropoff : null;
  const pending: Pending = {
    chatId: draft.chat_id, messageId: draft.request_message_id, by: `Telegram · ${member.display_name}`.slice(0, 80), member: member.display_name, price: s.price,
    days: s.multiday ? s.multiday.days : null, pinned: s.multiday ? Object.fromEntries(s.places.flatMap((p) => (p.day && stops.some((x) => x.id === p.stopId) ? [[p.stopId, p.day - 1]] : []))) : {},
    // Single day: the summary already settled the hours (typed, or by the places), so they are charged as shown.
    hoursGiven: s.multiday ? s.hoursGiven : true, multiday: Boolean(s.multiday), added, notFound: [], cityHint: s.area || "",
    input: { title: s.title, area: s.area, tripDate: s.tripDate, startTime: s.startTime ?? "08:00", pickupText: pickup ? pickup.name : s.pickup?.text ?? "",
      pickupLat: pickup?.lat ?? null, pickupLng: pickup?.lng ?? null, endText: dropoff ? dropoff.name : "", endLat: dropoff?.lat ?? null, endLng: dropoff?.lng ?? null,
      durationHours: s.multiday && !s.hoursGiven ? MAX_DAY_HOURS : s.hours, adults: s.adults, children: s.children, bags: s.bags, vehicle: s.car.vehicle,
      language: s.language, customerName: null, notes: s.notes, stops },
    // Places with packages: staff choose the package in Telegram before the trip is built.
    queue: stops.filter((x) => (list.find((a) => a.id === x.attractionId)?.programs.length ?? 0) > 0).map((x) => x.id),
  };
  if (!pending.queue.length) { await finishTrip(pending, deps); return; }
  const pid = crypto.randomUUID();
  await ensurePending();
  const now = new Date();
  await db().batch([
    db().prepare("DELETE FROM telegram_trip_pending WHERE created_at < ?").bind(new Date(now.getTime() - PENDING_HOURS * 3600_000).toISOString()),
    db().prepare("INSERT INTO telegram_trip_pending(id,chat_id,message_id,step,payload_json,created_at) VALUES(?,?,?,0,?,?)").bind(pid, draft.chat_id, draft.request_message_id, JSON.stringify(pending), now.toISOString()),
  ]);
  await askPackage(pid, pending, 0);
}

/**
 * A place from the confirmed summary that is not in Attractions: saved with the location, hours, category and area
 * Google gave (the trip's area when Google's address names none; empty when neither is one of the fixed areas).
 */
async function saveGooglePlace(p: DraftPlace, tripArea: string) {
  if (p.lat == null || p.lng == null) return null;
  const g = p.fromGoogle;
  const hours = Boolean(g?.openTime);
  const id = await saveAttraction(attractionSchema.parse({ name: p.name, area: g?.area ?? areaOf(tripArea) ?? "", category: g?.category ?? "sight",
    openTime: g?.openTime ?? null, closeTime: g?.closeTime ?? null, closedDays: g?.closedDays ?? [], durationMin: 60, latitude: p.lat, longitude: p.lng,
    internalNotes: `Added from Telegram (/add_trip)${hours ? "; opening hours from Google Maps" : ""}${g?.category ? "; category from Google Maps" : ""}` }));
  const [row] = await getDb().select().from(attractions).where(eq(attractions.id, id)).limit(1);
  return row ?? null;
}

/** A /add_trip waiting for package choices (telegram_trip_pending.payload_json). */
type Pending = {
  chatId: string; messageId: number; by: string; member: string; price: number | null; days: number | null; pinned: Record<string, number>;
  hoursGiven: boolean; multiday: boolean; added: string[]; notFound: string[]; cityHint: string; queue: string[];
  input: Omit<TripInput, "pickupLat" | "pickupLng" | "endText" | "endLat" | "endLng" | "transportPrice" | "discount" | "holdDays" | "isTemplate" | "templateName" | "customerEmail" | "customerPhone"> & { customerPhone?: null }
    // The pickup and drop-off found on Google Maps in the summary (a drop-off left empty is the pickup).
    & { pickupLat?: number | null; pickupLng?: number | null; endText?: string; endLat?: number | null; endLng?: number | null };
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

/** A package button under a /add_trip question (Admin group, team only; the webhook checks both). */
export async function handleTripPackageChoice(q: { id: string; data?: string; message?: TelegramMessage }, member: { display_name: string }, deps: BuilderDeps = {}) {
  const answer = (text: string, alert = false) => tg("answerCallbackQuery", { callback_query_id: q.id, text, show_alert: alert }).catch(() => undefined);
  const [, id = "", choice = ""] = (q.data ?? "").split(":");
  const [stepText, pick] = choice.split(".");
  const step = Number(stepText);
  if (!tripBuilderOn(vars())) return answer("คำสั่ง /add_trip ยังไม่ได้เปิดใช้", true);
  await ensurePending();
  const row = await db().prepare("SELECT step, payload_json, created_at FROM telegram_trip_pending WHERE id = ?").bind(id).first<{ step: number; payload_json: string; created_at: string }>();
  if (!row || !Number.isInteger(step)) return answer("ไม่พบทริปนี้ ส่ง /add_trip ใหม่", true);
  if (Date.now() - Date.parse(row.created_at) > PENDING_HOURS * 3600_000) return answer("หมดเวลาเลือกแล้ว ส่ง /add_trip ใหม่", true);
  if (row.step !== step) return answer("ข้อนี้เลือกไปแล้ว");
  const p = JSON.parse(row.payload_json) as Pending;
  const stop = p.input.stops.find((x) => x.id === p.queue[step]);
  const place = stop?.attractionId ? (await attractionsById([stop.attractionId]))[stop.attractionId] : undefined;
  if (!stop) return answer("ไม่พบทริปนี้ ส่ง /add_trip ใหม่", true);
  const option = pick === "g" ? null : packageOptions(place?.programs ?? [])[Number(pick)];
  if (pick !== "g" && !option) return answer("ตัวเลือกนี้ใช้ไม่ได้แล้ว ส่ง /add_trip ใหม่", true);
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
    await sendTo(p.chatId, "⚠️ สร้างทริปไม่สำเร็จ ส่ง /add_trip ใหม่อีกครั้ง (ข้อความใหม่)", undefined, p.messageId).catch(() => undefined);
  }
}

/** Builds, prices and sends the trip (several days when TRIP_MULTIDAY=1 and the places need them), then posts it back. */
async function finishTrip(p: Pending, deps: BuilderDeps) {
  const reply = (text: string) => sendTo(p.chatId, text, undefined, p.messageId).catch(() => undefined);
  const known = p.input.pickupLat != null && p.input.pickupLng != null ? { lat: p.input.pickupLat, lng: p.input.pickupLng } : null;
  const pickup = known ?? (p.input.pickupText ? await (deps.locate ?? defaultLocatePlace)(p.input.pickupText).catch(() => null) : null);
  let draftInput = { ...p.input, pickupLat: pickup?.lat ?? null, pickupLng: pickup?.lng ?? null, transportPrice: p.price ?? 0, holdDays: 7 };
  // A package time chosen after the summary can change the day: nearest-first again with the package times kept.
  if (!p.multiday && p.input.stops.some((s) => s.sessionTime)) {
    const { planInput } = await planFor(tripSchema.parse(draftInput));
    draftInput = { ...draftInput, stops: nearestFirst(p.input.stops as TripStop[], planInput).stops as TripInput["stops"] };
  }
  const input = tripSchema.parse(draftInput);
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
        `ใส่ราคาที่ Admin → Smart trips แล้วกดส่ง: ${esc(`${origin}/admin/trips/${lead.id}`)}`, "หรือส่ง /add_trip ใหม่พร้อมราคา เช่น <code>THB 3,500</code>"].join("\n"));
      return;
    }
    for (const [i, d] of days.entries()) await saveTrip({ ...inputFromRow(d), id: d.id, durationHours: charged[i]!, transportPrice: rates[i]! }, { name: p.by, agencyId: d.agencyId });
    days = await current();
  }
  let sent: Awaited<ReturnType<typeof sendTripDays>>;
  try { sent = await sendTripDays(days, p.by, "First itinerary (Telegram)"); }
  catch (error) {
    if ((error as Error).message !== "CONFLICT") throw error;
    await reply([`⚠️ ทริป <b>${esc(lead.ref)}</b> ยังไม่ได้ส่ง: มีคนแก้ไขหรือส่งทริปนี้พร้อมกัน`, `ตรวจแล้วกดส่งที่ Admin → Smart trips: ${esc(`${origin}/admin/trips/${lead.id}`)}`].join("\n"));
    return;
  }
  const { total, warnings } = sent;
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
    ...(p.notFound.length ? [`⚠️ ไม่พบใน Google Maps (ไม่ได้ใส่ในทริป): ${p.notFound.map(esc).join(", ")} เพิ่มได้ด้วย /add_attraction`] : []),
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
  // Where the category and the area came from, for the reply.
  let categoryFrom: "typed" | "google" | "kept" | "default" = place.category ? "typed" : "kept";
  let areaFrom: "typed" | "google" | "kept" = place.area ? "typed" : "kept";
  if (row) {
    // Google only fills what nobody has entered: staff hours, typed now or before, always win. It is asked only when
    // something is still missing (hours, location or area).
    const savedArea = areaOf(row.area);
    const info = (!typed && !row.openTime) || row.latitude == null || (!place.area && !savedArea) ? await lookup() : null;
    fromGoogle = !typed && !row.openTime ? info?.hours ?? null : null;
    const googleArea = !place.area && !savedArea ? areaOf(info?.address) : null;
    if (googleArea) areaFrom = "google";
    const saved = (() => { try { return JSON.parse(row.vibesJson) as string[]; } catch { return []; } })();
    const vibes = place.vibes.length ? [...new Set([...saved, ...place.vibes])] : null;
    // A typed area always wins; an old free-text area ("patong") is saved as its fixed area ("Phuket").
    const area = place.area || googleArea || (savedArea && savedArea !== row.area ? savedArea : null);
    const changes = { ...(typed ?? {}), ...(fromGoogle ? { openTime: fromGoogle.openTime, closeTime: fromGoogle.closeTime, closedDaysJson: JSON.stringify(fromGoogle.closedDays) } : {}),
      ...(info && row.latitude == null ? { latitude: info.lat, longitude: info.lng } : {}),
      ...(place.durationMin ? { durationMin: place.durationMin } : {}), ...(area ? { area } : {}), ...(place.neighbourhood ? { neighbourhood: place.neighbourhood } : {}),
      ...(place.category ? { category: place.category } : {}), ...(place.bestTime ? { bestTime: place.bestTime } : {}), ...(vibes ? { vibesJson: JSON.stringify(vibes) } : {}) };
    if (Object.keys(changes).length) await getDb().update(attractions).set({ ...changes, updatedAt: new Date().toISOString() }).where(eq(attractions.id, row.id));
  } else {
    const info = await lookup();
    fromGoogle = typed ? null : info?.hours ?? null;
    const googleCategory = place.category ? null : categoryFromGoogle(info?.primaryType, info?.types);
    categoryFrom = place.category ? "typed" : googleCategory ? "google" : "default";
    const googleArea = place.area ? null : areaOf(info?.address);
    areaFrom = place.area ? "typed" : googleArea ? "google" : "kept";
    const id = await saveAttraction(attractionSchema.parse({ name: place.name, area: place.area || googleArea || "", neighbourhood: place.neighbourhood,
      category: place.category ?? googleCategory ?? "sight", bestTime: place.bestTime, vibes: place.vibes,
      openTime: typed?.openTime ?? fromGoogle?.openTime ?? null, closeTime: typed?.closeTime ?? fromGoogle?.closeTime ?? null,
      closedDays: fromGoogle?.closedDays ?? [], durationMin: place.durationMin ?? 60, latitude: info?.lat ?? null, longitude: info?.lng ?? null,
      internalNotes: `Added from Telegram (/add_attraction)${fromGoogle ? "; opening hours from Google Maps" : ""}${googleCategory ? "; category from Google Maps" : ""}` }));
    [row] = await getDb().select().from(attractions).where(eq(attractions.id, id)).limit(1);
  }
  if (!row) return;
  const photo = m.photo?.length ? await storePhoto(m) : null;
  if (photo) await addPhoto(row, photo);
  [row] = await getDb().select().from(attractions).where(eq(attractions.id, row.id)).limit(1);
  const photos = (row.coverImage ? 1 : 0) + ((() => { try { return (JSON.parse(row.galleryJson) as string[]).length; } catch { return 0; } })());
  const vibesNow = (() => { try { return JSON.parse(row.vibesJson) as string[]; } catch { return []; } })();
  const sent = await sendTo(chatId, [
    `✅ ${created ? "เพิ่ม" : "อัปเดต"}สถานที่ <b>${esc(row.name)}</b> ${created ? "ในรายการสถานที่แล้ว" : "แล้ว"}`,
    `🕘 ${placeHoursLineTh({ openTime: row.openTime, closeTime: row.closeTime, closedDays: (() => { try { return JSON.parse(row.closedDaysJson) as number[]; } catch { return []; } })() }, fromGoogle)} · ใช้เวลาประมาณ ${row.durationMin} นาที`,
    placeFiledTh({ name: row.name, category: row.category, area: row.area, neighbourhood: row.neighbourhood, bestTime: row.bestTime, vibes: vibesNow }, { categoryFrom, areaFrom }),
    ...(place.unknown.length ? [placeUnknownTh(place.unknown)] : []),
    `📷 รูป ${photos} รูป${m.photo?.length && !photo ? " (บันทึกรูปไม่สำเร็จ ลองส่งใหม่)" : ""}`,
    created && row.latitude == null ? "📍 ยังไม่มีพิกัด: ระยะเวลาขับรถจะเป็นค่าประมาณ แก้ได้ที่ Admin → Attractions" : "",
    "ตอบกลับข้อความนี้ด้วยรูปเพื่อเพิ่มรูป",
  ].filter(Boolean).join("\n"), undefined, m.message_id).catch(() => null);
  if (sent) await remember(chatId, sent.message_id, "place_reply", row.id);
}

/** A photo sent as a reply to a /add_attraction confirmation: added to that attraction. True when handled. */
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
