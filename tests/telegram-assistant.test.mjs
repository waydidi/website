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
globalThis.__aEnv = { DB: d1 };
globalThis.__sent = [];
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'assistant-test', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0a-env'; if (id.endsWith('/lib/telegram/client')) return '\0a-tg'; },
  load(id) {
    if (id === '\0a-env') return 'export const env=globalThis.__aEnv';
    if (id === '\0a-tg') return 'export async function sendCard(text,k,replyTo){globalThis.__sent.push({text,replyTo});return {message_id:1}} export async function tg(){return {}} export const telegramChatId=()=>"-1"';
  } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const tools = await vite.ssrLoadModule('/lib/telegram/assistant-tools.ts');
const assistant = await vite.ssrLoadModule('/lib/telegram/assistant.ts');
const run = (name, input, role) => tools.runAssistantTool(name, input, role).then(JSON.parse);

const now = '2026-10-01T00:00:00.000Z';
async function seed() {
  await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,fulfillment_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind('TAYLA1', 'Tayla', 'Smith', 'tayla@example.invalid', '+61 412 345 678', 'Krung Thep Aphiwat', 'Siam Beach Resort', '2099-01-05', '06:00', 3, 2, 'premium_minivan', 'cash', 2500, 'confirmed', 'cash_due', 0, 'x', 'complete', now, now).run();
  await d1.prepare("INSERT INTO drivers(id,full_name,phone,vehicle,car_plate,driver_type,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind('d1', 'Aey', '0639299689', 'Toyota Commuter', '1นฌ 1183', 'outsource', 'active', now, now).run();
  await d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind('a1', 'TAYLA1', 'outbound', 'd1', 'h', 'assigned', 'test', now, '2099-02-01', now).run();
  await d1.prepare("INSERT INTO booking_costs(booking_reference,agreed_driver_cost,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind('TAYLA1', 1800, 0, 'unpaid', 'test', now, now).run();
}
await seed();

test('each lookup follows the Admin role rules', () => {
  const can = (role, t) => tools.mayUse(role, t);
  for (const t of ['search_bookings', 'get_booking', 'schedule', 'search_drivers', 'revenue_report', 'payments_overview', 'open_chats', 'waydidi_facts']) assert.equal(can('owner', t), true, t);
  assert.equal(can('finance', 'revenue_report'), true);
  assert.equal(can('finance', 'payments_overview'), true);
  assert.equal(can('finance', 'get_booking'), true, 'finance sees bookings through payments');
  assert.equal(can('finance', 'search_drivers'), false);
  assert.equal(can('operations', 'schedule'), true);
  assert.equal(can('operations', 'search_drivers'), true);
  assert.equal(can('operations', 'revenue_report'), false);
  assert.equal(can('operations', 'payments_overview'), false);
  assert.equal(can('support', 'get_booking'), true);
  assert.equal(can('support', 'payments_overview'), false);
  assert.equal(can('support', 'search_drivers'), false);
  assert.equal(can('editor', 'search_bookings'), false);
  for (const role of ['support', 'editor']) for (const t of ['waydidi_facts', 'quote_transfer', 'search_knowledge']) assert.equal(can(role, t), true, `${role} ${t}`);
});

test('a lookup outside the role is refused, not run', async () => {
  const r = await run('payments_overview', {}, 'support');
  assert.equal(r.ok, false);
  assert.match(r.reason, /support role/);
});

test('facts come from the single-source files', async () => {
  const facts = await run('waydidi_facts', {}, 'support');
  assert.equal(facts.contact.email, 'support@waydidi.com');
  assert.equal(facts.refund_policy.full_refund_more_than_hours, 48);
  assert.equal(facts.refund_policy.partial_refund_percent, 50);
  assert.equal(facts.vehicles.find((v) => v.id === 'economy_sedan').passengers, 2);
  assert.equal(facts.loyalty.every_nth_completed_ride, 5);
  assert.equal(facts.member_tiers[1].perks[0], '5% off every booking (up to THB 500)');
});



test('bookings are found by name, surname, reference or phone, with the driver', async () => {
  for (const query of ['tayla', 'Smith', 'TAYLA1', '0412 345 678']) {
    const rows = await run('search_bookings', { query, date_from: '', date_to: '', status: 'any' }, 'support');
    assert.equal(rows[0]?.reference, 'TAYLA1', query);
    assert.equal(rows[0].driver, 'Aey');
  }
  assert.ok((await run('search_bookings', { query: 'nobody', date_from: '', date_to: '', status: 'any' }, 'support')).none);
});

test('one booking in full; the driver cost only for roles that see money', async () => {
  const support = await run('get_booking', { reference: 'tayla1' }, 'support');
  assert.equal(support.booking.customer_phone, '+61 412 345 678');
  assert.equal(support.drivers[0].full_name, 'Aey');
  assert.equal(support.drivers[0].car_plate, '1นฌ 1183');
  assert.match(support.driver_job_message, /ชื่อลูกค้า: Tayla Smith/);
  assert.equal('driver_cost_thb' in support, false);
  const finance = await run('get_booking', { reference: 'TAYLA1' }, 'finance');
  assert.equal(finance.driver_cost_thb, 1800);
});

test('schedule and drivers show who drives when', async () => {
  const day = await run('schedule', { date_from: '2099-01-05', date_to: '2099-01-05' }, 'operations');
  assert.deepEqual(day.map((r) => [r.reference, r.driver]), [['TAYLA1', 'Aey']]);
  const drivers = await run('search_drivers', { query: 'aey' }, 'operations');
  assert.equal(drivers[0].next_jobs[0].reference, 'TAYLA1');
  assert.equal('id' in drivers[0], false);
});

function fakeClient(script) {
  const calls = [];
  return { calls, beta: { messages: { create: async (body) => { calls.push(body); return script.shift(); } } } };
}

test('the assistant answers from lookups, with the asker\'s role', async () => {
  const ran = [];
  const client = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'search_bookings', input: { query: 'Tayla' } }], usage: { input_tokens: 1000, output_tokens: 50 } },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Reference: TAYLA1' }], usage: { input_tokens: 1200, output_tokens: 20 } },
  ]);
  const answer = await assistant.assistantTurn('Give me Tayla ref id', { role: 'operations', name: 'Boss' }, client, async (name, input, role) => { ran.push([name, input.query, role]); return '[{"reference":"TAYLA1"}]'; });
  assert.equal(answer.text, 'Reference: TAYLA1');
  assert.deepEqual(ran, [['search_bookings', 'Tayla', 'operations']]);
  assert.equal(answer.requests, 2);
  assert.ok(answer.usd > 0);
  assert.equal(client.calls[0].model, 'claude-haiku-5-5');
  assert.equal('fallbacks' in client.calls[0], false, 'Haiku 5.5 has no server-side fallback');
  assert.match(client.calls[0].system[0].text, /Admin role is "operations"/);
  assert.match(client.calls[0].system[0].text, /Answer only from what the lookups return/);
  assert.equal(client.calls[1].messages.at(-1).content[0].tool_use_id, 't1');
});

