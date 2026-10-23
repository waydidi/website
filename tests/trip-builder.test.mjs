import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// /trip and /place in the Telegram Admin group, end to end on an in-memory D1: a scripted model reads the staff text,
// Telegram is a fake that records what the bot sends. The trip is built, sent and posted back with its link and PDF.
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

// Fake Telegram: every call is recorded; getFile and the file download serve a tiny JPEG.
let sent = [], nextId = 500;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/file/bottest-token/')) return new Response(JPEG);
  const method = u.split('/').pop();
  const body = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v])) : JSON.parse(String(init.body ?? '{}'));
  sent.push({ method, body });
  if (method === 'getFile') return Response.json({ ok: true, result: { file_path: 'photos/p.jpg', file_size: JPEG.length } });
  return Response.json({ ok: true, result: { message_id: nextId++ } });
};
beforeEach(() => { sent = []; });
const replies = () => sent.filter((s) => s.method === 'sendMessage').map((s) => s.body.text);

const today = '2026-10-22';
const plan = (over = {}) => JSON.stringify({ title: 'Bangkok temples', area: 'Bangkok', date: '2026-12-12', startTime: '08:00', hours: 6, adults: 2, children: 0, bags: 1,
  pickup: 'Hilton Sukhumvit', customerName: 'Jane', language: 'en', notes: '', suggested: false,
  stops: [{ placeId: 'grand-palace', name: 'Grand Palace', priority: 'must' }, { placeId: 'wat-pho', name: 'Wat Pho', priority: 'must' }], ...over });
function model(answer = plan()) { const m = { calls: 0, prompts: [], call: async (_system, user) => { m.calls++; m.prompts.push(user); return answer; } }; return m; }
const anna = { display_name: 'Anna' };
let msg = 1000;
const message = (text, extra = {}) => ({ message_id: ++msg, chat: { id: Number(ADMIN), type: 'supergroup' }, from: { id: 42, first_name: 'Anna' }, text, ...extra });
const deps = (m, place = async () => ({ lat: 13.74, lng: 100.55, hours: null }), rate = async () => null) => ({ call: m.call, locate: async () => ({ lat: 13.74, lng: 100.55 }), place, rate, today });
const trips = async () => (await d1.prepare('SELECT * FROM smart_trips ORDER BY created_at').all()).results;

test('a typed trip is built, sent and posted back with its link and PDF; the customer is not messaged', async () => {
  const m = model(), before = (await trips()).length;
  const handled = await tb.handleTripBuilder(message('/trip 12 Dec, 2 adults, Hilton Sukhumvit 08:00, Grand Palace, Wat Pho, SUV, THB 3,500'), anna, deps(m));
  assert.equal(handled, true);
  const all = await trips();
  assert.equal(all.length, before + 1);
  const t = all.at(-1);
  assert.deepEqual([t.status, t.transport_price, t.vehicle, t.version, t.created_by, t.trip_date, t.pickup_lat], ['sent', 3500, 'comfort_suv', 1, 'Telegram · Anna', '2026-12-12', 13.74]);
  assert.ok(t.snapshot_json, 'the version the customer sees is frozen');
  const text = replies().join('\n');
  assert.match(text, new RegExp(`https://waydidi.example/itinerary/${t.token}`));
  assert.match(text, /Grand Palace → Wat Pho/);
  assert.match(text, /THB 3,500/);
  const doc = sent.find((s) => s.method === 'sendDocument');
  assert.ok(doc, 'the PDF is posted');
  assert.equal(doc.body.chat_id, ADMIN);
  const pdf = new Uint8Array(await doc.body.document.arrayBuffer());
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), '%PDF');
  assert.ok(sent.every((s) => String(s.body.chat_id ?? ADMIN) === ADMIN), 'nothing goes anywhere but the Admin group');
});

