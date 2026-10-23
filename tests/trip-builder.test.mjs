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
function model(answer = plan()) { const m = { calls: 0, call: async () => { m.calls++; return answer; } }; return m; }
const anna = { display_name: 'Anna' };
let msg = 1000;
const message = (text, extra = {}) => ({ message_id: ++msg, chat: { id: Number(ADMIN), type: 'supergroup' }, from: { id: 42, first_name: 'Anna' }, text, ...extra });
const deps = (m) => ({ call: m.call, locate: async () => ({ lat: 13.74, lng: 100.55 }), today });
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
    assert.match(replies().at(-1), /วิธีสร้างทริปผ่าน Telegram[\s\S]*ต้องมี[\s\S]*ราคา[\s\S]*<code>\/trip 12 Dec/, text);
  }
  assert.equal(m.calls, 0);
  assert.equal((await trips()).length, before);
});

test('no price, or two prices and neither labelled: nothing is created and the model is not asked', async () => {
  const m = model(), before = (await trips()).length;
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, Wat Pho, SUV'), anna, deps(m));
  assert.match(replies().at(-1), /ใส่ราคาด้วย/);
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, car THB 3,000, tickets THB 1,000'), anna, deps(m));
  assert.match(replies().at(-1), /พบหลายราคา/);
  assert.equal(m.calls, 0);
  assert.equal((await trips()).length, before);
});

test('a place not in the attractions list stops the trip and explains /place', async () => {
  const m = model(plan({ stops: [{ placeId: 'grand-palace', name: 'Grand Palace' }, { placeId: null, name: 'Wat Saket' }] })), before = (await trips()).length;
  await tb.handleTripBuilder(message('/trip 12 Dec, Grand Palace, Wat Saket, THB 3,000'), anna, deps(m));
  assert.equal((await trips()).length, before);
  assert.match(replies().at(-1), /ไม่พบสถานที่เหล่านี้[\s\S]*Wat Saket[\s\S]*\/place/);
});

test('missing date or pickup, suggested places, or a car too small: nothing is created', async () => {
  const before = (await trips()).length;
  await tb.handleTripBuilder(message('/trip Grand Palace, Wat Pho, THB 3,000'), anna, deps(model(plan({ date: null, pickup: null }))));
  assert.match(replies().at(-1), /ขาดวันที่, จุดรับ/);
  await tb.handleTripBuilder(message('/trip temples tomorrow, THB 3,000'), anna, deps(model(plan({ suggested: true }))));
  assert.match(replies().at(-1), /ระบุชื่อสถานที่/);
  await tb.handleTripBuilder(message('/trip 6 adults, sedan, Grand Palace, THB 3,000'), anna, deps(model(plan({ adults: 6 }))));
  assert.match(replies().at(-1), /Economy sedan นั่งได้ 2 คน/);
  assert.equal((await trips()).length, before);
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
