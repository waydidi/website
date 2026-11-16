import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// /trip and /place in the Telegram Admin group, end to end on an in-memory D1. /trip is read by a scripted model, the
// bot posts a check-first summary (Google Maps lookups faked), and only the สร้างทริป tap builds, sends and posts the
// trip back with its link and PDF. Telegram is a fake that records what the bot sends.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
const ADMIN = '-100111';
globalThis.__tbEnv = { DB: d1, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: ADMIN, TELEGRAM_TRIP_BUILDER: '1', WAYDIDI_PUBLIC_URL: 'https://waydidi.example' };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'tb-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0tb-env'; }, load(id) { if (id === '\0tb-env') return 'export const env=globalThis.__tbEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__tbEnv; });
const tb = await vite.ssrLoadModule('/lib/telegram/trip-builder.ts');

const now = new Date().toISOString();
for (const [id, name, lat, lng] of [['grand-palace', 'Grand Palace', 13.75, 100.49], ['wat-pho', 'Wat Pho', 13.746, 100.493]])
  await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES(?,?,'Bangkok',?,?,90,'08:30','15:30','active',?,?)").bind(id, name, lat, lng, now, now).run();

// Fake Telegram: every call is recorded with the message id it returns; getFile and the file download serve a tiny JPEG.
let sent = [], nextId = 500;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/file/bottest-token/')) return new Response(JPEG);
  const method = u.split('/').pop();
  const body = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v])) : JSON.parse(String(init.body ?? '{}'));
  const id = nextId++;
  sent.push({ method, body, id });
  if (method === 'getFile') return Response.json({ ok: true, result: { file_path: 'photos/p.jpg', file_size: JPEG.length } });
  return Response.json({ ok: true, result: { message_id: id } });
};
beforeEach(() => { sent = []; });
const replies = () => sent.filter((s) => s.method === 'sendMessage').map((s) => s.body.text);
const answers = () => sent.filter((s) => s.method === 'answerCallbackQuery').map((s) => s.body.text);

const today = '2026-10-22';
const plan = (over = {}) => JSON.stringify({ title: 'Bangkok temples', area: 'Bangkok', date: '2026-12-12', startTime: '08:00', hours: 6, adults: 2, children: 0, bags: 1,
  pickup: 'Hilton Sukhumvit', dropoff: null, customerName: null, language: 'en', notes: '', suggested: false,
  stops: [{ placeId: 'grand-palace', name: 'Grand Palace', priority: 'must' }, { placeId: 'wat-pho', name: 'Wat Pho', priority: 'must' }], ...over });
/** A scripted model: answers in turn (the last one repeats). */
function model(...list) { const answersList = list.length ? list : [plan()]; const m = { calls: 0, prompts: [], call: async (_system, user) => { const a = answersList[Math.min(m.calls, answersList.length - 1)]; m.calls++; m.prompts.push(user); if (a instanceof Error || (a && typeof a === 'object')) throw a; return a; } }; return m; }
const anna = { display_name: 'Anna' }, ben = { display_name: 'Ben' };
let msg = 1000;
const message = (text, extra = {}) => ({ message_id: ++msg, chat: { id: Number(ADMIN), type: 'supergroup' }, from: { id: 42, first_name: 'Anna' }, text, ...extra });
const located = [];
const locate = async (text) => { located.push(text); return /nowhere/i.test(text) ? null : { lat: 13.74, lng: 100.55, name: text.replace(/\b\w/g, (c) => c.toUpperCase()), address: "1 Main Rd, Thailand" }; };
const deps = (m, place = async () => ({ lat: 13.74, lng: 100.55, hours: null }), rate = async () => null) => ({ call: m.call, locate, place, rate, today });
const trips = async () => (await d1.prepare('SELECT * FROM smart_trips ORDER BY created_at').all()).results;
/** The latest summary the bot posted (the message with the draft's buttons). */
const summary = () => sent.findLast((s) => s.method === 'sendMessage' && JSON.stringify(s.body.reply_markup ?? {}).includes('tpd_'));
const button = (s, action = 'tpd_ok') => s.body.reply_markup.inline_keyboard.flat().find((b) => b.callback_data.startsWith(`${action}:`));
let cb = 0;
const tap = async (s, d, member = anna, action = 'tpd_ok') => {
  const b = button(s, action);
  assert.ok(b, `the summary has a ${action} button`);
  const [act, id, version] = b.callback_data.split(':');
  return tb.handleTripDraftCallback(act, id, version, member, { id: `cb${++cb}`, message: { message_id: s.id, chat: { id: Number(ADMIN) } } }, d);
};
const replyTo = (s, text) => message(text, { reply_to_message: { message_id: s.id, chat: { id: Number(ADMIN) }, from: { id: 7, is_bot: true } } });

