import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { migrationStatements } from './helpers/migrations.mjs';
// Sales Intelligence PR 6: the 3-day quote reminder as an approved WhatsApp template, only after the customer's YES.
// Synthetic data only; WhatsApp and Telegram are fakes.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const db = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await db.batch(statements.map((s) => db.prepare(s)));
}
const now = new Date().toISOString();
await db.batch([
  db.prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,active,created_at) VALUES('own1','owner','owner@example.invalid','Owner','x','owner',1,?)").bind(now),
  db.prepare("INSERT INTO telegram_admins(id,telegram_user_id,display_name,staff_id,enabled,created_at,updated_at) VALUES('a1','111','Owner','own1',1,?,?)").bind(now, now),
]);
const SECRET = 'wa-secret';
const ENV = { DB: db, TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_CHAT_ID: '-100', WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: 'verify',
  SALES_AI_QUOTE_APPROVAL: 'whatsapp,web', SALES_AI_TEMPLATE_FOLLOWUPS: '1', WHATSAPP_TEMPLATE_QUOTE_REMINDER: 'quote_reminder', WHATSAPP_TEMPLATE_LANGUAGES: 'en:en_US,th:th,zh:zh_CN' };
globalThis.__pr6 = { env: { ...ENV } };
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, plugins: [{ name: 'pr6-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0pr6-env'; },
  load(id) { if (id === '\0pr6-env') return 'export const env=new Proxy({},{get:(_,k)=>globalThis.__pr6.env[k],has:(_,k)=>k in globalThis.__pr6.env})'; } }], server: { middlewareMode: true } });
const calls = [];
let tgId = 11000, templateError = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url), body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ url: u, body });
  if (u.includes('api.telegram.org')) return Response.json({ ok: true, result: u.endsWith('/answerCallbackQuery') ? true : { message_id: ++tgId, chat: { id: -100 } } });
  if (u.includes('graph.facebook.com') && body?.type === 'template' && templateError) return Response.json({ error: templateError }, { status: 400 });
  if (u.includes('graph.facebook.com')) return Response.json({ messages: [{ id: `wamid.out${calls.length}` }] });
  return new Response('not found', { status: 404 });
};
after(async () => { globalThis.fetch = realFetch; await vite.close(); await mf.dispose(); delete globalThis.__pr6; });

const R = await vite.ssrLoadModule('/lib/sales-ai/reminder-rules.ts');
const rem = await vite.ssrLoadModule('/lib/sales-ai/reminders.ts');
const drafts = await vite.ssrLoadModule('/lib/sales-ai/quote-drafts.ts');
const qr = await vite.ssrLoadModule('/lib/sales-ai/quote-rules.ts');
const chatStore = await vite.ssrLoadModule('/lib/website-chat.ts');
const webhook = await vite.ssrLoadModule('/app/api/integrations/whatsapp/webhook/route.ts');

const future = (days = 8) => new Date(Date.now() + days * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
const priced = { ok: true, kind: 'transfer', summary: 'Hotel → Pattaya', cars: [{ vehicle: 'economy_sedan', name: 'Economy sedan', seats: 3, bags: 2, price: 1800, bookUrl: 'x' }], notes: [] };
const leg = { pickup: 'Grand Hotel', dropoff: 'Pattaya Resort', date: future(), time: '10:00', passengers: 2, bags: 2, special: '' };
const noon = (days) => { const d = new Date(Date.now() + 7 * 3600_000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, 12) - 7 * 3600_000); };
let n = 0;
async function chat(channel = 'whatsapp', first = 'Hi, price to Pattaya please') {
  const id = `p6-${++n}`;
  await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,channel,channel_user_id,public_id) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id, `p6h-${n}`, new Date(Date.now() + 30 * 86400000).toISOString(), now, now, channel, channel === 'web' ? null : `6660000000${n}`, `R${n}`).run();
  await say(id, first);
  return id;
}
async function say(id, body) { const c = await chatStore.conversationById(id); return (await chatStore.addVisitorMessage(c, body, `p6:${crypto.randomUUID()}`)).id; }
async function sendQuote(id, channel = 'whatsapp') {
  const ref = {};
  await drafts.draftFromQuote(id, channel, leg, priced, ref);
  const d = await db.prepare('SELECT revision FROM ai_quote_drafts WHERE bundle_id=?').bind(ref.id).first();
  assert.equal((await drafts.handleQuoteCallback(qr.quoteCallback('ok', ref.id, d.revision), { id: 111 }, 1)).text, 'Sent to the customer.');
  return ref.id;
}
const reminder = (bundle) => db.prepare('SELECT * FROM ai_template_reminders WHERE bundle_id=?').bind(bundle).first();
const templateSends = () => calls.filter((c) => c.url.includes('graph.facebook.com') && c.body?.type === 'template');
const dueAtNoon = (bundle) => db.prepare('UPDATE ai_template_reminders SET due_at=? WHERE bundle_id=?').bind(new Date(noon(4).getTime() - 1000).toISOString(), bundle).run();

