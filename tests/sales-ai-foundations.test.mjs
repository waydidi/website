import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
// Sales Intelligence PR 1: activity log, model config, guarded AI sends, WhatsApp window, media and delivery status.
// Synthetic data only; outbound network calls are stubbed and recorded.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const db = await mf.getD1Database('DB');
await db.exec('CREATE TABLE staff_accounts(id TEXT PRIMARY KEY,display_name TEXT,active INTEGER,role TEXT);');
await db.exec("CREATE TABLE attractions(id TEXT PRIMARY KEY,name TEXT,customer_name TEXT,area TEXT DEFAULT '',category TEXT DEFAULT 'sight',tags_json TEXT DEFAULT '[]',open_time TEXT,close_time TEXT,closed_days_json TEXT DEFAULT '[]',exceptions_json TEXT DEFAULT '[]',duration_min INTEGER DEFAULT 60,dress_code TEXT,description TEXT,status TEXT DEFAULT 'active');");
await db.exec('CREATE TABLE drivers(id TEXT PRIMARY KEY,full_name TEXT,phone TEXT);');
for (const file of ['0061_website_chat.sql', '0069_chat_telegram.sql', '0070_support_reviews.sql', '0071_chat_country.sql', '0072_cee_bot.sql', '0073_cee_knowledge_channels.sql', '0074_non_scaling.sql', '0075_chat_read_receipts.sql', '0076_chat_idle.sql', '0077_telegram_prompt_user.sql', '0078_telegram_dm.sql', '0079_chat_payment_links.sql', '0080_chat_cards.sql', '0081_telegram_booking_tasks.sql', '0082_telegram_request_cards.sql', '0084_chat_alerts_limits.sql', '0085_booking_links.sql', '0086_flight_status.sql', '0087_flight_stats.sql', '0088_flight_tracked.sql', '0089_flight_watch.sql', '0090_flight_settings.sql', '0091_site_settings.sql', '0127_sales_ai_foundations.sql'])
  for (const sql of (await readFile(root + '/drizzle/' + file, 'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();

const SECRET = 'test-app-secret';
const baseEnv = { DB: db, ANTHROPIC_API_KEY: 'test-key', WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: 'verify' };
globalThis.__salesTest = { env: { ...baseEnv }, user: null };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'sales-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0sales-env'; if (id === '@/lib/admin' || id === root + '/lib/admin') return '\0sales-admin'; },
  load(id) { if (id === '\0sales-env') return 'export const env=new Proxy({},{get:(_,k)=>globalThis.__salesTest.env[k],has:(_,k)=>k in globalThis.__salesTest.env})'; if (id === '\0sales-admin') return 'export async function getWaydidiAdmin(){return globalThis.__salesTest.user}'; } }], server: { middlewareMode: true } });

// Every outbound request is recorded; WhatsApp sends succeed with a synthetic id.
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
  return new Response(JSON.stringify({ messages: [{ id: `wamid.out${sent.length}` }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
after(async () => { globalThis.fetch = realFetch; await vite.close(); await mf.dispose(); delete globalThis.__salesTest; });

const { redact, redactDetail } = await vite.ssrLoadModule('/lib/sales-ai/redact.ts');
const models = await vite.ssrLoadModule('/lib/sales-ai/model-config.ts');
const wa = await vite.ssrLoadModule('/lib/sales-ai/whatsapp-rules.ts');
const chat = await vite.ssrLoadModule('/lib/website-chat.ts');
const bot = await vite.ssrLoadModule('/lib/cee/bot.ts');
const webhook = await vite.ssrLoadModule('/app/api/integrations/whatsapp/webhook/route.ts');
const activityApi = await vite.ssrLoadModule('/app/api/admin/ai-activity/route.ts');
const log = await vite.ssrLoadModule('/lib/sales-ai/activity-log.ts');

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
let n = 0;
async function conversation({ channel = 'web', visitorAgoMs = 0, body = 'Hello' } = {}) {
  const id = `chat-${++n}`, expires = iso(-86400000);
  await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,channel,channel_user_id,public_id) VALUES(?,?,?,?,?,?,?,?)').bind(id, `hash-${n}`, expires, iso(), iso(), channel, channel === 'web' ? null : `6600000000${n}`, `W${n}`).run();
  await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,client_id,telegram_status) VALUES(?,?,'visitor',?,?,?,'sent')").bind(`v-${n}`, id, body, iso(visitorAgoMs), `seed:${n}`).run();
  return id;
}
const botMessages = async (id) => (await db.prepare('SELECT body,channel_message_id FROM website_chat_messages WHERE conversation_id=? AND is_bot=1').bind(id).all()).results;
const activity = async (event, id) => (await db.prepare('SELECT * FROM ai_activity_log WHERE event=? AND (? IS NULL OR conversation_id=?) ORDER BY created_at').bind(event, id ?? null, id ?? null).all()).results;
const signed = (payload) => { const raw = JSON.stringify(payload); return new Request('https://example.invalid/api/integrations/whatsapp/webhook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', SECRET).update(raw).digest('hex') } }); };
const envelope = (value) => ({ entry: [{ changes: [{ value }] }] });