test('the same Telegram message delivered twice builds one trip', async () => {
  const m = model(), msg1 = message('/trip 12 Dec, Grand Palace, Wat Pho, THB 3,000'), before = (await trips()).length;
  await Promise.all([tb.handleTripBuilder(msg1, anna, deps(m)), tb.handleTripBuilder(msg1, anna, deps(m))]);
  await tb.handleTripBuilder(msg1, anna, deps(m));
  assert.equal((await trips()).length, before + 1);
  assert.equal(m.calls, 1);
  assert.equal(sent.filter((s) => s.method === 'sendDocument').length, 1);
});

test('"/trip create a new trip" replies with the guide: nothing is created and the model is not asked', async () => {
  const m = model(), before = (await trips()).length;
  for (const text of ['/trip create a new trip', '/trip', '/trip help']) {
    await tb.handleTripBuilder(message(text), anna, deps(m));
    assert.match(replies().at(-1), /วิธีสร้างทริปผ่าน Telegram[\s\S]*ต้องมี[\s\S]*วันที่[\s\S]*สถานที่ที่จะไป[\s\S]*<code>\/trip Big Buddha/, text);
  }
  assert.equal(m.calls, 0);
  assert.equal((await trips()).length, before);
});

test('no price typed: the hourly rate for the car and hours is the price; two unclear prices: nothing is created', async () => {
  const before = (await trips()).length;
  const rates = [];
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, Wat Pho, SUV'), anna, deps(model(), undefined, async (city, hours, vehicle) => { rates.push([city, hours, vehicle]); return 4200; }));
  const t = (await trips()).at(-1);
  assert.equal((await trips()).length, before + 1);
  assert.deepEqual([t.status, t.transport_price], ['sent', 4200]);
  assert.deepEqual(rates, [['Hilton Sukhumvit', 6, 'comfort_suv']], 'the pickup decides the city; the day is 6 hours');
  assert.match(replies().join('\n'), /ราคารถตามเรทรายชั่วโมง \(6 ชม\.\) แก้ได้ที่ Admin/, 'hours typed in the message are the hours charged');

  const m = model();
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, car THB 3,000, tickets THB 1,000'), anna, deps(m));
  assert.match(replies().at(-1), /พบหลายราคา/);
  assert.equal(m.calls, 0, 'the AI is not asked');
  assert.equal((await trips()).length, before + 1);
});

test('no price and no hourly rate for the area: the trip is kept as a draft and staff are asked to set the price', async () => {
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, Wat Pho'), anna, deps(model()));
  const t = (await trips()).at(-1);
  assert.deepEqual([t.status, t.transport_price, t.snapshot_json], ['draft', 0, null], 'not sent, no link frozen for the customer');
  assert.match(replies().at(-1), new RegExp(`ยังไม่ได้ส่ง: ไม่มีเรทรายชั่วโมง[\\s\\S]*/admin/trips/${t.id}`));
});

test('a place not in the attractions list is added from Google Maps; one Google cannot find is left out and listed', async () => {
  const lookups = [];
  const google = async (q) => { lookups.push(q); return q.startsWith('Lumphini Park') ? { lat: 13.73, lng: 100.54, hours: { openTime: '04:30', closeTime: '21:00', closedDays: [], varies: false } } : null; };
  const m = model(plan({ stops: [{ placeId: 'grand-palace', name: 'Grand Palace' }, { placeId: null, name: 'Lumphini Park' }, { placeId: null, name: 'Nowhere Cafe' }] }));
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, Lumphini Park, Nowhere Cafe, THB 3,000'), anna, deps(m, google));
  const park = await d1.prepare("SELECT * FROM attractions WHERE name='Lumphini Park'").first();
  assert.deepEqual([park.open_time, park.close_time, park.latitude], ['04:30', '21:00', 13.73]);
  assert.match(park.internal_notes, /Added from Telegram \(\/trip\); opening hours from Google Maps/);
  const t = (await trips()).at(-1);
  assert.deepEqual(JSON.parse(t.stops_json).map((x) => [x.name, x.attractionId ?? null]), [['Grand Palace', 'grand-palace'], ['Lumphini Park', park.id]]);
  const text = replies().join('\n');
  assert.match(text, /เพิ่มสถานที่ใหม่จาก Google Maps: Lumphini Park/);
  assert.match(text, /ไม่พบใน Google Maps \(ไม่ได้ใส่ในทริป\): Nowhere Cafe/);
  assert.deepEqual(lookups, ['Lumphini Park, Bangkok', 'Nowhere Cafe, Bangkok']);

  // Sent again later: the park is now in the list and is not added twice.
  const again = model(plan({ stops: [{ placeId: null, name: 'Lumphini Park' }] }));
  await tb.handleTripBuilder(message('/trip 13 Dec, Lumphini Park, THB 2,000'), anna, deps(again, google));
  assert.equal((await d1.prepare("SELECT COUNT(*) n FROM attractions WHERE name='Lumphini Park'").first()).n, 1);
});

