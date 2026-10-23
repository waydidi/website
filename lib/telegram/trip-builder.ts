import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attractions } from "@/db/schema";
import { attractionSchema, listAttractions, saveAttraction } from "@/lib/attractions";
import { findPlace } from "@/lib/cee/quotes";
import { putFile } from "@/lib/file-store";
import { publicSiteUrl } from "@/lib/site";
import { getTrip, groupDays, saveTrip, sendTripDays, tripSchema, tripSnapshot, type TripInput } from "@/lib/smart-trips";
import type { PlaceOption } from "@/lib/trip-chat-rules";
import { chatPlanConfigured, draftFromChat, type ModelCall } from "@/lib/trip-from-chat";
import { itineraryPdf } from "@/lib/trip-itinerary-file";
import { VEHICLES } from "@/lib/vehicles";
import { esc } from "./cards";
import { downloadFile, sendDocument, sendTo, tg, telegramChatId, type TelegramMessage } from "./client";
import { MISSING_TH, PLACE_HELP, TRIP_HELP, matchPlace, parsePlaceCommand, parsePlaceDetails, parseStaffPrice, parseTripCommand, pickVehicle, tripBuilderOn } from "./trip-builder-rules";

// /trip and /place in the Admin group (team list only; the webhook checks that). /trip builds a smart trip from the
// staff's text, sends it (freezes the version and makes the link) and posts the link and the PDF back to the Admin
// group. The bot never messages the customer: staff forward the link. /place adds or updates an attraction (name,
// opening hours, photos) so the next /trip can use it. Off until TELEGRAM_TRIP_BUILDER=1.

type Db = { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> } } };
const db = () => env.DB as unknown as Db;
const vars = () => env as unknown as Record<string, string | undefined>;
export type BuilderDeps = { call?: ModelCall; locate?: (text: string) => Promise<{ lat: number; lng: number } | null>; today?: string };
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
  if (!details) { await reply(TRIP_HELP); return; }
  // The price comes from the staff's own words, before any AI: no clear price, no trip.
  const price = parseStaffPrice(details);
  if (!price.ok) {
    await reply(price.reason === "missing" ? `⚠️ ยังไม่ได้สร้างทริป: ใส่ราคาด้วย เช่น <code>THB 3,500</code> หรือ <code>ราคา 3500 บาท</code>`
      : `⚠️ ยังไม่ได้สร้างทริป: พบหลายราคา (${price.amounts.map(thb).join(", ")}) เขียนราคาทริปให้ชัด เช่น <code>ราคา 3500 บาท</code>`);
    return;
  }
  if (!deps.call && !chatPlanConfigured()) { await reply("ยังไม่ได้เปิดผู้ช่วย AI (ANTHROPIC_API_KEY) จึงอ่านรายละเอียดทริปไม่ได้"); return; }
  if (!(await claim(chatId, m.message_id, "trip"))) return;
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
  const list = await listAttractions();
  const places: PlaceOption[] = list.map((a) => ({ id: a.id, name: a.customerName || a.name, area: a.area, durationMin: a.durationMin, lat: a.latitude, lng: a.longitude, usedIn: 0 }));
  const drafted = await draftFromChat(details, places, deps.today ?? bangkokToday(), ...(deps.call ? [deps.call] : [])).catch(() => null);
  if (!drafted) { await reply("⚠️ สร้างทริปไม่สำเร็จ ลองส่ง /trip อีกครั้ง"); return; }
  if (!drafted.ok) { await reply(`⚠️ ยังไม่ได้สร้างทริป: ${esc(drafted.error)}`); return; }
  const d = drafted.draft;
  if (d.unmatched.length) {
    await reply(`⚠️ ยังไม่ได้สร้างทริป: ไม่พบสถานที่เหล่านี้ในรายการสถานที่\n${d.unmatched.map((n) => `• ${esc(n)}`).join("\n")}\n\n${PLACE_HELP}\nแล้วส่ง /trip อีกครั้ง`);
    return;
  }
  if (d.missing.length) { await reply(`⚠️ ยังไม่ได้สร้างทริป: ขาด${d.missing.map((x) => MISSING_TH[x] ?? x).join(", ")}\n\n${TRIP_HELP}`); return; }
  if (d.suggested) { await reply("⚠️ ยังไม่ได้สร้างทริป: ระบุชื่อสถานที่ที่จะไปด้วย (บอทไม่เลือกสถานที่ให้เอง)"); return; }
  const car = pickVehicle(details, d.adults + d.children, d.bags);
  if (!car.ok) {
    await reply(car.vehicle ? `⚠️ ยังไม่ได้สร้างทริป: ${VEHICLES[car.vehicle].name} นั่งได้ ${VEHICLES[car.vehicle].passengers} คน ${VEHICLES[car.vehicle].bags} กระเป๋า ไม่พอสำหรับ ${d.adults + d.children} คน ${d.bags} กระเป๋า`
      : `⚠️ ยังไม่ได้สร้างทริป: ไม่มีรถที่นั่งพอสำหรับ ${d.adults + d.children} คน ${d.bags} กระเป๋า`);
    return;
  }
  const pickup = await (deps.locate ?? defaultLocate)(d.pickupText);
  const input: TripInput = tripSchema.parse({
    title: d.title, area: d.area, tripDate: d.tripDate, startTime: d.startTime, pickupText: d.pickupText, pickupLat: pickup?.lat ?? null, pickupLng: pickup?.lng ?? null,
    durationHours: d.durationHours, adults: d.adults, children: d.children, bags: d.bags, vehicle: car.vehicle, language: d.language,
    customerName: d.customerName, notes: d.notes, transportPrice: price.thb, holdDays: 7,
    stops: d.stops.map((s) => ({ id: s.id, kind: s.kind, name: s.name, attractionId: s.attractionId, lat: s.lat ?? null, lng: s.lng ?? null, durationMin: s.durationMin, priority: s.priority, ...(s.note ? { note: s.note } : {}) })),
  });
  const by = `Telegram · ${member.display_name}`.slice(0, 80);
  const saved = await saveTrip(input, { name: by });
  await remember(chatId, m.message_id, "trip", saved.id);
  const row = await getTrip(saved.id);
  if (!row) return;
  const { total, warnings } = await sendTripDays(await groupDays(row), by, "First itinerary (Telegram)");
  const sent = await getTrip(saved.id);
  const snap = sent ? tripSnapshot(sent) : null;
  if (!sent || !snap) return;
  const origin = publicSiteUrl(vars().WAYDIDI_PUBLIC_URL);
  const link = `${origin}/itinerary/${sent.token}`;
  const people = `${snap.adults} ผู้ใหญ่${snap.children ? ` ${snap.children} เด็ก` : ""}`;
  const lines = [
    `✅ สร้างและส่งทริป <b>${esc(snap.ref)}</b> แล้ว (โดย ${esc(member.display_name)})`,
    `<b>${esc(snap.title)}</b>`,
    `📅 ${thaiDate(snap.tripDate)} · รับ ${snap.startTime} ${esc(snap.pickupText)}`,
    `📍 ${snap.stops.map((s) => esc(s.name)).join(" → ")}`,
    `🚗 ${esc(snap.vehicleName)} · ${people}`,
    `💰 ${thb(total)}${snap.feesIncluded ? ` (รถ ${thb(snap.transportPrice)} + ตั๋ว ${thb(snap.feesIncluded)})` : ""}${snap.feesOnSite ? ` · ค่าเข้าชมจ่ายหน้างานประมาณ ${thb(snap.feesOnSite)}` : ""}`,
    ...(warnings.length ? [`⚠️ ตรวจก่อนส่งลูกค้า:\n${warnings.map((w) => `• ${esc(w)}`).join("\n")}`] : []),
    `🔗 ${esc(link)}`,
    "บอทไม่ได้ส่งให้ลูกค้า ส่งลิงก์นี้ให้ลูกค้าเอง แก้ไขได้ที่ Admin → Smart trips",
  ];
  await reply(lines.join("\n"));
  const pdf = await itineraryPdf(sent, origin).catch(() => null);
  if (pdf) await sendDocument(pdf.bytes, `Waydidi-${pdf.ref}-itinerary.pdf`, "application/pdf", `📄 แผนการเดินทาง ${esc(pdf.ref)}`, chatId, m.message_id).catch((e) => console.error("trip builder pdf failed", e instanceof Error ? e.message : "unknown"));
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
  else if (gallery.length < 12) await getDb().update(attractions).set({ galleryJson: JSON.stringify([...gallery, url]), updatedAt: new Date().toISOString() }).where(eq(attractions.id, row.id));
  return gallery.length + 1 + (row.coverImage ? 1 : 0);
}