test('redaction removes contact details, card numbers and keys but keeps dates', () => {
  const out = redact('Mail a.b@example.com, call +66 81 234 5678, card 4242 4242 4242 4242, key sk-ant-abcdefghijklmnop, Bearer abc.def.ghi123, pickup 2026-11-24 09:00');
  assert.ok(!/example\.com|234 5678|4242|sk-ant|abc\.def/.test(out), out);
  assert.match(out, /\[email\].*\[phone\].*\[card\].*\[secret\].*Bearer \[secret\]/);
  assert.match(out, /2026-11-24 09:00/);
  assert.deepEqual(redactDetail({ apiKey: 'x', note: 'ring 0812345678', nested: { password: 'p', ok: 1 } }), { note: 'ring [phone]', nested: { ok: 1 } });
});

test('model ids come from Worker variables; unknown models record unknown cost but count at the highest price', () => {
  assert.deepEqual(models.resolveModels({}), models.DEFAULT_MODELS);
  assert.deepEqual(models.resolveModels({ AI_MODEL_FAST: ' claude-sonnet-5-5 ', AI_MODEL_SMART: 'DROP TABLE;' }), { fast: 'claude-sonnet-5-5', smart: models.DEFAULT_MODELS.smart });
  const usage = { input_tokens: 1_000_000, output_tokens: 0 };
  assert.deepEqual(models.modelCost('claude-haiku-4-5', usage), { usd: 1, budgetUsd: 1 });
  const unknown = models.modelCost('claude-new-model', usage);
  assert.equal(unknown.usd, null);
  assert.equal(unknown.budgetUsd, 4);
});

test('WhatsApp window, delivery-status order, media references and the channel kill switch are strict', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  assert.equal(wa.whatsappWindowOpen('2026-11-23T12:00:01Z', now), true);
  assert.equal(wa.whatsappWindowOpen('2026-11-23T11:59:59Z', now), false);
  assert.equal(wa.whatsappWindowOpen(null, now), false);
  assert.equal(wa.whatsappWindowOpen('2026-11-25T12:00:00Z', now), false, 'a future timestamp is not trusted');
  assert.equal(wa.nextDeliveryStatus(null, 'read'), 'read');
  assert.equal(wa.nextDeliveryStatus('read', 'delivered'), null, 'late delivered never moves read back');
  assert.equal(wa.nextDeliveryStatus('sent', 'failed'), 'failed');
  assert.equal(wa.nextDeliveryStatus('delivered', 'failed'), null);
  assert.equal(wa.nextDeliveryStatus('failed', 'read'), null);
  assert.deepEqual(wa.whatsappMediaRef({ type: 'image', image: { id: 'abc123', mime_type: 'image/jpeg', sha256: 'q83vEjRWeJA=AAAAAAAAAA', caption: ' flight ' } }), { kind: 'image', mediaId: 'abc123', mimeType: 'image/jpeg', sha256: 'q83vEjRWeJA=AAAAAAAAAA', caption: 'flight' });
  assert.equal(wa.whatsappMediaRef({ type: 'image', image: { id: '../../etc' } }), null);
  assert.equal(wa.whatsappMediaRef({ type: 'text', text: { body: 'hi' } }), null);
  assert.deepEqual([...wa.disabledChannels(' WhatsApp, line, sms ')], ['whatsapp', 'line']);
});