test('a free-text /trip gets a check-first summary; only the tap builds, sends and posts it back with its link and PDF', async () => {
  const m = model(), before = (await trips()).length;
  const handled = await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 adults, Hilton Sukhumvit 08:00, Grand Palace, Wat Pho, SUV, THB 3,500'), anna, deps(m));
  assert.equal(handled, true);
  assert.equal(m.calls, 1, 'the AI reads the text');
  assert.equal((await trips()).length, before, 'nothing is built before the tap');
  const s = summary();
  assert.match(s.body.text, /ทริปใหม่ \(ร่าง\) ตรวจก่อนสร้าง[\s\S]*รับ 08:00 · 6 ชม\.[\s\S]*2 ผู้ใหญ่ · 🚗 Comfort SUV\n[\s\S]*📍 รับ: Hilton Sukhumvit, 1 Main Rd, Thailand \(Google Maps\)[\s\S]*🏁 ส่ง: ❔ ที่เดียวกับจุดรับ[\s\S]*เส้นทาง \(ใกล้ที่สุดก่อน\)[\s\S]*THB 3,500 \(ราคาที่พิมพ์\)[\s\S]*✅ ข้อมูลครบ/);
  assert.ok(button(s), 'the สร้างทริป button is shown when nothing is missing');
  await tap(s, deps(m));
  const all = await trips();
  assert.equal(all.length, before + 1);
  const t = all.at(-1);
  assert.deepEqual([t.status, t.transport_price, t.vehicle, t.version, t.created_by, t.trip_date, t.pickup_lat, t.pickup_text, t.start_time], ['sent', 3500, 'comfort_suv', 1, 'Telegram · Anna', '2026-12-12', 13.74, 'Hilton Sukhumvit', '08:00']);
  assert.ok(t.snapshot_json, 'the version the customer sees is frozen');
  const text = replies().join('\n');
  assert.match(text, new RegExp(`https://waydidi.example/itinerary/${t.token}`));
  assert.match(text, /THB 3,500/);
  const doc = sent.find((s) => s.method === 'sendDocument');
  assert.ok(doc, 'the PDF is posted');
  const pdf = new Uint8Array(await doc.body.document.arrayBuffer());
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), '%PDF');
  assert.ok(sent.every((x) => String(x.body.chat_id ?? ADMIN) === ADMIN), 'nothing goes anywhere but the Admin group');
  assert.equal((await d1.prepare('SELECT status FROM telegram_trip_drafts ORDER BY created_at DESC LIMIT 1').first()).status, 'built');
});

test('the same /trip delivered twice makes one draft; two taps (or two people at once) build one trip', async () => {
  const m = model(), msg1 = message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Grand Palace, Wat Pho, THB 3,000'), before = (await trips()).length;
  await Promise.all([tb.handleTripBuilder(msg1, anna, deps(m)), tb.handleTripBuilder(msg1, anna, deps(m))]);
  await tb.handleTripBuilder(msg1, anna, deps(m));
  assert.equal(m.calls, 1, 'read once');
  assert.equal(sent.filter((x) => JSON.stringify(x.body.reply_markup ?? {}).includes('tpd_ok')).length, 1, 'one summary');
  const s = summary();
  await Promise.all([tap(s, deps(m), anna), tap(s, deps(m), ben)]);
  await tap(s, deps(m));
  assert.equal((await trips()).length, before + 1);
  assert.equal(sent.filter((x) => x.method === 'sendDocument').length, 1);
  assert.match(answers().join('\n'), /กำลังสร้างหรือสร้างแล้ว/);
});

test('"/trip", "/trip help" and "/trip create a new trip" reply with the guide: nothing is read or created', async () => {
  const m = model(), before = (await trips()).length;
  for (const text of ['/trip create a new trip', '/trip', '/trip help']) {
    await tb.handleTripBuilder(message(text), anna, deps(m));
    assert.match(replies().at(-1), /วิธีสร้างทริปผ่าน Telegram[\s\S]*แบบอิสระ[\s\S]*สรุปให้ตรวจก่อน[\s\S]*ต้องมี[\s\S]*จำนวนคน[\s\S]*วันที่[\s\S]*จุดรับและเวลารับ[\s\S]*1–2 คน Sedan, 3–4 คน SUV, 5–10 คน Van[\s\S]*<code>\/add_trip 4 people, pickup graceland resort patong/, text);
  }
  assert.equal(m.calls, 0);
  assert.equal((await trips()).length, before);
});

test("the owner's example without commas is read by the AI and summarised", async () => {
  const m = model(plan({ date: '2026-12-20', startTime: '09:00', hours: 8, adults: 4, pickup: 'graceland resort patong' }));
  await tb.handleTripBuilder(message('/add_trip 4 people, pickup graceland resort patong, grand palace, wat pho, pickup 9:00 am, 20/12/2026, trip 8 hours'), anna, deps(m, undefined, async () => 2800));
  const s = summary();
  assert.match(m.prompts[0], /4 people, pickup graceland resort patong/);
  assert.match(s.body.text, /รับ 09:00 · 8 ชม\.[\s\S]*4 ผู้ใหญ่ · 🚗 Comfort SUV \(อัตโนมัติตามจำนวนคน\)[\s\S]*Graceland Resort Patong[\s\S]*ประมาณ THB 2,800 ตามเรทรายชั่วโมง \(8 ชม\.\)/);
  assert.ok(button(s));
});

test('no price typed: the hourly rate is shown and charged; two unclear prices are asked about until one is given', async () => {
  const rates = [];
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, pickup Hilton Sukhumvit 08:00, Grand Palace, Wat Pho, SUV, 6 hours'), anna, deps(model(), undefined, async (city, hours, vehicle) => { rates.push([city, hours, vehicle]); return 4200; }));
  assert.match(summary().body.text, /ประมาณ THB 4,200 ตามเรทรายชั่วโมง \(6 ชม\.\)/);
  await tap(summary(), deps(model(), undefined, async (city, hours, vehicle) => { rates.push([city, hours, vehicle]); return 4200; }));
  const t = (await trips()).at(-1);
  assert.deepEqual([t.status, t.transport_price], ['sent', 4200]);
  assert.deepEqual(rates[0], ['Hilton Sukhumvit', 6, 'comfort_suv'], 'the pickup decides the city; the day is 6 hours');

  const before = (await trips()).length;
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Grand Palace, car THB 3,000, tickets THB 1,000'), anna, deps(model()));
  let s = summary();
  assert.match(s.body.text, /พบหลายราคา \(THB 3,000, THB 1,000\)/);
  assert.equal(button(s), undefined, 'no สร้างทริป button while the price is unclear');
  await tb.handleTripBuilder(replyTo(s, 'price THB 3,000'), anna, deps(model()));
  s = summary();
  assert.match(s.body.text, /THB 3,000 \(ราคาที่พิมพ์\)/);
  assert.ok(button(s), 'the newest price wins');
  assert.equal((await trips()).length, before);
});