test('only a clear YES is consent; language codes and template names are checked', () => {
  for (const yes of ['YES', 'yes please', 'Yes!', 'ok yes', 'ใช่ครับ', 'ได้ค่ะ', '好的', '是', 'yes 👍']) assert.equal(R.isReminderYes(yes), true, yes);
  for (const no of ['yes but how much?', 'no', 'yesterday', 'Is it yes or no?', '', 'YES I want to book now']) assert.equal(R.isReminderYes(no), false, no);
  assert.equal(R.templateLanguage('th', 'en:en_US,th:th'), 'th');
  assert.equal(R.templateLanguage('zh', 'en:en_US'), 'zh_CN');
  assert.equal(R.templateLanguage('en', 'en:en_US,th:bad code'), 'en_US');
  assert.equal(R.validTemplateName('quote_reminder'), true);
  assert.equal(R.validTemplateName('Quote Reminder!'), false);
  const ok = { now: 1, flagOn: true, templateName: 'quote_reminder', templateState: 'APPROVED', accepted: false, optedOut: false, declined: false, repliedSinceConsent: false, assignedName: null, channelOff: false, firstPickupAt: 10, sentThisWeek: 0, quiet: false };
  assert.deepEqual(R.reminderDecision(ok), { send: true });
  for (const [change, reason] of [[{ flagOn: false }, /switched off/], [{ templateName: null }, /no approved template/], [{ templateState: 'REJECTED' }, /rejected/], [{ templateState: 'PAUSED' }, /paused/],
    [{ accepted: true }, /accepted/], [{ declined: true }, /declined/], [{ optedOut: true }, /not to be contacted/], [{ repliedSinceConsent: true }, /wrote again/], [{ firstPickupAt: 0 }, /passed/],
    [{ assignedName: 'Ops' }, /Ops has the chat/], [{ channelOff: true }, /switched off on WhatsApp/], [{ sentThisWeek: 1 }, /already sent/], [{ quiet: true }, /quiet/]])
    assert.match(R.reminderDecision({ ...ok, ...change }).reason, reason, JSON.stringify(change));
});

test('the WhatsApp quote message asks for consent only when a reminder can really be sent', async () => {
  const wa = await chat();
  await sendQuote(wa);
  const msg = async (id) => (await db.prepare('SELECT body FROM website_chat_messages WHERE conversation_id=? AND is_bot=1 ORDER BY rowid DESC LIMIT 1').bind(id).first()).body;
  assert.match(await msg(wa), /reminder about this trip in 3 days\? Reply YES\./);
  const web = await chat('web');
  await sendQuote(web, 'web');
  assert.doesNotMatch(await msg(web), /Reply YES/, 'website chats are not offered a WhatsApp reminder');
  globalThis.__pr6.env.WHATSAPP_TEMPLATE_QUOTE_REMINDER = '';
  try { const off = await chat(); await sendQuote(off); assert.doesNotMatch(await msg(off), /Reply YES/, 'no template configured: no offer'); }
  finally { globalThis.__pr6.env.WHATSAPP_TEMPLATE_QUOTE_REMINDER = 'quote_reminder'; }
});

test('a YES within 24 hours queues one reminder 3 days after the quote; other replies queue nothing', async () => {
  const id = await chat();
  const bundle = await sendQuote(id);
  assert.equal(await reminder(bundle), null);
  await say(id, 'yes but how much is the bigger car?');
  assert.equal(await reminder(bundle), null);
  const yes = await say(id, 'YES');
  await say(id, 'yes');
  const r = await reminder(bundle);
  assert.equal(r.status, 'pending'); assert.equal(r.consent_message_id, yes, 'the YES is kept as evidence');
  const sentAt = Date.parse((await db.prepare('SELECT decided_at FROM ai_quote_drafts WHERE bundle_id=?').bind(bundle).first()).decided_at);
  assert.ok(Date.parse(r.due_at) >= sentAt + 3 * 86400000 && Date.parse(r.due_at) < sentAt + 3 * 86400000 + 12 * 3600_000);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM ai_template_reminders WHERE conversation_id=?').bind(id).first()).n, 1);
  const late = await chat();
  const old = await sendQuote(late);
  await db.prepare('UPDATE ai_quote_drafts SET decided_at=? WHERE bundle_id=?').bind(new Date(Date.now() - 25 * 3600_000).toISOString(), old).run();
  await say(late, 'YES');
  assert.equal(await reminder(old), null, 'too late to consent to this quote');
  globalThis.__pr6.env.SALES_AI_TEMPLATE_FOLLOWUPS = '0';
  try { const offChat = await chat(); const b = await sendQuote(offChat); await say(offChat, 'YES'); assert.equal(await reminder(b), null); }
  finally { globalThis.__pr6.env.SALES_AI_TEMPLATE_FOLLOWUPS = '1'; }
});