test('a takeover before Non saves its reply stops the reply: nothing stored, nothing sent, suppression logged', async () => {
  const id = await conversation({ channel: 'whatsapp' });
  await db.prepare("UPDATE website_conversations SET assigned_name='Alice',assigned_staff_id='alice' WHERE id=?").bind(id).run();
  sent.length = 0;
  assert.equal(await chat.addBotMessage(id, 'Price is ฿1,800'), null);
  assert.equal((await botMessages(id)).length, 0);
  assert.equal(sent.length, 0);
  const [row] = await activity('send_suppressed', id);
  assert.equal(row.status, 'suppressed');
  assert.match(row.summary, /staff/i);
});

test('staff taking over while the model is still thinking means Non stays silent', async () => {
  const id = await conversation({ channel: 'whatsapp', body: 'Price BKK to Pattaya tomorrow?' });
  sent.length = 0;
  const client = { beta: { messages: { create: async () => {
    // A person assigns the chat while the model call is in flight.
    await db.prepare("UPDATE website_conversations SET assigned_name='Bob',assigned_staff_id='bob' WHERE id=?").bind(id).run();
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'It is ฿1,800.' }], usage: { input_tokens: 1200, output_tokens: 40 } };
  } } } };
  await bot.runCee(id, { client });
  assert.equal((await botMessages(id)).length, 0);
  assert.equal(sent.filter((s) => s.url.includes('/messages') && s.body?.type === 'text').length, 0);
  const [call] = await activity('model_call', id);
  assert.equal(call.model, models.DEFAULT_MODELS.fast);
  assert.equal(call.input_tokens, 1200);
  assert.equal(call.output_tokens, 40);
  assert.equal(call.cost_usd_micros, 1400, '1200 in at $1/M + 40 out at $5/M');
});

test('free-form WhatsApp replies outside the 24-hour window are not sent and are logged', async () => {
  const id = await conversation({ channel: 'whatsapp', visitorAgoMs: 25 * 3600_000 });
  sent.length = 0;
  assert.ok(await chat.addBotMessage(id, 'Following up on your trip'));
  assert.equal(sent.length, 0);
  assert.equal((await botMessages(id))[0].channel_message_id, 'outside_window');
  assert.equal((await activity('send_suppressed', id))[0].status, 'suppressed');
  const open = await conversation({ channel: 'whatsapp', visitorAgoMs: 3600_000 });
  assert.ok(await chat.addBotMessage(open, 'Here you go'));
  assert.equal(sent.length, 1);
  assert.match((await botMessages(open))[0].channel_message_id, /^wamid\.out/);
});

test('NON_DISABLED_CHANNELS stops Non on that channel without calling the model', async () => {
  const id = await conversation({ channel: 'whatsapp' });
  globalThis.__salesTest.env.NON_DISABLED_CHANNELS = 'whatsapp';
  let calls = 0;
  try {
    await bot.runCee(id, { client: { beta: { messages: { create: async () => { calls++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] }; } } } } });
  } finally { delete globalThis.__salesTest.env.NON_DISABLED_CHANNELS; }
  assert.equal(calls, 0);
  assert.equal((await botMessages(id)).length, 0);
  assert.equal((await activity('kill_switch', id)).length, 1);
});