test('no price and no hourly rate for the area: the price is asked for before anything is built', async () => {
  await tb.handleTripBuilder(message('/add_trip 12 Dec, Hilton Sukhumvit 08:00, Grand Palace, Wat Pho, 2 people'), anna, deps(model()));
  const s = summary();
  assert.match(s.body.text, /ยังขาด:.*ราคา/);
  assert.equal(button(s), undefined);
});

test('a place not in Attractions is found on Google and added only on the tap; one Google cannot find is asked about', async () => {
  const lookups = [];
  const google = async (q) => { lookups.push(q); return q.startsWith('Lumphini Park') ? { lat: 13.73, lng: 100.54, hours: { openTime: '04:30', closeTime: '21:00', closedDays: [], varies: false } } : null; };
  const first = plan({ stops: [{ placeId: 'grand-palace', name: 'Grand Palace' }, { placeId: null, name: 'Lumphini Park' }, { placeId: null, name: 'Nowhere Cafe' }] });
  const second = plan({ stops: [{ placeId: 'grand-palace', name: 'Grand Palace' }, { placeId: null, name: 'Lumphini Park' }] });
  const m = model(first, second);
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Grand Palace, Lumphini Park, Nowhere Cafe, THB 3,000'), anna, deps(m, google));
  let s = summary();
  assert.match(s.body.text, /Lumphini Park ➕/);
  assert.match(s.body.text, /ไม่พบ “Nowhere Cafe” ใน Google Maps/);
  assert.equal(button(s), undefined);
  assert.equal(await d1.prepare("SELECT COUNT(*) n FROM attractions WHERE name='Lumphini Park'").first('n'), 0, 'not saved before the tap');
  await tb.handleTripBuilder(replyTo(s, 'ไม่เอา Nowhere Cafe'), anna, deps(m, google));
  s = summary();
  assert.ok(button(s));
  assert.deepEqual(lookups, ['Lumphini Park, Bangkok', 'Nowhere Cafe, Bangkok'], 'the park is not looked up again for the correction');
  await tap(s, deps(m, google));
  const park = await d1.prepare("SELECT * FROM attractions WHERE name='Lumphini Park'").first();
  assert.deepEqual([park.open_time, park.close_time, park.latitude], ['04:30', '21:00', 13.73]);
  assert.match(park.internal_notes, /Added from Telegram \(\/add_trip\); opening hours from Google Maps/);
  assert.deepEqual([park.area, park.category], ['Bangkok', 'sight'], "Google gave no type or address here: the trip's area, and Sight");
  const t = (await trips()).at(-1);
  assert.deepEqual(JSON.parse(t.stops_json).map((x) => x.attractionId).sort(), ['grand-palace', park.id].sort());
  assert.match(replies().join('\n'), /เพิ่มสถานที่ใหม่จาก Google Maps: Lumphini Park/);
});

test('missing date, people, pickup time or pickup are asked; a reply fills them in and only then the button appears', async () => {
  const empty = plan({ date: null, startTime: null, adults: null, children: null, pickup: null });
  const m = model(empty, plan());
  await tb.handleTripBuilder(message('/add_trip Grand Palace, Wat Pho, THB 3,000'), anna, deps(m));
  let s = summary();
  assert.match(s.body.text, /ยังขาด:.*วันที่.*จำนวนคน.*เวลารับ.*จุดรับ/);
  assert.equal(button(s), undefined);
  await tb.handleTripBuilder(replyTo(s, '12 Dec, 2 people, pickup Hilton Sukhumvit 08:00'), anna, deps(m));
  s = summary();
  assert.match(m.prompts[1], /Grand Palace, Wat Pho, THB 3,000\nCorrection: 12 Dec, 2 people, pickup Hilton Sukhumvit 08:00/, 'the reply is read with the first message');
  assert.ok(button(s));
});

test("the car follows the owner's rule: 3–4 people SUV, 5–10 van; a named car too small or more than 10 people is asked", async () => {
  const at = async (people, text) => { await tb.handleTripBuilder(message(`/add_trip 12 Dec, ${people} people, Hilton Sukhumvit 08:00, Grand Palace, THB 3,000${text}`), anna, deps(model(plan({ adults: people })))); return summary().body.text; };
  assert.match(await at(3, ''), /🚗 Comfort SUV \(อัตโนมัติตามจำนวนคน\)/);
  assert.match(await at(6, ''), /🚗 Premium Minivan \(อัตโนมัติตามจำนวนคน\)/);
  assert.match(await at(2, ', van'), /🚗 Premium Minivan\n/);
  assert.match(await at(6, ', sedan'), /Economy sedan นั่งได้ 2 คน ไม่พอสำหรับ 6 คน/);
  assert.match(await at(11, ''), /11 คนเกินรถตู้ \(นั่งได้ 10 คน\)/);
  assert.equal(button(summary()), undefined);
});