test('a due reminder is sent once as the template in the customer\'s language and recorded in the chat', async () => {
  const id = await chat('whatsapp', 'สวัสดีครับ ขอราคาไปพัทยา');
  const bundle = await sendQuote(id);
  await say(id, 'ใช่ครับ');
  await dueAtNoon(bundle);
  calls.length = 0;
  await Promise.all([rem.runTemplateReminders(noon(4)), rem.runTemplateReminders(noon(4))]);
  await rem.runTemplateReminders(noon(4));
  const sends = templateSends();
  assert.equal(sends.length, 1, 'sent once');
  assert.deepEqual(sends[0].body.template, { name: 'quote_reminder', language: { code: 'th' }, components: [{ type: 'body', parameters: [{ type: 'text', text: leg.date }] }] });
  assert.equal(sends[0].body.to, `6660000000${n}`);
  const r = await reminder(bundle);
  assert.equal(r.status, 'sent'); assert.match(r.channel_message_id, /^wamid\.out/);
  const recorded = await db.prepare('SELECT body,channel_message_id FROM website_chat_messages WHERE conversation_id=? AND is_bot=1 ORDER BY rowid DESC LIMIT 1').bind(id).first();
  assert.match(recorded.body, /ใบเสนอราคา/); assert.equal(recorded.channel_message_id, r.channel_message_id);
  assert.equal(calls.filter((c) => c.url.includes('graph.facebook.com') && c.body?.type === 'text').length, 0, 'no free-form message outside the window');
});

test('a reply, STOP, acceptance, takeover or quiet hours stop or delay the reminder at send time', async () => {
  const cases = [
    ['wrote again', async (id) => { await say(id, 'Actually can you also quote a return trip?'); }, 'cancelled', /wrote again/],
    ['STOP', async (id) => { await say(id, 'STOP'); }, 'cancelled', /not to be contacted|wrote again/],
    ['accepted', async (id, b) => { await db.prepare("UPDATE crm_quotes SET status='accepted' WHERE id=(SELECT crm_quote_id FROM ai_quote_drafts WHERE bundle_id=?)").bind(b).run(); }, 'cancelled', /accepted/],
    ['takeover', async (id) => { await db.prepare("UPDATE website_conversations SET assigned_name='Ops',assigned_staff_id='own1' WHERE id=?").bind(id).run(); }, 'suppressed', /Ops has the chat/],
  ];
  for (const [name, change, status, reason] of cases) {
    const id = await chat();
    const b = await sendQuote(id);
    await say(id, 'YES');
    await change(id, b);
    await dueAtNoon(b);
    calls.length = 0;
    await rem.runTemplateReminders(noon(4));
    const r = await reminder(b);
    assert.equal(r.status, status, name); assert.match(r.reason, reason, name);
    assert.equal(templateSends().length, 0, `${name}: nothing sent`);
  }
  const id = await chat();
  const b = await sendQuote(id);
  await say(id, 'YES');
  const night = new Date(noon(4).getTime() + 10 * 3600_000);
  await db.prepare('UPDATE ai_template_reminders SET due_at=? WHERE bundle_id=?').bind(new Date(night.getTime() - 1000).toISOString(), b).run();
  await rem.runTemplateReminders(night);
  const r = await reminder(b);
  assert.equal(r.status, 'pending'); assert.ok(Date.parse(r.due_at) > night.getTime(), 'moved to 08:30 Bangkok');
});

test('a template Meta rejected or paused is never used, and a send error is recorded, not retried', async () => {
  const id = await chat();
  const b = await sendQuote(id);
  await say(id, 'YES');
  const raw = JSON.stringify({ entry: [{ changes: [{ field: 'message_template_status_update', value: { event: 'REJECTED', message_template_name: 'quote_reminder', message_template_language: 'en_US', reason: 'INCORRECT_CATEGORY' } }] }] });
  const res = await webhook.POST(new Request('https://example.invalid/api/integrations/whatsapp/webhook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', SECRET).update(raw).digest('hex') } }));
  assert.equal(res.status, 200);
  assert.equal((await db.prepare("SELECT status FROM ai_whatsapp_templates WHERE name='quote_reminder' AND language='en_US'").first()).status, 'REJECTED');
  await dueAtNoon(b);
  calls.length = 0;
  await rem.runTemplateReminders(noon(4));
  assert.match((await reminder(b)).reason, /rejected/);
  assert.equal(templateSends().length, 0);
  await db.prepare("DELETE FROM ai_whatsapp_templates").run();
  const id2 = await chat();
  const b2 = await sendQuote(id2);
  await say(id2, 'YES');
  await dueAtNoon(b2);
  templateError = { code: 132001, message: 'Template name does not exist in the translation' };
  try { await rem.runTemplateReminders(noon(4)); await rem.runTemplateReminders(noon(4)); } finally { templateError = null; }
  const r2 = await reminder(b2);
  assert.equal(r2.status, 'suppressed'); assert.match(r2.reason, /132001/);
  assert.equal(templateSends().length, 1, 'tried once, never retried');
});

test('an interrupted send is marked unknown and never repeated', async () => {
  const id = await chat();
  const b = await sendQuote(id);
  await say(id, 'YES');
  await db.prepare("UPDATE ai_template_reminders SET status='running',lease_until=? WHERE bundle_id=?").bind(new Date(noon(4).getTime() - 1000).toISOString(), b).run();
  calls.length = 0;
  await rem.runTemplateReminders(noon(4));
  assert.equal((await reminder(b)).status, 'unknown');
  assert.equal(templateSends().length, 0);
});