async function addPlace(details: string, m: TelegramMessage, reply: (t: string) => Promise<unknown>, deps: BuilderDeps) {
  const chatId = String(m.chat.id);
  const place = parsePlaceDetails(details);
  if (!place) { await reply(PLACE_HELP); return; }
  if (!(await claim(chatId, m.message_id, "place"))) return;
  let row = await findByName(place.name);
  const created = !row;
  if (row) {
    const changes = { ...(place.openTime ? { openTime: place.openTime, closeTime: place.closeTime } : {}), ...(place.durationMin ? { durationMin: place.durationMin } : {}), ...(place.area && !row.area ? { area: place.area } : {}) };
    if (Object.keys(changes).length) await getDb().update(attractions).set({ ...changes, updatedAt: new Date().toISOString() }).where(eq(attractions.id, row.id));
  } else {
    const at = await (deps.locate ?? defaultLocate)([place.name, place.area].filter(Boolean).join(", "));
    const id = await saveAttraction(attractionSchema.parse({ name: place.name, area: place.area, openTime: place.openTime, closeTime: place.closeTime,
      durationMin: place.durationMin ?? 60, latitude: at?.lat ?? null, longitude: at?.lng ?? null, internalNotes: "Added from Telegram (/place)" }));
    [row] = await getDb().select().from(attractions).where(eq(attractions.id, id)).limit(1);
  }
  if (!row) return;
  const photo = m.photo?.length ? await storePhoto(m) : null;
  if (photo) await addPhoto(row, photo);
  [row] = await getDb().select().from(attractions).where(eq(attractions.id, row.id)).limit(1);
  const photos = (row.coverImage ? 1 : 0) + ((() => { try { return (JSON.parse(row.galleryJson) as string[]).length; } catch { return 0; } })());
  const sent = await sendTo(chatId, [
    `✅ ${created ? "เพิ่ม" : "อัปเดต"}สถานที่ <b>${esc(row.name)}</b> ${created ? "ในรายการสถานที่แล้ว" : "แล้ว"}`,
    `🕘 ${row.openTime && row.closeTime ? `เปิด ${row.openTime}–${row.closeTime}` : "ยังไม่มีเวลาเปิด"} · ใช้เวลาประมาณ ${row.durationMin} นาที${row.area ? ` · ${esc(row.area)}` : ""}`,
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