test('WhatsApp webhook: bad signature refused; media stored once by reference; statuses only move forward', async () => {
  assert.equal((await webhook.POST(new Request('https://example.invalid/x', { method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=00' } }))).status, 401);
  const env = globalThis.__salesTest.env; delete env.ANTHROPIC_API_KEY; // Non off: no model, no scheduling
  try {
    const media = envelope({ contacts: [{ wa_id: '66999000111', profile: { name: 'Test' } }], messages: [{ from: '66999000111', id: 'wamid.in1', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'abcdefghijklmnop1234' } }] });
    assert.equal((await webhook.POST(signed(media))).status, 200);
    assert.equal((await webhook.POST(signed(media))).status, 200, 'a retried webhook is accepted');
    const rows = (await db.prepare("SELECT * FROM whatsapp_media WHERE media_id='media-1'").all()).results;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'image');
    assert.ok(rows[0].conversation_id);
    assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE client_id='whatsapp:wamid.in1'").first()).n, 1);
    assert.equal((await activity('media_received')).length, 1);
    assert.equal(sent.filter((s) => s.url.includes('/media')).length, 0, 'media is never downloaded in PR 1');

    const status = (s, extra = {}) => signed(envelope({ statuses: [{ id: 'wamid.outX', status: s, timestamp: '1', recipient_id: '66999000111', ...extra }] }));
    await webhook.POST(status('read'));
    await webhook.POST(status('delivered'));
    await webhook.POST(status('failed', { errors: [{ code: 131047 }] }));
    assert.equal((await db.prepare("SELECT status FROM channel_delivery_status WHERE channel_message_id='wamid.outX'").first()).status, 'read');
    await webhook.POST(signed(envelope({ statuses: [{ id: 'wamid.outY', status: 'sent' }] })));
    await webhook.POST(signed(envelope({ statuses: [{ id: 'wamid.outY', status: 'failed', errors: [{ code: 131026 }] }] })));
    const y = await db.prepare("SELECT status,error_code FROM channel_delivery_status WHERE channel_message_id='wamid.outY'").first();
    assert.deepEqual({ ...y }, { status: 'failed', error_code: '131026' });
    assert.equal((await activity('send_failed')).length, 1);
  } finally { env.ANTHROPIC_API_KEY = 'test-key'; }
});

test('activity log API is owner only, validates filters and pages newest first', async () => {
  const get = (q = '') => activityApi.GET(new Request('https://example.invalid/api/admin/ai-activity' + q));
  globalThis.__salesTest.user = null;
  assert.equal((await get()).status, 403);
  for (const role of ['operations', 'support', 'finance', 'editor']) {
    globalThis.__salesTest.user = { id: 'x', role };
    assert.equal((await get()).status, 403, role);
  }
  globalThis.__salesTest.user = { id: 'owner', role: 'owner' };
  assert.equal((await get('?event=drop_table')).status, 400);
  assert.equal((await get('?from=24-11-2026')).status, 400);
  assert.equal((await get('?conversation=a%27%20OR%201%3D1')).status, 400);
  for (let i = 0; i < 55; i++) await log.logActivity({ event: 'inbound_message', status: 'ok', actor: 'whatsapp', summary: `paging ${i}`, conversationId: 'paging-chat' });
  const first = await (await get('?conversation=paging-chat')).json();
  assert.equal(first.rows.length, 50);
  assert.ok(first.next);
  const second = await (await get('?conversation=paging-chat&before=' + encodeURIComponent(first.next))).json();
  assert.equal(second.rows.length, 5);
  assert.equal(new Set([...first.rows, ...second.rows].map((r) => r.id)).size, 55);
  assert.ok(first.month.calls >= 1);
});

test('a repeated dedupe key logs once and retention purges old rows', async () => {
  await log.logActivity({ event: 'inbound_message', status: 'ok', actor: 'whatsapp', summary: 'once', dedupeKey: 'wa-in:dup' });
  await log.logActivity({ event: 'inbound_message', status: 'ok', actor: 'whatsapp', summary: 'twice', dedupeKey: 'wa-in:dup' });
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM ai_activity_log WHERE dedupe_key='wa-in:dup'").first()).n, 1);
  await db.prepare("INSERT INTO ai_activity_log(id,created_at,event,status,actor,summary) VALUES('old','2020-01-01T00:00:00.000Z','model_call','ok','non','old')").run();
  await log.purgeActivity(new Date());
  assert.equal(await db.prepare("SELECT id FROM ai_activity_log WHERE id='old'").first(), null);
  assert.ok(await db.prepare("SELECT id FROM ai_activity_log WHERE dedupe_key='wa-in:dup'").first());
});
