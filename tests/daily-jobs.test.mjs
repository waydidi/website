import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// Today's (07:00) and tomorrow's (18:00) job lists in the Telegram Admin group (lib/telegram/daily-jobs*.ts).
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("x")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(`${root}/drizzle`)).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(`${root}/drizzle/${name}`, 'utf8'));
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
const ADMIN = '-100222';
globalThis.__dj = { DB: d1, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: ADMIN, WAYDIDI_PUBLIC_URL: 'https://waydidi.example' };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'dj-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0dj-env'; }, load(id) { if (id === '\0dj-env') return 'export const env=globalThis.__dj'; } }] });
let sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith('https://api.telegram.org')) return realFetch(url, init);
  sent.push(JSON.parse(String(init.body)));
  return Response.json({ ok: true, result: { message_id: 700 + sent.length, chat: { id: Number(ADMIN) } } });
};
after(async () => { globalThis.fetch = realFetch; await vite.close(); await mf.dispose(); delete globalThis.__dj; });
beforeEach(() => { sent = []; });
const rules = await vite.ssrLoadModule('/lib/telegram/daily-jobs-rules.ts');
const jobs = await vite.ssrLoadModule('/lib/telegram/daily-jobs.ts');

// Seeded before any test is declared, so the runner waits for it.
async function booking(ref, o = {}) {
  const b = { pickup_date: '2026-11-05', pickup_time: '09:00', status: 'confirmed', payment_method: 'card', payment_status: 'paid', return_date: null, return_time: null, binned_at: null, vehicle: 'comfort_suv', ...o };
  await d1.prepare(`INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,payment_status,total,status,return_date,return_time,binned_at,access_token_hash,created_at,updated_at)
    VALUES(?,'Guest','g@example.invalid','Phuket Airport, Thalang','Kata Beach Resort, Karon',?,?,2,2,?,?,?,1500,?,?,?,?,'x','2026-11-01T00:00:00Z','2026-11-01T00:00:00Z')`)
    .bind(ref, b.pickup_date, b.pickup_time, b.vehicle, b.payment_method, b.payment_status, b.status, b.return_date, b.return_time, b.binned_at).run();
}
await d1.prepare("INSERT INTO drivers(id,full_name,phone,status,created_at,updated_at) VALUES('drv-1','Somchai Jaidee','0812345678','active','x','x')").run();
await booking('TODAY1');
await d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES('as-1','TODAY1','outbound','drv-1','h','assigned','owner','x','2099-01-01','x')").run();
await booking('ROUND1', { pickup_date: '2026-11-03', return_date: '2026-11-05', return_time: '17:30', payment_method: 'cash', payment_status: 'pending' });
await booking('CANCEL1', { status: 'cancelled' });
await booking('BIN1', { binned_at: '2026-11-02T00:00:00Z' });
await booking('UNPAID1', { status: 'pending_payment' });
await booking('OTHER1', { pickup_date: '2026-11-07' });
await booking('TOMORROW1', { pickup_date: '2026-11-06', pickup_time: '06:15' });

// Bangkok time = UTC+7.
const bkk = (iso) => new Date(new Date(`${iso}Z`).getTime() - 7 * 3600_000);

test('due: today 07:00–12:00, tomorrow 18:00–24:00 (Bangkok time), nothing in between', () => {
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-11-05T06:59')), []);
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-11-05T07:00')), [{ slot: 'today', date: '2026-11-05' }]);
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-11-05T11:59')), [{ slot: 'today', date: '2026-11-05' }]);
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-11-05T12:00')), []);
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-11-05T17:59')), []);
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-11-05T18:00')), [{ slot: 'tomorrow', date: '2026-11-06' }]);
  assert.deepEqual(rules.dailyJobsDue(bkk('2026-12-31T23:59')), [{ slot: 'tomorrow', date: '2027-01-01' }]);
});

const job = (o = {}) => ({ time: '08:30', reference: 'REF1', leg: 'outbound', from: 'Phuket Airport (HKT), Thalang', to: 'Kata Beach Resort, Karon', vehicleName: 'Comfort SUV', passengers: 3, driver: 'Somchai', payment: 'paid', ...o });