test('nearest place first from the pickup; a place that would be closed by then is moved to when it is open', async () => {
  // Pickup at (13.70, 100.50); Near Temple is close, Far Market far. Early Museum is farthest but closes at 10:00.
  for (const [id, name, lat, close] of [['nf-near', 'Near Temple', 13.705, '18:00'], ['nf-far', 'Far Market', 13.80, '18:00'], ['nf-early', 'Early Museum', 13.83, '10:00']])
    await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES(?,?,'Bangkok',?,100.5,45,'07:00',?,'active',?,?)").bind(id, name, lat, close, now, now).run();
  const typedOrder = [{ placeId: 'nf-far', name: 'Far Market' }, { placeId: 'nf-near', name: 'Near Temple' }];
  const nearLocate = async (text) => ({ lat: 13.70, lng: 100.50, name: text, address: '' });
  const d = { ...deps(model(plan({ hours: 8, stops: typedOrder }))), locate: nearLocate };
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Far Market, Near Temple, THB 3,000'), anna, d);
  assert.match(summary().body.text, /1\. [\d:–]+ Near Temple\n2\. [\d:–]+ Far Market/, 'nearest first, whatever order was typed');

  const withEarly = { ...deps(model(plan({ hours: 8, stops: [...typedOrder, { placeId: 'nf-early', name: 'Early Museum' }] }))), locate: nearLocate };
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Far Market, Near Temple, Early Museum, THB 3,000'), anna, withEarly);
  const text = summary().body.text;
  const order = [...text.matchAll(/^\d\. [\d:–]+ (.+)$/gm)].map((x) => x[1]);
  assert.ok(order.indexOf('Early Museum') < 2, `Early Museum is moved before it closes (${order.join(', ')})`);
  assert.match(text, /↪️ ย้าย Early Museum เพราะถ้าไปตามระยะทางจะถึงหลังปิด/);
});

test('a drop-off other than the pickup is looked up on Google Maps and becomes the end of the trip', async () => {
  located.length = 0;
  const m = model(plan({ dropoff: 'Suvarnabhumi Airport' }));
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, pickup Hilton Sukhumvit 08:00, Grand Palace, drop off Suvarnabhumi Airport, THB 3,000'), anna, deps(m));
  const s = summary();
  assert.deepEqual(located, ['Hilton Sukhumvit', 'Suvarnabhumi Airport']);
  assert.match(s.body.text, /🏁 ส่ง: Suvarnabhumi Airport, 1 Main Rd, Thailand \(Google Maps\)/);
  await tap(s, deps(m));
  const t = (await trips()).at(-1);
  assert.deepEqual([t.end_text, t.end_lat], ['Suvarnabhumi Airport', 13.74]);
});

test('a pickup Google cannot find, or a date or number of people the code reads differently, is asked, never guessed', async () => {
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Nowhere Villa 08:00, Grand Palace, THB 3,000'), anna, deps(model(plan({ pickup: 'Nowhere Villa' }))));
  assert.match(summary().body.text, /ไม่พบจุดรับ “Nowhere Villa” ใน Google Maps/);
  assert.equal(button(summary()), undefined);
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 3 people, Hilton Sukhumvit 08:00, Grand Palace, THB 3,000'), anna, deps(model(plan({ adults: 2 }))));
  assert.match(summary().body.text, /ไม่แน่ใจจำนวนคน: 3 หรือ 2 คน/);
  assert.equal(button(summary()), undefined);
});

test('places more than 200 km apart (Wat Pho in Bangkok, Big Buddha in Phuket) are asked about; nothing is built', async () => {
  await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES('far-bb','Big Buddha','Phuket',7.828,98.312,60,'08:00','17:00','active',?,?)").bind(now, now).run();
  await tb.handleTripBuilder(message('/add_trip wat pho, big Buddha Phuket, 29 Nov 2 people, Hilton 08:00, THB 3,000'), anna, deps(model(plan({ stops: [{ placeId: 'wat-pho', name: 'Wat Pho' }, { placeId: 'far-bb', name: 'Big Buddha' }] }))));
  assert.match(summary().body.text, /Wat Pho กับ Big Buddha ห่างกันประมาณ \d[\d,]* กม\. ไปในวันเดียวไม่ได้/);
  assert.equal(button(summary()), undefined);
  await d1.prepare("DELETE FROM attractions WHERE id='far-bb'").run();
});

test('only the Telegram team, only the Admin group, only when switched on; old buttons and cancel do nothing more', async () => {
  const m = model(), before = (await trips()).length;
  assert.equal(await tb.handleTripBuilder(message('/add_trip 12 Dec, Grand Palace, THB 3,000'), null, deps(m)), true);
  assert.match(replies().at(-1), /เฉพาะทีม Waydidi/);
  assert.equal(await tb.handleTripBuilder({ ...message('/add_trip 12 Dec, Grand Palace, THB 3,000'), chat: { id: -100999, type: 'supergroup' } }, anna, deps(m)), true);
  globalThis.__tbEnv.TELEGRAM_TRIP_BUILDER = '';
  await tb.handleTripBuilder(message('/add_trip 12 Dec, Grand Palace, THB 3,000'), anna, deps(m));
  assert.match(replies().at(-1), /ยังไม่ได้เปิดใช้/);
  globalThis.__tbEnv.TELEGRAM_TRIP_BUILDER = '1';
  assert.equal(m.calls, 0);
  assert.equal(await tb.handleTripBuilder(message('hello'), anna, deps(m)), false, 'other messages are left alone');

  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Grand Palace, THB 3,000'), anna, deps(model(plan(), plan({ adults: 3 }))));
  const first = summary();
  await tb.handleTripBuilder(replyTo(first, 'make it 3 people'), null, deps(m));
  assert.match(replies().at(-1), /เฉพาะทีม Waydidi/, 'someone not on the team cannot change it');
  await tb.handleTripBuilder(replyTo(first, 'make it 3 people'), anna, deps(model(plan({ adults: 3 }))));
  await tap(first, deps(m));
  assert.match(answers().at(-1), /ข้อมูลเปลี่ยนแล้ว/, 'the button under the older summary does nothing');
  await tb.handleTripBuilder(replyTo(summary(), 'ยกเลิก'), anna, deps(m));
  assert.match(replies().at(-1), /ยกเลิกร่างทริปแล้ว/);
  assert.equal((await trips()).length, before);
});