test('missing date, suggested places, or a car too small: nothing is created; no pickup is fine', async () => {
  const before = (await trips()).length;
  await tb.handleTripBuilder(message('/trip Grand Palace, Wat Pho, THB 3,000'), anna, deps(model(plan({ date: null, pickup: null }))));
  assert.equal(replies().at(-1).split('\n')[0], '⚠️ ยังไม่ได้สร้างทริป: ขาดวันที่', 'only the date is missing; the pickup is not required');
  await tb.handleTripBuilder(message('/trip temples tomorrow, THB 3,000'), anna, deps(model(plan({ suggested: true, stops: [{ placeId: 'grand-palace', name: 'Grand Palace', priority: 'nice' }, { placeId: 'wat-pho', name: 'Wat Pho', priority: 'nice' }] }))));
  assert.match(replies().at(-1), /ระบุชื่อสถานที่/);
  await tb.handleTripBuilder(message('/trip 6 adults, sedan, Grand Palace, THB 3,000'), anna, deps(model(plan({ adults: 6 }))));
  assert.match(replies().at(-1), /Economy sedan นั่งได้ 2 คน/);
  assert.equal((await trips()).length, before);

  // Free form with no hotel: the trip is built and says the pickup is still to be confirmed.
  await tb.handleTripBuilder(message('/trip Grand Palace, Wat Pho 12 Dec 2026, 2 people, THB 3,000'), anna, deps(model(plan({ pickup: null, customerName: null }))));
  const t = (await trips()).at(-1);
  assert.equal((await trips()).length, before + 1);
  assert.deepEqual([t.status, t.pickup_text, t.pickup_lat], ['sent', '', null]);
  assert.match(replies().join('\n'), /จุดรับ: รอยืนยัน/);
});

test('no price: 5 or more places are charged 10 hours, 4 places 6 hours, at THB 300 an hour for a sedan', async () => {
  const names = ['Rate Stop One', 'Rate Stop Two', 'Rate Stop Three', 'Rate Stop Four', 'Rate Stop Five'];
  for (const [i, n] of names.entries())
    await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES(?,?,'Bangkok',?,100.5,45,'00:00','23:59','active',?,?)").bind(`bk${i}`, n, 13.73 + i * 0.005, now, now).run();
  const freeForm = (count) => model(plan({ pickup: null, customerName: null, hours: null, stops: names.slice(0, count).map((n, i) => ({ placeId: `bk${i}`, name: n, priority: 'must' })) }));
  const real = { ...deps(model()), rate: undefined }; // the real hourly rates, not a stub
  await tb.handleTripBuilder(message(`/trip ${names.join(', ')} 12 Dec 2026, 2 people`), anna, { ...real, call: freeForm(5).call });
  let t = (await trips()).at(-1);
  assert.deepEqual([t.vehicle, t.duration_hours, t.transport_price], ['economy_sedan', 10, 3000], '5 places: 10 hours × 300');
  assert.match(replies().join('\n'), /THB 3,000 · ราคารถตามเรทรายชั่วโมง \(10 ชม\.\)/);
  await tb.handleTripBuilder(message(`/trip ${names.slice(0, 4).join(', ')} 12 Dec 2026, 2 people`), anna, { ...real, call: freeForm(4).call });
  t = (await trips()).at(-1);
  assert.deepEqual([t.duration_hours, t.transport_price], [6, 1800], '4 places: 6 hours × 300');
});