test('a failing lookup becomes a message, a refusal a polite no, and loops stop', async () => {
  const failing = fakeClient([
    { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_booking', input: { reference: 'X' } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Could not load it.' }] },
  ]);
  const a = await assistant.assistantTurn('?', { role: 'owner', name: 'O' }, failing, async () => { throw new Error('db down'); });
  assert.equal(a.text, 'Could not load it.');
  assert.match(failing.calls[1].messages.at(-1).content[0].content, /couldn't be loaded/);
  const refused = await assistant.assistantTurn('?', { role: 'owner', name: 'O' }, fakeClient([{ stop_reason: 'refusal', content: [] }]));
  assert.match(refused.text, /can't answer/);
  const loop = Array.from({ length: 10 }, (_, i) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `t${i}`, name: 'waydidi_facts', input: {} }] }));
  const looping = await assistant.assistantTurn('?', { role: 'owner', name: 'O' }, fakeClient(loop), async () => '{}');
  assert.match(looping.text, /too many lookups/);
  assert.equal(looping.requests, 6);
});

test('one admin: every Telegram team member asks with full (owner) access, including payments', async () => {
  assert.equal(assistant.TELEGRAM_TEAM_ROLE, 'owner');
  const r = await run('payments_overview', {}, assistant.TELEGRAM_TEAM_ROLE);
  assert.notEqual(r.ok, false, 'the team role may see payments');
  assert.equal(r.reason, undefined);
});

test('long answers are split for Telegram', () => {
  const parts = assistant.splitForTelegram(Array.from({ length: 300 }, (_, i) => `Line ${i} ${'x'.repeat(30)}`).join('\n'));
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 3900));
});

test('the monthly cap stops answers and says how to raise it', async () => {
  globalThis.__aEnv.TELEGRAM_ASSISTANT_MONTHLY_USD = '0';
  globalThis.__sent = [];
  await assistant.answerInGroup('hello', 9, { name: 'O', staffId: null }, null);
  assert.match(globalThis.__sent[0].text, /spending limit/);
  delete globalThis.__aEnv.TELEGRAM_ASSISTANT_MONTHLY_USD;
});

test('Admin sees this month\'s questions and spend against the limit', async () => {
  await d1.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(`tg_assistant_usage:${new Date().toISOString().slice(0, 7)}`, JSON.stringify({ questions: 12, usd: 0.0061 }), now).run();
  const u = await assistant.assistantUsage();
  assert.deepEqual({ questions: u.questions, usd: u.usd, capUsd: u.capUsd, model: u.model }, { questions: 12, usd: 0.0061, capUsd: 20, model: 'claude-haiku-5-5' });
});

test('the webhook routes customer replies and job lookups before the assistant, for team members only', async () => {
  const route = await readFile(new URL('../app/api/integrations/telegram/webhook/route.ts', import.meta.url), 'utf8');
  const at = route.indexOf('answerInGroup(');
  assert.ok(at > route.indexOf('conversationForTelegramMessage(m.reply_to_message.message_id, String(m.chat.id))'));
  assert.ok(at > route.indexOf('if (!teamMember) {'));
  assert.ok(at > route.indexOf('await answerJobLookup(query'));
});