test('/place adds an attraction with its hours and photo; a reply photo joins the gallery once; the same name updates it', async () => {
  const caption = message(undefined, { caption: '/add_attraction Wat Saket | 07:00-19:00 | Bangkok | 60 min', photo: [{ file_id: 'small', file_unique_id: 'u-small', width: 90, height: 60 }, { file_id: 'big', file_unique_id: 'u-big', width: 1280, height: 853 }] });
  await tb.handleTripBuilder(caption, anna, deps(model()));
  const row = await d1.prepare("SELECT * FROM attractions WHERE name='Wat Saket'").first();
  assert.deepEqual([row.open_time, row.close_time, row.duration_min, row.area, row.status, row.latitude], ['07:00', '19:00', 60, 'Bangkok', 'active', 13.74]);
  assert.match(row.cover_image, /^\/api\/blog-images\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(sent.find((s) => s.method === 'getFile').body.file_id, 'big', 'the largest size is kept');
  const confirm = sent.findLast((s) => s.method === 'sendMessage');
  assert.match(confirm.body.text, /เพิ่มสถานที่ <b>Wat Saket<\/b>[\s\S]*เปิด 07:00–19:00[\s\S]*รูป 1 รูป/);
  const confirmId = nextId - 1;

  const replyPhoto = message(undefined, { photo: [{ file_id: 'two', file_unique_id: 'u-two', width: 800, height: 600 }], reply_to_message: { message_id: confirmId, chat: { id: Number(ADMIN) } } });
  assert.equal(await tb.handlePlacePhotoReply(replyPhoto, anna), true);
  assert.equal(await tb.handlePlacePhotoReply(replyPhoto, anna), true, 'a retry of the same photo');
  const gallery = JSON.parse((await d1.prepare("SELECT gallery_json FROM attractions WHERE name='Wat Saket'").first()).gallery_json);
  assert.equal(gallery.length, 1);
  assert.equal(await tb.handlePlacePhotoReply({ ...replyPhoto, message_id: ++msg }, null), false, 'not the team: not added');

  await tb.handleTripBuilder(message('/add_attraction wat saket | 08:00-18:00'), anna, deps(model()));
  const updated = await d1.prepare("SELECT open_time, close_time, (SELECT COUNT(*) FROM attractions WHERE lower(name)='wat saket') n FROM attractions WHERE name='Wat Saket'").first();
  assert.deepEqual([updated.open_time, updated.close_time, updated.n], ['08:00', '18:00', 1]);
  assert.match(replies().at(-1), /อัปเดตสถานที่/);
});

test('/place without hours takes them from Google Maps; typed hours and hours already saved are never replaced', async () => {
  const lookups = [];
  const google = (hours) => async (q) => { lookups.push(q); return { lat: 13.75, lng: 100.5, hours }; };
  const museum = { openTime: '09:00', closeTime: '16:00', closedDays: [1], varies: false };

  // A new place with no hours: Google's hours and closed day are saved, and the reply says where they came from.
  await tb.handleTripBuilder(message('/add_attraction Bangkok National Museum | Bangkok'), anna, deps(model(), google(museum)));
  let row = await d1.prepare("SELECT * FROM attractions WHERE name='Bangkok National Museum'").first();
  assert.deepEqual([row.open_time, row.close_time, row.closed_days_json, row.latitude], ['09:00', '16:00', '[1]', 13.75]);
  assert.match(row.internal_notes, /opening hours from Google Maps/);
  assert.match(replies().at(-1), /เปิด 09:00–16:00 · ปิดวันจันทร์ \(จาก Google Maps\)/);
  assert.deepEqual(lookups, ['Bangkok National Museum, Bangkok']);

  // Staff typed hours: those are kept, Google's are not used (the lookup still gives the location).
  await tb.handleTripBuilder(message('/add_attraction Jim Thompson House | 10:00-17:00'), anna, deps(model(), google(museum)));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Jim Thompson House'").first();
  assert.deepEqual([row.open_time, row.close_time, row.closed_days_json, row.latitude], ['10:00', '17:00', '[]', 13.75]);
  assert.doesNotMatch(replies().at(-1), /Google Maps/);

  // A place that already has hours (and its area typed now): nothing is missing, so Google is not asked and the hours stay.
  lookups.length = 0;
  await tb.handleTripBuilder(message('/add_attraction Jim Thompson House | 90 min | Bangkok'), anna, deps(model(), google({ ...museum, openTime: '06:00' })));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Jim Thompson House'").first();
  assert.deepEqual([row.open_time, row.close_time, row.duration_min, row.area, lookups.length], ['10:00', '17:00', 90, 'Bangkok', 0]);
  // The area is saved now: a later /place with nothing missing does not ask Google again, and the hours stay.
  await tb.handleTripBuilder(message('/add_attraction Jim Thompson House | 2 hours'), anna, deps(model(), google({ ...museum, openTime: '06:00' })));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Jim Thompson House'").first();
  assert.deepEqual([row.open_time, row.duration_min, lookups.length], ['10:00', 120, 0], 'the area is already saved, so still not asked');

  // A saved place with no hours (added before this): sending /place again fills them from Google.
  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,created_at,updated_at) VALUES('erawan-old','Erawan Shrine','Bangkok',30,'active',?,?)").bind(now, now).run();
  await tb.handleTripBuilder(message('/add_attraction Erawan Shrine'), anna, deps(model(), google({ openTime: '06:00', closeTime: '22:00', closedDays: [], varies: true })));
  row = await d1.prepare("SELECT * FROM attractions WHERE id='erawan-old'").first();
  assert.deepEqual([row.open_time, row.close_time, row.latitude], ['06:00', '22:00', 13.75]);
  assert.match(replies().at(-1), /อัปเดตสถานที่[\s\S]*เปิด 06:00–22:00 \(จาก Google Maps · เวลาไม่เท่ากันทุกวัน/);

  // Google has no hours (or is unreachable): the place is still added, without hours, and the reply says how to add them.
  await tb.handleTripBuilder(message('/add_attraction Talad Noi Street Art'), anna, deps(model(), async () => { throw new Error('offline'); }));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Talad Noi Street Art'").first();
  assert.deepEqual([row.open_time, row.latitude], [null, null]);
  assert.match(replies().at(-1), /ยังไม่มีเวลาเปิด \(ไม่พบใน Google Maps/);
});

test('a place keeps up to 40 gallery photos: the saved place and Telegram photos both stop at 40', async () => {
  const attractions = await vite.ssrLoadModule('/lib/attractions.ts');
  const base = { name: 'Elephant Camp', durationMin: 120 };
  const photos = (n) => Array.from({ length: n }, (_, i) => `/api/blog-images/${i}.jpg`);
  assert.equal(attractions.attractionSchema.safeParse({ ...base, gallery: photos(40) }).success, true, '40 photos are accepted');
  assert.equal(attractions.attractionSchema.safeParse({ ...base, gallery: photos(41) }).success, false, '41 are refused');

  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,cover_image,gallery_json,created_at,updated_at) VALUES('camp','Elephant Camp','Phuket',120,'active','/api/blog-images/cover.jpg',?,?,?)").bind(JSON.stringify(photos(39)), now, now).run();
  const photo = (n) => message(undefined, { caption: '/add_attraction Elephant Camp', photo: [{ file_id: `camp${n}`, file_unique_id: `u-camp${n}`, width: 800, height: 600 }] });
  await tb.handleTripBuilder(photo(1), anna, deps(model()));
  await tb.handleTripBuilder(photo(2), anna, deps(model()));
  const gallery = JSON.parse((await d1.prepare("SELECT gallery_json FROM attractions WHERE id='camp'").first()).gallery_json);
  assert.equal(gallery.length, 40, 'the 40th photo joins, the next one does not');
});

test('/place sets one category, a fixed area and tags: typed ones win, otherwise from Google Maps; unknown words are told back', async () => {
  const temple = async () => ({ lat: 7.83, lng: 98.31, hours: { openTime: '08:00', closeTime: '17:30', closedDays: [], varies: false }, primaryType: 'buddhist_temple', types: ['tourist_attraction'], address: 'Karon, Mueang Phuket, Phuket 83100, Thailand' });
  await tb.handleTripBuilder(message('/add_attraction Big Buddha Phuket #sunset #instagram'), anna, deps(model(), temple));
  let row = await d1.prepare("SELECT * FROM attractions WHERE name='Big Buddha Phuket'").first();
  assert.deepEqual([row.category, row.area, row.best_time, row.vibes_json], ['temple', 'Phuket', 'sunset', '["instagram"]']);
  assert.match(row.internal_notes, /category from Google Maps/);
  assert.match(replies().at(-1), /🏷 Temple \(จาก Google Maps\) · 📍 Phuket \(จาก Google Maps\) · #sunset #instagram/);

  // Typed: the category and a beach (kept as the neighbourhood, the area is Phuket) win over Google.
  await tb.handleTripBuilder(message('/add_attraction Bangla Road | Patong | nightlife #night'), anna, deps(model(), temple));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Bangla Road'").first();
  assert.deepEqual([row.category, row.area, row.neighbourhood, row.best_time], ['nightlife', 'Phuket', 'Patong', 'night']);
  assert.match(replies().at(-1), /🏷 Nightlife · 📍 Phuket \(Patong\) · #night/);

  // An area not on the list and a misspelt category are not guessed: saved without them, and staff are told.
  await tb.handleTripBuilder(message('/add_attraction Quiet Corner Cafe | Old Town | kafe'), anna, deps(model(), async () => ({ lat: 13.7, lng: 100.5, hours: null })));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Quiet Corner Cafe'").first();
  assert.deepEqual([row.category, row.area], ['sight', '']);
  assert.match(replies().at(-1), /🏷 Sight \(ค่าเริ่มต้น[\s\S]*❓ ยังไม่มีพื้นที่: ส่ง <code>\/add_attraction Quiet Corner Cafe \| Phuket<\/code>[\s\S]*⚠️ ไม่เข้าใจ \(ไม่ได้บันทึก\): Old Town, kafe\nหมวดที่ใช้ได้: sight, temple/);

  // Sending /place again with a category changes it; an old free-text area is put right on the way.
  await d1.prepare("UPDATE attractions SET area='patong' WHERE name='Bangla Road'").run();
  await tb.handleTripBuilder(message('/add_attraction bangla road | bar'), anna, deps(model(), temple));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Bangla Road'").first();
  assert.deepEqual([row.category, row.area], ['nightlife', 'Phuket']);
  await tb.handleTripBuilder(message('/add_attraction Quiet Corner Cafe | cafe | Bangkok'), anna, deps(model(), temple));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Quiet Corner Cafe'").first();
  assert.deepEqual([row.category, row.area], ['cafe', 'Bangkok']);
});

test('/place with a shorter name adds the photo to the place trips already use, not a duplicate', async () => {
  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,created_at,updated_at) VALUES('wat-arun-old','Wat Arun (Temple of Dawn)','Bangkok',60,'active',?,?)").bind(now, now).run();
  const before = (await d1.prepare('SELECT COUNT(*) n FROM attractions').first()).n;
  await tb.handleTripBuilder(message(undefined, { caption: '/add_attraction Wat Arun', photo: [{ file_id: 'arun', file_unique_id: 'u-arun', width: 800, height: 600 }] }), anna, deps(model()));
  const row = await d1.prepare("SELECT cover_image FROM attractions WHERE id='wat-arun-old'").first();
  assert.match(row.cover_image, /^\/api\/blog-images\/[0-9a-f-]{36}\.jpg$/);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM attractions').first()).n, before, 'no new attraction');
  assert.match(replies().at(-1), /อัปเดตสถานที่ <b>Wat Arun \(Temple of Dawn\)<\/b>/);

  // A hidden duplicate with the exact name does not take the photo from the place that is shown.
  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,created_at,updated_at) VALUES('wat-arun-dup','Wat Arun','Bangkok',60,'hidden',?,?)").bind(now, now).run();
  await tb.handleTripBuilder(message(undefined, { caption: '/add_attraction Wat Arun', photo: [{ file_id: 'arun2', file_unique_id: 'u-arun2', width: 800, height: 600 }] }), anna, deps(model()));
  assert.equal(JSON.parse((await d1.prepare("SELECT gallery_json FROM attractions WHERE id='wat-arun-old'").first()).gallery_json).length, 1);
  assert.equal((await d1.prepare("SELECT cover_image FROM attractions WHERE id='wat-arun-dup'").first()).cover_image, null);
});

test('paste a chat: /trip as a reply to the customer chat reads the chat; the price comes only from the staff line; the chat is cleared once built', async () => {
  const chat = message('Customer (LINE): Hi! We are 2 adults, 12 Dec, please pick us up at Hilton Sukhumvit 08:00. We want Grand Palace and Wat Pho. Our budget is THB 9,999.', { from: { id: 42, first_name: 'Anna' } });
  const m = model(), before = (await trips()).length;
  await tb.handleTripBuilder(message('/add_trip THB 3,500', { reply_to_message: chat }), anna, deps(m));
  assert.equal(m.calls, 1);
  assert.match(m.prompts[0], /pick us up at Hilton Sukhumvit 08:00[\s\S]*Staff note: THB 3,500/, 'the AI reads the customer chat');
  assert.match(summary().body.text, /THB 3,500 \(ราคาที่พิมพ์\)/);
  await tap(summary(), deps(m));
  const all = await trips();
  assert.equal(all.length, before + 1);
  assert.equal(all.at(-1).transport_price, 3500, "the staff's price, never the customer's 9,999");
  const draft = await d1.prepare('SELECT status, replied_chat FROM telegram_trip_drafts ORDER BY created_at DESC LIMIT 1').first();
  assert.deepEqual([draft.status, draft.replied_chat], ['built', null], 'the customer chat is not kept');

  // No price on the staff line: the hourly rate, never the price the customer mentioned.
  await tb.handleTripBuilder(message('/add_trip', { reply_to_message: chat }), anna, deps(model(), undefined, async () => 4200));
  assert.match(summary().body.text, /ประมาณ THB 4,200/);

  // Replying to one of the bot's own messages is not a customer chat: plain /trip still shows the guide.
  const botMessage = message('ยังไม่ได้สร้างทริป', { from: { id: 7, first_name: 'Waydidi Bot', is_bot: true } });
  const m3 = model();
  await tb.handleTripBuilder(message('/add_trip', { reply_to_message: botMessage }), anna, deps(m3));
  assert.match(replies().at(-1), /วิธีสร้างทริปผ่าน Telegram[\s\S]*หรือวางแชตลูกค้า/);
  assert.equal(m3.calls, 0);
});

test('a place with packages: after the tap staff choose the package, then the trip is built with it; one tap per question', async () => {
  const programs = [
    { id: 'morning', name: 'Half-day morning', durationMin: 240, arrivalBufferMin: 0, feeAdult: 3000, feeChild: 1500, feeIncluded: false, bookingRequired: true, sessions: [{ time: '09:00' }] },
    { id: 'full', name: 'Full day', durationMin: 420, arrivalBufferMin: 0, feeAdult: 5000, feeChild: 2500, feeIncluded: true, bookingRequired: true, sessions: [] },
  ];
  await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,booking_required,programs_json,status,created_at,updated_at) VALUES('pes','Phuket Elephant Sanctuary','Bangkok',13.76,100.5,240,'08:00','18:00',1,?,'active',?,?)")
    .bind(JSON.stringify(programs), now, now).run();
  const before = (await trips()).length;
  const m = model(plan({ hours: 10, stops: [{ placeId: 'pes', name: 'Phuket Elephant Sanctuary', priority: 'must' }, { placeId: 'wat-pho', name: 'Wat Pho', priority: 'must' }] }));
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Elephant Sanctuary, Wat Pho, THB 3,500'), anna, deps(m));
  await tap(summary(), deps(m));
  assert.equal((await trips()).length, before, 'nothing is built before the package is chosen');
  const question = sent.findLast((x) => x.method === 'sendMessage');
  assert.match(question.body.text, /Phuket Elephant Sanctuary<\/b> มีแพ็กเกจ เลือกแพ็กเกจสำหรับทริปนี้ \(1\/1\)/);
  const buttons = question.body.reply_markup.inline_keyboard.map((row) => row[0]);
  assert.deepEqual(buttons.map((b) => b.text), ['Half-day morning 09:00 · 4 ชม. · 3,000 บาท/คน', 'Full day · 7 ชม. · 5,000 บาท/คน', 'เข้าชมทั่วไป (ไม่ใช้แพ็กเกจ)']);
  const pick = (data, id) => tb.handleTripPackageChoice({ id, data, message: { message_id: question.id, chat: { id: Number(ADMIN) } } }, anna, deps(m));

  await pick(buttons[0].callback_data, 'p1');
  const t = (await trips()).at(-1);
  assert.equal((await trips()).length, before + 1);
  const stop = JSON.parse(t.stops_json).find((x) => x.attractionId === 'pes');
  assert.deepEqual([stop.programId, stop.sessionTime, stop.priority, stop.durationMin, stop.feeIncluded], ['morning', '09:00', 'fixed', 240, true]);
  assert.equal(t.total, 3500 + 2 * 3000, 'the package price for 2 adults is in the total');
  assert.match(sent.findLast((x) => x.method === 'sendMessage').body.text, /💰 THB 9,500 \(รถ THB 3,500 \+ แพ็กเกจ\/ตั๋ว THB 6,000\)/);

  await pick(buttons[1].callback_data, 'p2');
  assert.equal((await trips()).length, before + 1, 'the same question tapped again builds nothing more');
});

test('package questions expire after two days; a forged choice is refused', async () => {
  const m = model(plan({ stops: [{ placeId: 'pes', name: 'Phuket Elephant Sanctuary', priority: 'must' }] }));
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Elephant Sanctuary, THB 3,500'), anna, deps(m));
  await tap(summary(), deps(m));
  const buttons = sent.findLast((x) => x.method === 'sendMessage').body.reply_markup.inline_keyboard.map((row) => row[0]);
  const id = buttons[0].callback_data.split(':')[1];
  const before = (await trips()).length;
  await tb.handleTripPackageChoice({ id: 'f1', data: `tp_pkg:${id}:0.9` }, anna, deps(m));
  assert.match(answers().at(-1), /ใช้ไม่ได้แล้ว/);
  await d1.prepare('UPDATE telegram_trip_pending SET created_at=? WHERE id=?').bind(new Date(Date.now() - 49 * 3600_000).toISOString(), id).run();
  await tb.handleTripPackageChoice({ id: 'f2', data: buttons[2].callback_data }, anna, deps(m));
  assert.match(answers().at(-1), /หมดเวลา/);
  assert.equal((await trips()).length, before);
});

test('TRIP_MULTIDAY=1: places that need more than a day become several days; the typed price is shared and adds up', async () => {
  // Seven 3-hour places: 21 hours on site, so three days of at most 12 hours.
  const names = ['Big Buddha', 'Phuket Old Town', 'Wat Chalong', 'Bangla Road', 'Promthep Cape', 'Patong Beach', 'Kata Beach'];
  for (const [i, n] of names.entries())
    await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES(?,?,'Phuket',?,98.3,180,'00:00','23:59','active',?,?)").bind(`pk${i}`, n, 7.8 + i * 0.01, now, now).run();
  const stops = names.map((n, i) => ({ placeId: `pk${i}`, name: n, priority: 'must' }));
  const freeForm = model(plan({ area: 'Phuket', date: '2026-11-29', pickup: 'Kata Hotel', hours: null, stops }));
  const phuket = { ...deps(freeForm), locate: async (text) => ({ lat: 7.8, lng: 98.3, name: text, address: '' }) };
  globalThis.__tbEnv.TRIP_MULTIDAY = '1';
  await tb.handleTripBuilder(message('/add_trip Big Buddha, Phuket Old Town, Wat Chalong, Bangla Road, Promthep Cape, Patong Beach, Kata Beach 29 Nov 2026, 2 people, Kata Hotel 08:00, THB 9,000'), anna, phuket);
  assert.match(summary().body.text, /สถานที่ \(ระบบแบ่งวันตอนสร้าง\)/);
  await tap(summary(), phuket);
  const lead = await d1.prepare('SELECT * FROM smart_trips WHERE day_number=1 AND group_id=id ORDER BY created_at DESC LIMIT 1').first();
  const days = (await d1.prepare('SELECT * FROM smart_trips WHERE group_id=? ORDER BY day_number').bind(lead.id).all()).results;
  assert.equal(days.length, 3);
  assert.deepEqual(days.map((d) => d.trip_date), ['2026-11-29', '2026-11-30', '2026-12-01']);
  assert.equal(days.reduce((n, d) => n + d.transport_price, 0), 9000, 'the typed price is shared and adds up');
  assert.ok(days.every((d) => d.status === 'sent' && d.duration_hours <= 12));
  assert.equal(days.flatMap((d) => JSON.parse(d.stops_json)).length, 7, 'every place once');
  assert.match(replies().join('\n'), /\(3 วัน\)[\s\S]*วันที่ 1 \(29 พ\.ย\. 2569\)[\s\S]*วันที่ 3 \(1 ธ\.ค\. 2569\)/);
  globalThis.__tbEnv.TRIP_MULTIDAY = '';
});

test('out of AI credit: staff are told, and the Admin group gets one top-up alert (not one per message)', async () => {
  await d1.prepare("DELETE FROM app_settings WHERE key='tg_ai_credit_alert_at'").run();
  const credit = Object.assign(new Error('400 credit'), { status: 400, error: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } });
  const m = model(credit);
  await tb.handleTripBuilder(message('/add_trip 12 Dec, 2 people, Hilton Sukhumvit 08:00, Grand Palace, THB 3,000'), anna, deps(m));
  await tb.handleTripBuilder(message('/add_trip 13 Dec, 2 people, Hilton Sukhumvit 08:00, Wat Pho, THB 3,000'), anna, deps(m));
  const text = replies();
  assert.equal(text.filter((t) => /เครดิต AI \(Anthropic\) หมดแล้ว[\s\S]*console\.anthropic\.com → Billing/.test(t)).length, 1, 'one alert within 6 hours');
  assert.equal(text.filter((t) => /เครดิต AI หมด จึงอ่าน \/add_trip ไม่ได้/.test(t)).length, 2, 'each asker is told');
  assert.equal(summary(), undefined, 'no summary, nothing built');
});