test('staff wording: "recommendation tour package for two people as they requested as …, Date …, Make me a link" builds the trip and gives the link', async () => {
  const before = (await trips()).length;
  const text = '/trip recommendation tour package for two people as they requested as Grand Palace, Wat Pho. Date 20 Dec 2026. Make me a link';
  // Even if the model calls the named places "suggested", places that were asked for are built, never refused.
  const m = model(plan({ date: '2026-12-20', pickup: null, customerName: null, hours: null, suggested: true }));
  const rates = [];
  await tb.handleTripBuilder(message(text), anna, deps(m, undefined, async (city, hours, vehicle) => { rates.push([city, hours, vehicle]); return 3800; }));
  assert.equal(m.calls, 1, 'not mistaken for a help request');
  assert.equal((await trips()).length, before + 1);
  const t = (await trips()).at(-1);
  assert.deepEqual([t.status, t.trip_date, t.adults, t.transport_price], ['sent', '2026-12-20', 2, 3800]);
  assert.deepEqual(JSON.parse(t.stops_json).map((s) => s.name), ['Grand Palace', 'Wat Pho']);
  assert.equal(rates.length, 1, 'no price typed: the hourly rate is used, the year is not read as a price');
  const reply = replies().join('\n');
  assert.match(reply, new RegExp(`https://waydidi.example/itinerary/${t.token}`));
  assert.doesNotMatch(reply, /ยังไม่ได้สร้างทริป/);
});

