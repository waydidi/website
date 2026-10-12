import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__jobEnv = { DB: d1 };
globalThis.__sent = [];
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'job-test', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0job-env'; if (id.endsWith('/lib/telegram/client')) return '\0job-tg'; },
  load(id) {
    if (id === '\0job-env') return 'export const env=globalThis.__jobEnv';
    if (id === '\0job-tg') return 'export async function sendCard(text,keyboard,replyTo){globalThis.__sent.push({text,replyTo});return {message_id:1}}';
  } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const rules = await vite.ssrLoadModule('/lib/telegram/job-lookup-rules.ts');
const lookup = await vite.ssrLoadModule('/lib/telegram/job-lookup.ts');

test('job requests are recognised in English, Thai and as a command', () => {
  assert.equal(rules.parseJobLookup('Give me assignment for Tayla'), 'Tayla');
  assert.equal(rules.parseJobLookup('assignment Tayla Smith?'), 'Tayla Smith');
  assert.equal(rules.parseJobLookup('ขอใบงาน Tayla หน่อยครับ'), null, 'Thai words written together are not split');
  assert.equal(rules.parseJobLookup('ขอ ใบงาน Tayla หน่อย ครับ'), 'Tayla');
  assert.equal(rules.parseJobLookup('งาน Tayla'), 'Tayla');
  assert.equal(rules.parseJobLookup('/job FMBNUW'), 'FMBNUW');
  assert.equal(rules.parseJobLookup('/job@WaydidiBot Tayla'), 'Tayla');
  assert.equal(rules.parseJobLookup('jobs for tayla'), 'tayla');
  assert.equal(rules.parseJobLookup('Can you send the job for Tayla please'), 'Tayla');
});

test('ordinary group talk is not a job request', () => {
  for (const t of ['Good job everyone!', 'The driver arrived', 'job', 'assignment', 'Give me the assignment', 'jobless', 'I have a jobby day', 'Nice job Aey', 'Tayla job is done', '']) assert.equal(rules.parseJobLookup(t), null, t);
});

test('name patterns treat % and _ literally', () => {
  assert.equal(rules.namePattern('Ta%y_'), '%ta\\%y\\_%');
  assert.equal(rules.bangkokToday(Date.parse('2026-10-12T20:00:00Z')), '2026-10-13');
});

let n = 0;
async function booking(o) {
  const reference = o.reference ?? `REF${++n}X`;
  const now = '2026-10-01T00:00:00.000Z';
  await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,fulfillment_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(reference, o.name ?? 'Tayla', o.surname ?? 'Smith', 't@example.invalid', 'Krung Thep Aphiwat', 'Siam Beach Resort', o.date ?? '2026-10-20', o.time ?? '06:00', 3, 2, 'premium_minivan', 'cash', 2500, o.status ?? 'confirmed', 'cash_due', 0, 'x', 'complete', now, now).run();
  return reference;
}

test('upcoming bookings for a name, nearest first, with the driver cost', async () => {
  const later = await booking({ date: '2026-10-25' });
  const sooner = await booking({ date: '2026-10-14', time: '08:30' });
  await booking({ date: '2026-10-01' });
  await booking({ status: 'cancelled' });
  await booking({ name: 'Somchai', surname: 'Jaidee' });
  await d1.prepare("INSERT INTO booking_costs(booking_reference,agreed_driver_cost,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(sooner, 1800, 0, 'unpaid', 'test', 'x', 'x').run();
  const rows = await lookup.findJobs('tayla', '2026-10-12');
  assert.deepEqual(rows.map((r) => r.reference), [sooner, later]);
  const text = lookup.jobReply(rows[0]);
  assert.match(text, new RegExp(`<b>${sooner}</b>`));
  assert.match(text, /ชื่อลูกค้า: Tayla Smith/);
  assert.match(text, /วันที่\/เวลา: 14\/10\/2026 08:30/);
  assert.match(text, /ราคา: 1,800 บาท/);
  assert.equal((await lookup.findJobs('smith tayla', '2026-10-12')).length, 2, 'surname first works too');
});

test('an exact reference finds that booking even if it is past or cancelled', async () => {
  const ref = await booking({ reference: 'FMBNUW', date: '2026-10-11', status: 'cancelled', name: 'Anna' });
  const rows = await lookup.findJobs('fmbnuw', '2026-10-12');
  assert.deepEqual(rows.map((r) => r.reference), [ref]);
  assert.match(lookup.jobReply(rows[0]), /ยกเลิกแล้ว/);
});

test('replies under the question, and say so when nothing matches or there are many', async () => {
  globalThis.__sent = [];
  await lookup.answerJobLookup('Nobody Here', 42);
  assert.equal(globalThis.__sent.length, 1);
  assert.match(globalThis.__sent[0].text, /No upcoming booking found/);
  assert.equal(globalThis.__sent[0].replyTo, 42);
  for (let i = 0; i < 6; i++) await booking({ name: 'Many', surname: `P${i}`, date: '2099-01-0' + (i + 1) });
  globalThis.__sent = [];
  await lookup.answerJobLookup('many', 7);
  assert.equal(globalThis.__sent.length, 6);
  assert.match(globalThis.__sent[5].text, /Showing the first 5/);
});

test('the webhook answers job requests only from the team and only when not replying to a customer', async () => {
  const route = await readFile(new URL('../app/api/integrations/telegram/webhook/route.ts', import.meta.url), 'utf8');
  const lookupAt = route.indexOf('parseJobLookup(text);');
  assert.ok(lookupAt > route.indexOf('conversationForTelegramMessage(m.reply_to_message.message_id)'), 'customer replies are routed first');
  assert.match(route.slice(lookupAt, lookupAt + 400), /if \(!teamMember\)/);
});
