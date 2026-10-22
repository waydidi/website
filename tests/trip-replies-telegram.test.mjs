import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// A customer's reply on their itinerary link (ask for a change, rate the day, pay) reaches staff in the Telegram
// Admin group, not only on LINE. Telegram is a fake that records what the bot sends.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
const ADMIN = '-100222';
globalThis.__trEnv = { DB: d1, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: ADMIN, RATE_LIMIT_SALT: 'test' };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'tr-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0tr-env'; }, load(id) { if (id === '\0tr-env') return 'export const env=globalThis.__trEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__trEnv; });
const route = await vite.ssrLoadModule('/app/api/itinerary/[token]/route.ts');
const notify = await vite.ssrLoadModule('/lib/trip-notify.ts');

let sent = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.telegram.org/')) { sent.push({ method: u.split('/').pop(), body: JSON.parse(String(init.body)) }); return Response.json({ ok: true, result: { message_id: 1 } }); }
  throw new Error(`unexpected fetch ${u}`);
};
beforeEach(() => { sent = []; });

const now = new Date().toISOString();
const snap = { version: 1, ref: 'TP-7001A', title: 'Bangkok temples', tripDate: '2099-12-12', startTime: '08:00', total: 1500, stops: [] };
async function trip(id, token, status = 'sent', tripDate = '2099-12-12') {
  await d1.prepare("INSERT INTO smart_trips(id,ref,status,title,token,customer_name,trip_date,snapshot_json,version,sent_at,created_at,updated_at) VALUES(?,?,?,'Bangkok temples',?,'Non <b>',?,?,1,?,?,?)")
    .bind(id, `TP-${id}`, status, token, tripDate, JSON.stringify({ ...snap, ref: `TP-${id}`, tripDate }), now, now, now).run();
}
const post = (token, body) => route.POST(new Request(`https://waydidi.example/api/itinerary/${token}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://waydidi.example' }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) });

test('asking for a change saves it and tells the Telegram Admin group, in Thai, with the Admin link', async () => {
  await trip('7001A', 'CHANGEREQUESTTOKEN23');
  const res = await post('CHANGEREQUESTTOKEN23', { action: 'change', message: '10:00 pick up <please>' });
  assert.equal(res.status, 200);
  const row = await d1.prepare("SELECT status, change_request FROM smart_trips WHERE id='7001A'").first();
  assert.deepEqual([row.status, row.change_request], ['changes_requested', '10:00 pick up <please>']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'sendMessage');
  assert.equal(sent[0].body.chat_id, ADMIN);
  assert.match(sent[0].body.text, /ลูกค้าขอแก้ไขทริป <b>TP-7001A<\/b>/);
  assert.match(sent[0].body.text, /“10:00 pick up &lt;please&gt;”/, 'the customer text is escaped');
  assert.match(sent[0].body.text, /Non &lt;b&gt;/);
  assert.match(sent[0].body.text, /https:\/\/waydidi\.example\/admin\/trips\/7001A/);
});

test('a refused change (paid trip, empty message) sends nothing', async () => {
  await trip('7002A', 'PAIDTRIPTOKENABCDEFG', 'accepted');
  assert.equal((await post('PAIDTRIPTOKENABCDEFG', { action: 'change', message: 'later pickup' })).status, 409);
  await trip('7003A', 'EMPTYMESSAGETOKEN234');
  assert.equal((await post('EMPTYMESSAGETOKEN234', { action: 'change', message: ' ' })).status, 400);
  assert.equal(sent.length, 0);
});

test('a rating reaches Telegram; three stars or fewer asks staff to follow up', async () => {
  await trip('7004A', 'RATINGTOKENABCDEFGHJ', 'accepted', '2026-01-01');
  assert.equal((await post('RATINGTOKENABCDEFGHJ', { action: 'feedback', rating: 2, comment: 'Driver was late' })).status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /★★☆☆☆ .* ให้คะแนนทริป <b>TP-7004A<\/b> ⚠️ กรุณาติดต่อกลับ/);
  assert.match(sent[0].body.text, /“Driver was late”/);
});

test('a paid trip is announced in Telegram; without Telegram set up nothing breaks', async () => {
  const row = await d1.prepare("SELECT * FROM smart_trips WHERE id='7001A'").first();
  const t = { ...row, ref: row.ref, title: row.title, tripDate: row.trip_date, customerName: row.customer_name, id: row.id };
  await notify.notifyTripReply(t, 'accepted', '', 'https://waydidi.example');
  assert.match(sent.at(-1).body.text, /ลูกค้ายืนยันและชำระเงินทริป <b>TP-7001A<\/b> แล้ว/);
  const token = globalThis.__trEnv.TELEGRAM_BOT_TOKEN;
  delete globalThis.__trEnv.TELEGRAM_BOT_TOKEN;
  const before = sent.length;
  await notify.notifyTripReply(t, 'change', 'x', 'https://waydidi.example');
  assert.equal(sent.length, before);
  globalThis.__trEnv.TELEGRAM_BOT_TOKEN = token;
});