test('only the Telegram team, only the Admin group, only when switched on', async () => {
  const m = model(), before = (await trips()).length;
  assert.equal(await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, THB 3,000'), null, deps(m)), true);
  assert.match(replies().at(-1), /เฉพาะทีม Waydidi/);
  assert.equal(await tb.handleTripBuilder({ ...message('/trip 12 Dec, Grand Palace, THB 3,000'), chat: { id: -100999, type: 'supergroup' } }, anna, deps(m)), true);
  globalThis.__tbEnv.TELEGRAM_TRIP_BUILDER = '';
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, THB 3,000'), anna, deps(m));
  assert.match(replies().at(-1), /ยังไม่ได้เปิดใช้/);
  globalThis.__tbEnv.TELEGRAM_TRIP_BUILDER = '1';
  assert.equal(m.calls, 0);
  assert.equal((await trips()).length, before);
  assert.equal(await tb.handleTripBuilder(message('hello'), anna, deps(m)), false, 'other messages are left alone');
});

test('/place adds an attraction with its hours and photo; a reply photo joins the gallery once; the same name updates it', async () => {
  const caption = message(undefined, { caption: '/place Wat Saket | 07:00-19:00 | Bangkok | 60 min', photo: [{ file_id: 'small', file_unique_id: 'u-small', width: 90, height: 60 }, { file_id: 'big', file_unique_id: 'u-big', width: 1280, height: 853 }] });
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

  await tb.handleTripBuilder(message('/place wat saket | 08:00-18:00'), anna, deps(model()));
  const updated = await d1.prepare("SELECT open_time, close_time, (SELECT COUNT(*) FROM attractions WHERE lower(name)='wat saket') n FROM attractions WHERE name='Wat Saket'").first();
  assert.deepEqual([updated.open_time, updated.close_time, updated.n], ['08:00', '18:00', 1]);
  assert.match(replies().at(-1), /อัปเดตสถานที่/);
});

test('/place without hours takes them from Google Maps; typed hours and hours already saved are never replaced', async () => {
  const lookups = [];
  const google = (hours) => async (q) => { lookups.push(q); return { lat: 13.75, lng: 100.5, hours }; };
  const museum = { openTime: '09:00', closeTime: '16:00', closedDays: [1], varies: false };

  // A new place with no hours: Google's hours and closed day are saved, and the reply says where they came from.
  await tb.handleTripBuilder(message('/place Bangkok National Museum | Bangkok'), anna, deps(model(), google(museum)));
  let row = await d1.prepare("SELECT * FROM attractions WHERE name='Bangkok National Museum'").first();
  assert.deepEqual([row.open_time, row.close_time, row.closed_days_json, row.latitude], ['09:00', '16:00', '[1]', 13.75]);
  assert.match(row.internal_notes, /opening hours from Google Maps/);
  assert.match(replies().at(-1), /เปิด 09:00–16:00 · ปิดวันจันทร์ \(จาก Google Maps\)/);
  assert.deepEqual(lookups, ['Bangkok National Museum, Bangkok']);

  // Staff typed hours: those are kept, Google's are not used (the lookup still gives the location).
  await tb.handleTripBuilder(message('/place Jim Thompson House | 10:00-17:00'), anna, deps(model(), google(museum)));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Jim Thompson House'").first();
  assert.deepEqual([row.open_time, row.close_time, row.closed_days_json, row.latitude], ['10:00', '17:00', '[]', 13.75]);
  assert.doesNotMatch(replies().at(-1), /Google Maps/);

  // A place that already has hours: Google is not asked and nothing changes.
  lookups.length = 0;
  await tb.handleTripBuilder(message('/place Jim Thompson House | 90 min'), anna, deps(model(), google({ ...museum, openTime: '06:00' })));
  row = await d1.prepare("SELECT * FROM attractions WHERE name='Jim Thompson House'").first();
  assert.deepEqual([row.open_time, row.close_time, row.duration_min, lookups.length], ['10:00', '17:00', 90, 0]);

  // A saved place with no hours (added before this): sending /place again fills them from Google.
  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,created_at,updated_at) VALUES('erawan-old','Erawan Shrine','Bangkok',30,'active',?,?)").bind(now, now).run();
  await tb.handleTripBuilder(message('/place Erawan Shrine'), anna, deps(model(), google({ openTime: '06:00', closeTime: '22:00', closedDays: [], varies: true })));
  row = await d1.prepare("SELECT * FROM attractions WHERE id='erawan-old'").first();
  assert.deepEqual([row.open_time, row.close_time, row.latitude], ['06:00', '22:00', 13.75]);
  assert.match(replies().at(-1), /อัปเดตสถานที่[\s\S]*เปิด 06:00–22:00 \(จาก Google Maps · เวลาไม่เท่ากันทุกวัน/);

  // Google has no hours (or is unreachable): the place is still added, without hours, and the reply says how to add them.
  await tb.handleTripBuilder(message('/place Talad Noi Street Art'), anna, deps(model(), async () => { throw new Error('offline'); }));
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
  const photo = (n) => message(undefined, { caption: '/place Elephant Camp', photo: [{ file_id: `camp${n}`, file_unique_id: `u-camp${n}`, width: 800, height: 600 }] });
  await tb.handleTripBuilder(photo(1), anna, deps(model()));
  await tb.handleTripBuilder(photo(2), anna, deps(model()));
  const gallery = JSON.parse((await d1.prepare("SELECT gallery_json FROM attractions WHERE id='camp'").first()).gallery_json);
  assert.equal(gallery.length, 40, 'the 40th photo joins, the next one does not');
});

test('/place with a shorter name adds the photo to the place trips already use, not a duplicate', async () => {
  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,created_at,updated_at) VALUES('wat-arun-old','Wat Arun (Temple of Dawn)','Bangkok',60,'active',?,?)").bind(now, now).run();
  const before = (await d1.prepare('SELECT COUNT(*) n FROM attractions').first()).n;
  await tb.handleTripBuilder(message(undefined, { caption: '/place Wat Arun', photo: [{ file_id: 'arun', file_unique_id: 'u-arun', width: 800, height: 600 }] }), anna, deps(model()));
  const row = await d1.prepare("SELECT cover_image FROM attractions WHERE id='wat-arun-old'").first();
  assert.match(row.cover_image, /^\/api\/blog-images\/[0-9a-f-]{36}\.jpg$/);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM attractions').first()).n, before, 'no new attraction');
  assert.match(replies().at(-1), /อัปเดตสถานที่ <b>Wat Arun \(Temple of Dawn\)<\/b>/);

  // A hidden duplicate with the exact name does not take the photo from the place that is shown.
  await d1.prepare("INSERT INTO attractions(id,name,area,duration_min,status,created_at,updated_at) VALUES('wat-arun-dup','Wat Arun','Bangkok',60,'hidden',?,?)").bind(now, now).run();
  await tb.handleTripBuilder(message(undefined, { caption: '/place Wat Arun', photo: [{ file_id: 'arun2', file_unique_id: 'u-arun2', width: 800, height: 600 }] }), anna, deps(model()));
  assert.equal(JSON.parse((await d1.prepare("SELECT gallery_json FROM attractions WHERE id='wat-arun-old'").first()).gallery_json).length, 1);
  assert.equal((await d1.prepare("SELECT cover_image FROM attractions WHERE id='wat-arun-dup'").first()).cover_image, null);
});