test('the list: earliest first, missing drivers counted, payment and the return leg shown, names escaped', () => {
  const [text] = rules.dailyJobsMessages('today', '2026-11-05', [job({ time: '14:00', reference: 'B2', driver: null, payment: 'cash', leg: 'return' }), job(), job({ time: '09:00', reference: 'C<3>', payment: 'unpaid', driver: null })], 'https://waydidi.example/admin/bookings');
  const lines = text.split('\n');
  assert.equal(lines[0], '📋 <b>งานวันนี้</b> · 5 พ.ย. 2569 · 3 งาน');
  assert.equal(lines[1], '⚠️ ยังไม่มีคนขับ 2 งาน');
  assert.ok(text.indexOf('08:30') < text.indexOf('09:00') && text.indexOf('09:00') < text.indexOf('14:00'), 'earliest first');
  assert.match(text, /<b>08:30<\/b> · REF1 · Phuket Airport \(HKT\) → Kata Beach Resort\n {4}🚗 Comfort SUV · 3 คน · 👤 Somchai · ✅ จ่ายแล้ว/);
  assert.match(text, /B2 \(ขากลับ\)[\s\S]*⚠️ ยังไม่มีคนขับ · 💵 เก็บเงินสด/);
  assert.match(text, /C&lt;3&gt;[\s\S]*⏳ ยังไม่ชำระ/);
  assert.match(text, /🔗 https:\/\/waydidi\.example\/admin\/bookings$/);
  assert.deepEqual(rules.dailyJobsMessages('tomorrow', '2026-11-06', [], 'x'), ['📋 <b>งานพรุ่งนี้</b> · 6 พ.ย. 2569\nไม่มีงาน']);
});

test('a long list is split to fit Telegram, every job once', () => {
  const many = Array.from({ length: 60 }, (_, i) => job({ reference: `R${String(i).padStart(2, '0')}`, time: `0${Math.floor(i / 10)}:${String(i % 10)}0` }));
  const msgs = rules.dailyJobsMessages('today', '2026-11-05', many, 'https://waydidi.example/admin/bookings');
  assert.ok(msgs.length > 1);
  assert.ok(msgs.every((m) => m.length <= 4096));
  assert.match(msgs[1], /^📋 <b>งานวันนี้<\/b> · 5 พ\.ย\. 2569 \(ต่อ\)/);
  assert.equal(msgs.join('\n').match(/· R\d\d ·/g).length, 60);
});

test('07:00: the Admin group gets today\'s confirmed legs once, with driver and payment; cancelled, binned, unpaid-checkout and other days are left out', async () => {
  const at = bkk('2026-11-05T07:01');
  const [first, second] = await Promise.all([jobs.sendDailyJobs(at), jobs.sendDailyJobs(at)]);
  await jobs.sendDailyJobs(bkk('2026-11-05T07:02'));
  assert.equal(sent.length, 1, 'posted once, even with two runs at once and a later run');
  assert.equal(first.length + second.length >= 1, true);
  const msg = sent[0];
  assert.equal(String(msg.chat_id), ADMIN);
  assert.match(msg.text, /^📋 <b>งานวันนี้<\/b> · 5 พ\.ย\. 2569 · 2 งาน\n⚠️ ยังไม่มีคนขับ 1 งาน/);
  assert.match(msg.text, /<b>09:00<\/b> · TODAY1 · Phuket Airport → Kata Beach Resort\n {4}🚗 Comfort SUV · 2 คน · 👤 Somchai Jaidee · ✅ จ่ายแล้ว/);
  assert.match(msg.text, /<b>17:30<\/b> · ROUND1 \(ขากลับ\) · Kata Beach Resort → Phuket Airport\n {4}🚗 Comfort SUV · 2 คน · ⚠️ ยังไม่มีคนขับ · 💵 เก็บเงินสด/);
  for (const ref of ['CANCEL1', 'BIN1', 'UNPAID1', 'OTHER1', 'TOMORROW1']) assert.doesNotMatch(msg.text, new RegExp(ref));
});

test('18:00: tomorrow\'s list, once; nothing between noon and 18:00; off with TELEGRAM_DAILY_JOBS=0', async () => {
  assert.deepEqual(await jobs.sendDailyJobs(bkk('2026-11-05T15:00')), []);
  globalThis.__dj.TELEGRAM_DAILY_JOBS = '0';
  assert.deepEqual(await jobs.sendDailyJobs(bkk('2026-11-05T18:00')), []);
  assert.equal(sent.length, 0);
  delete globalThis.__dj.TELEGRAM_DAILY_JOBS;
  await jobs.sendDailyJobs(bkk('2026-11-05T18:00'));
  await jobs.sendDailyJobs(bkk('2026-11-05T21:00'));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /^📋 <b>งานพรุ่งนี้<\/b> · 6 พ\.ย\. 2569 · 1 งาน/);
  assert.match(sent[0].text, /<b>06:15<\/b> · TOMORROW1/);
  // A day with no jobs still says so, so the team knows the list ran.
  await jobs.sendDailyJobs(bkk('2026-11-07T18:00'));
  assert.match(sent.at(-1).text, /งานพรุ่งนี้<\/b> · 8 พ\.ย\. 2569\nไม่มีงาน/);
});