test('paste a chat: /trip sent as a reply to the customer chat reads the chat; the price comes only from the staff line', async () => {
  const chat = message('Customer (LINE): Hi! We are 2 adults, 12 Dec, please pick us up at Hilton Sukhumvit 08:00. We want Grand Palace and Wat Pho. Our budget is THB 9,999.', { from: { id: 42, first_name: 'Anna' } });
  const m = model(), before = (await trips()).length;
  await tb.handleTripBuilder(message('/trip THB 3,500', { reply_to_message: chat }), anna, deps(m));
  assert.equal(m.calls, 1);
  assert.match(m.prompts[0], /pick us up at Hilton Sukhumvit 08:00[\s\S]*Staff note: THB 3,500/, 'the AI reads the customer chat');
  const all = await trips();
  assert.equal(all.length, before + 1);
  assert.equal(all.at(-1).transport_price, 3500, "the staff's price, never the customer's 9,999");

  // No price on the staff line: the hourly rate is used, never the price the customer mentioned in the chat.
  const m2 = model();
  await tb.handleTripBuilder(message('/trip', { reply_to_message: chat }), anna, deps(m2, undefined, async () => 4200));
  assert.equal(m2.calls, 1);
  const latest = await trips();
  assert.equal(latest.length, before + 2);
  assert.equal(latest.at(-1).transport_price, 4200, "the hourly rate, never the customer's 9,999");

  // Replying to one of the bot's own messages is not a customer chat: plain /trip still shows the guide.
  const botMessage = message('ยังไม่ได้สร้างทริป', { from: { id: 7, first_name: 'Waydidi Bot', is_bot: true } });
  const m3 = model();
  await tb.handleTripBuilder(message('/trip', { reply_to_message: botMessage }), anna, deps(m3));
  assert.match(replies().at(-1), /วิธีสร้างทริปผ่าน Telegram[\s\S]*หรือวางแชตลูกค้า/);
  assert.equal(m3.calls, 0);
});

test('a place with packages: staff choose the package in Telegram first, then the trip is built with it; one tap per question', async () => {
  const programs = [
    { id: 'morning', name: 'Half-day morning', durationMin: 240, arrivalBufferMin: 0, feeAdult: 3000, feeChild: 1500, feeIncluded: false, bookingRequired: true, sessions: [{ time: '09:00' }] },
    { id: 'full', name: 'Full day', durationMin: 420, arrivalBufferMin: 0, feeAdult: 5000, feeChild: 2500, feeIncluded: true, bookingRequired: true, sessions: [] },
  ];
  await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,booking_required,programs_json,status,created_at,updated_at) VALUES('pes','Phuket Elephant Sanctuary','Bangkok',13.76,100.5,240,'08:00','18:00',1,?,'active',?,?)")
    .bind(JSON.stringify(programs), now, now).run();
  const before = (await trips()).length;
  const m = model(plan({ stops: [{ placeId: 'pes', name: 'Phuket Elephant Sanctuary', priority: 'must' }, { placeId: 'wat-pho', name: 'Wat Pho', priority: 'must' }] }));
  await tb.handleTripBuilder(message('/trip 12 Dec, Elephant Sanctuary, Wat Pho, THB 3,500'), anna, deps(m));
  assert.equal((await trips()).length, before, 'nothing is built before the package is chosen');
  const question = sent.findLast((x) => x.method === 'sendMessage');
  assert.match(question.body.text, /Phuket Elephant Sanctuary<\/b> มีแพ็กเกจ เลือกแพ็กเกจสำหรับทริปนี้ \(1\/1\)/);
  const buttons = question.body.reply_markup.inline_keyboard.map((row) => row[0]);
  assert.deepEqual(buttons.map((b) => b.text), ['Half-day morning 09:00 · 4 ชม. · 3,000 บาท/คน', 'Full day · 7 ชม. · 5,000 บาท/คน', 'เข้าชมทั่วไป (ไม่ใช้แพ็กเกจ)']);
  const questionId = nextId - 1;
  const tap = (data, id = 'cb') => tb.handleTripPackageChoice({ id, data, message: { message_id: questionId, chat: { id: Number(ADMIN) } } }, anna, deps(m));

  await tap(buttons[0].callback_data, 'cb1');
  const t = (await trips()).at(-1);
  assert.equal((await trips()).length, before + 1);
  const stop = JSON.parse(t.stops_json).find((x) => x.attractionId === 'pes');
  assert.deepEqual([stop.programId, stop.sessionTime, stop.priority, stop.durationMin], ['morning', '09:00', 'fixed', 240]);
  // Not ticked "included" on the attraction, but chosen for this trip: the car price plus the package for 2 adults.
  assert.equal(stop.feeIncluded, true);
  assert.equal(t.total, 3500 + 2 * 3000, 'the package price for 2 adults is in the total');
  assert.match(sent.findLast((x) => x.method === 'sendMessage').body.text, /💰 THB 9,500 \(รถ THB 3,500 \+ แพ็กเกจ\/ตั๋ว THB 6,000\)/);
  assert.match(sent.find((x) => x.method === 'editMessageText').body.text, /Phuket Elephant Sanctuary<\/b>: Half-day morning 09:00/);

  // The same button tapped again (or by a second person at once): nothing more is built.
  await tap(buttons[1].callback_data, 'cb2');
  assert.equal((await trips()).length, before + 1);
  assert.match(sent.findLast((x) => x.method === 'answerCallbackQuery').body.text, /ไม่พบทริปนี้|เลือกไปแล้ว/);
});

test('package questions expire after two days; a forged choice is refused', async () => {
  const m = model(plan({ stops: [{ placeId: 'pes', name: 'Phuket Elephant Sanctuary', priority: 'must' }] }));
  await tb.handleTripBuilder(message('/trip 12 Dec, Elephant Sanctuary, THB 3,500'), anna, deps(m));
  const buttons = sent.findLast((x) => x.method === 'sendMessage').body.reply_markup.inline_keyboard.map((row) => row[0]);
  const id = buttons[0].callback_data.split(':')[1];
  const before = (await trips()).length;
  await tb.handleTripPackageChoice({ id: 'f1', data: `tp_pkg:${id}:0.9` }, anna, deps(m));
  assert.match(sent.findLast((x) => x.method === 'answerCallbackQuery').body.text, /ใช้ไม่ได้แล้ว/);
  await d1.prepare('UPDATE telegram_trip_pending SET created_at=? WHERE id=?').bind(new Date(Date.now() - 49 * 3600_000).toISOString(), id).run();
  await tb.handleTripPackageChoice({ id: 'f2', data: buttons[2].callback_data }, anna, deps(m));
  assert.match(sent.findLast((x) => x.method === 'answerCallbackQuery').body.text, /หมดเวลา/);
  assert.equal((await trips()).length, before);
  // The next /trip with a package question removes expired ones, so their details are not kept.
  await tb.handleTripBuilder(message('/trip 13 Dec, Elephant Sanctuary, THB 3,500'), anna, deps(m));
  assert.equal(await d1.prepare('SELECT COUNT(*) AS n FROM telegram_trip_pending WHERE id=?').bind(id).first('n'), 0);
  assert.equal(await d1.prepare('SELECT COUNT(*) AS n FROM telegram_trip_pending').first('n'), 1);
});

test('TRIP_MULTIDAY=1: places that need more than a day become several days; the typed price is shared and adds up', async () => {
  // Seven 3-hour places: 21 hours on site, so three days of at most 12 hours.
  const names = ['Big Buddha', 'Phuket Old Town', 'Wat Chalong', 'Bangla Road', 'Promthep Cape', 'Patong Beach', 'Kata Beach'];
  for (const [i, n] of names.entries())
    await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES(?,?,'Phuket',?,98.3,180,'00:00','23:59','active',?,?)").bind(`pk${i}`, n, 7.8 + i * 0.01, now, now).run();
  const stops = names.map((n, i) => ({ placeId: `pk${i}`, name: n, priority: 'must' }));
  const freeForm = model(plan({ area: 'Phuket', date: '2026-11-29', pickup: null, customerName: null, hours: null, stops }));
  const before = (await trips()).length;

  globalThis.__tbEnv.TRIP_MULTIDAY = '';
  await tb.handleTripBuilder(message('/trip Big Buddha, Phuket Old Town, Wat Chalong, Bangla Road, Promthep Cape, Patong Beach, Kata Beach 29 Nov 2026, 2 people THB 9,000'), anna, deps(freeForm));
  assert.equal((await trips()).length, before + 1, 'switched off: one day, as before');

  globalThis.__tbEnv.TRIP_MULTIDAY = '1';
  await tb.handleTripBuilder(message('/trip Big Buddha, Phuket Old Town, Wat Chalong, Bangla Road, Promthep Cape, Patong Beach, Kata Beach 29 Nov 2026, 2 people THB 9,000'), anna, deps(freeForm));
  const lead = await d1.prepare('SELECT * FROM smart_trips WHERE day_number=1 AND group_id=id ORDER BY created_at DESC LIMIT 1').first();
  const days = (await d1.prepare('SELECT * FROM smart_trips WHERE group_id=? ORDER BY day_number').bind(lead.id).all()).results;
  assert.equal(days.length, 3);
  assert.deepEqual(days.map((d) => d.trip_date), ['2026-11-29', '2026-11-30', '2026-12-01']);
  assert.equal(days.reduce((n, d) => n + d.transport_price, 0), 9000, 'the typed price is shared and adds up');
  assert.ok(days.every((d) => d.status === 'sent' && d.duration_hours <= 12));
  assert.equal(days.flatMap((d) => JSON.parse(d.stops_json)).length, 7, 'every place once');
  const text = replies().join('\n');
  assert.match(text, /\(3 วัน\)[\s\S]*วันที่ 1 \(29 พ\.ย\. 2569\)[\s\S]*วันที่ 3 \(1 ธ\.ค\. 2569\)/);
  assert.match(text, /จุดรับ: รอยืนยัน/);
  globalThis.__tbEnv.TRIP_MULTIDAY = '';
});
