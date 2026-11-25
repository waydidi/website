import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { migrationStatements } from './helpers/migrations.mjs';
// Sales Intelligence PR 5: lead scoring, follow-ups and lost-quote analysis. Synthetic data only; Telegram is a fake.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const db = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await db.batch(statements.map((s) => db.prepare(s)));
}
const now = new Date().toISOString();
await db.batch([
  db.prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,active,created_at) VALUES('own1','owner','owner@example.invalid','Owner','x','owner',1,?),('ops1','ops','ops@example.invalid','Ops','x','operations',1,?)").bind(now, now),
  db.prepare("INSERT INTO telegram_admins(id,telegram_user_id,display_name,staff_id,enabled,created_at,updated_at) VALUES('a1','111','Owner','own1',1,?,?),('a2','222','Ops','ops1',1,?,?)").bind(now, now, now, now),
]);
globalThis.__pr5 = { env: { DB: db, TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_CHAT_ID: '-100', SALES_AI_QUOTE_APPROVAL: 'web,whatsapp', SALES_AI_LEADS: '1', SALES_AI_FOLLOWUPS: '1' }, user: null };
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, plugins: [{ name: 'pr5-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0pr5-env'; if (id === '@/lib/admin' || id === root + '/lib/admin') return '\0pr5-admin'; },
  load(id) { if (id === '\0pr5-env') return 'export const env=new Proxy({},{get:(_,k)=>globalThis.__pr5.env[k],has:(_,k)=>k in globalThis.__pr5.env})'; if (id === '\0pr5-admin') return 'export async function getWaydidiAdmin(){return globalThis.__pr5.user}'; } }], server: { middlewareMode: true } });
const calls = [];
let tgId = 9000;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url), body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ url: u, body });
  if (u.includes('api.telegram.org')) return Response.json({ ok: true, result: u.endsWith('/answerCallbackQuery') ? true : { message_id: ++tgId, chat: { id: -100 } } });
  return new Response('not found', { status: 404 });
};
after(async () => { globalThis.fetch = realFetch; await vite.close(); await mf.dispose(); delete globalThis.__pr5; });

const R = await vite.ssrLoadModule('/lib/sales-ai/lead-rules.ts');
const leads = await vite.ssrLoadModule('/lib/sales-ai/leads.ts');
const fu = await vite.ssrLoadModule('/lib/sales-ai/followups.ts');
const loss = await vite.ssrLoadModule('/lib/sales-ai/loss.ts');
const drafts = await vite.ssrLoadModule('/lib/sales-ai/quote-drafts.ts');
const qr = await vite.ssrLoadModule('/lib/sales-ai/quote-rules.ts');
const chatStore = await vite.ssrLoadModule('/lib/website-chat.ts');
const api = await vite.ssrLoadModule('/app/api/admin/sales-insights/route.ts');

const future = (days = 6) => new Date(Date.now() + days * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
const priced = (price) => ({ ok: true, kind: 'transfer', summary: 'Hotel → Pattaya', cars: [{ vehicle: 'economy_sedan', name: 'Economy sedan', seats: 3, bags: 2, price, bookUrl: 'x' }], notes: [] });
const leg = (over = {}) => ({ pickup: 'Grand Hotel', dropoff: 'Pattaya Resort', date: future(), time: '10:00', passengers: 2, bags: 2, special: '', ...over });
// The next Bangkok noon: follow-ups are judged at this time (outside quiet hours whatever the real clock says).
const noon = (() => { const d = new Date(Date.now() + 7 * 3600_000); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 12) - 7 * 3600_000; return new Date(t); })();
let n = 0;
async function chat({ channel = 'web', body = 'Hi, price to Pattaya?' } = {}) {
  const id = `p5-${++n}`;
  await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,channel,channel_user_id,public_id) VALUES(?,?,?,?,?,?,?,?)')
    .bind(id, `p5h-${n}`, new Date(Date.now() + 30 * 86400000).toISOString(), now, now, channel, channel === 'web' ? null : `6670000000${n}`, `L${n}`).run();
  await say(id, body);
  return id;
}
async function say(id, body, at = new Date(Date.now() - 60_000).toISOString()) {
  const c = await chatStore.conversationById(id);
  const out = await chatStore.addVisitorMessage(c, body, `p5:${crypto.randomUUID()}`);
  await db.prepare('UPDATE website_chat_messages SET created_at=? WHERE id=?').bind(at, out.id).run();
  return out.id;
}
const owner = { id: 111, first_name: 'Owner' };
/** A quote approved and sent, then moved in time so it was sent `ago` ms before `at`. */
async function sentQuote(id, { price = 1800, sentAt = new Date(noon.getTime() - 2 * 3600_000) } = {}) {
  const ref = {};
  await drafts.draftFromQuote(id, 'web', leg(), priced(price), ref);
  const d = await db.prepare('SELECT revision FROM ai_quote_drafts WHERE bundle_id=?').bind(ref.id).first();
  const out = await drafts.handleQuoteCallback(qr.quoteCallback('ok', ref.id, d.revision), owner, 1);
  assert.equal(out.text, 'Sent to the customer.', out.text);
  await db.prepare('UPDATE ai_quote_drafts SET decided_at=?,quote_expires_at=? WHERE bundle_id=?').bind(sentAt.toISOString(), new Date(sentAt.getTime() + 3 * 3600_000).toISOString(), ref.id).run();
  await db.prepare("UPDATE website_chat_messages SET created_at=? WHERE conversation_id=? AND sender='visitor'").bind(new Date(sentAt.getTime() - 3600_000).toISOString(), id).run();
  return ref.id;
}
const jobs = async (bundle) => (await db.prepare('SELECT * FROM ai_followups WHERE bundle_id=? ORDER BY kind,seq').bind(bundle).all()).results;
const dueNow = (bundle, kind = 'customer', seq = 1) => db.prepare('UPDATE ai_followups SET due_at=? WHERE bundle_id=? AND kind=? AND seq=?').bind(new Date(noon.getTime() - 1000).toISOString(), bundle, kind, seq).run();
const botTexts = async (id) => (await db.prepare('SELECT body FROM website_chat_messages WHERE conversation_id=? AND is_bot=1 ORDER BY rowid').bind(id).all()).results.map((r) => r.body);

test('signals are found in English, Thai and Chinese; scores are capped, deduplicated, banded and decay when quiet', () => {
  assert.deepEqual(R.messageSignals('Can I pay by bank transfer?'), ['payment_question']);
  assert.ok(R.messageSignals('จ่ายยังไงครับ').includes('payment_question'));
  assert.ok(R.messageSignals('太贵了，不用了').includes('declined'));
  assert.ok(R.messageSignals('maybe later, let me think').includes('postponed'));
  assert.deepEqual(R.messageSignals('hello'), []);
  const all = ['specific_date', 'route', 'group_details', 'quote_request', 'payment_question', 'booking_link_request', 'returning_customer', 'intent'];
  assert.equal(R.leadScore(all, new Date().toISOString()).score, 100, 'capped at 100');
  assert.equal(R.leadScore(['payment_question', 'payment_question', 'payment_question'], null).score, 15, 'a repeated signal counts once');
  assert.equal(R.leadScore(['declined'], null).score, 0, 'never below 0');
  const t = Date.parse('2026-12-10T00:00:00Z');
  assert.equal(R.leadScore(['specific_date', 'route', 'quote_request', 'payment_question', 'intent', 'group_details'], '2026-12-01T00:00:00Z', t).score, 70 - (9 - 3) * 3);
  assert.deepEqual([90, 70, 50, 10].map(R.band), ['hot', 'warm', 'interested', 'cold']);
});

test('follow-up rules: hours stay inside 24 hours, quiet hours move to 08:30 Bangkok, and every stop condition wins', () => {
  assert.deepEqual(R.followupHours(undefined), [2, 22]);
  assert.deepEqual(R.followupHours('30,4,4,abc,0'), [4]);
  const late = Date.parse('2026-12-01T15:00:00Z'); // 22:00 Bangkok
  assert.equal(new Date(R.outsideQuietHours(late)).toISOString(), '2026-12-02T01:30:00.000Z');
  assert.equal(R.outsideQuietHours(Date.parse('2026-12-01T05:00:00Z')), Date.parse('2026-12-01T05:00:00Z'));
  const ok = { now: Date.parse('2026-12-01T05:00:00Z'), flagOn: true, channelOff: false, conversationStatus: 'open', assignedName: null, botPaused: false, repliedSinceQuote: false, accepted: false, optedOut: false, declined: false, firstPickupAt: Date.parse('2026-12-05T03:00:00Z'), sentThisWeek: 0, lastSentAt: null, windowOpen: true };
  assert.deepEqual(R.followupDecision(ok), { send: true });
  for (const [change, reason] of [[{ flagOn: false }, /switched off/], [{ accepted: true }, /accepted/], [{ declined: true }, /declined/], [{ optedOut: true }, /not to be contacted/], [{ repliedSinceQuote: true }, /replied/],
    [{ firstPickupAt: 0 }, /passed/], [{ conversationStatus: 'closed' }, /closed/], [{ assignedName: 'Ops' }, /Ops has the chat/], [{ botPaused: true }, /paused/], [{ channelOff: true }, /switched off on this channel/],
    [{ sentThisWeek: 2 }, /weekly/], [{ lastSentAt: Date.parse('2026-12-01T02:00:00Z') }, /less than 6 hours/], [{ now: late }, /quiet/], [{ windowOpen: false }, /no approved template/]])
    assert.match(R.followupDecision({ ...ok, ...change }).reason, reason, JSON.stringify(change));
});

test('loss rules: silence is open, then "no decision", never lost; reasons come only from the customer\'s words', () => {
  const sent = '2026-12-01T00:00:00Z';
  assert.equal(R.quoteOutcome({ anyConverted: false, anyAccepted: false, declined: false, staffLabel: null, sentAt: sent, validUntil: null }, Date.parse('2026-12-03T00:00:00Z')), 'open');
  assert.equal(R.quoteOutcome({ anyConverted: false, anyAccepted: false, declined: false, staffLabel: null, sentAt: sent, validUntil: null }, Date.parse('2026-12-20T00:00:00Z')), 'no_decision');
  assert.equal(R.quoteOutcome({ anyConverted: false, anyAccepted: false, declined: false, staffLabel: 'pricing', sentAt: sent, validUntil: null }), 'declined');
  assert.equal(R.quoteOutcome({ anyConverted: true, anyAccepted: true, declined: true, staffLabel: null, sentAt: sent, validUntil: null }), 'converted');
  assert.deepEqual(R.inferLossReason([{ id: 'm1', body: 'ok' }, { id: 'm2', body: 'sorry, too expensive for us' }]), { reason: 'pricing', evidence: 'm2' });
  assert.equal(R.inferLossReason([{ id: 'm1', body: 'thanks' }]), null);
  const rows = R.summarize([{ group: 'g', outcome: 'converted', totalThb: 1000 }, { group: 'g', outcome: 'open', totalThb: 500 }, { group: 'g', outcome: 'no_decision', totalThb: 700 }]);
  assert.equal(rows[0].closed, 2); assert.equal(rows[0].conversionRate, 0.5); assert.equal(rows[0].enoughData, false); assert.equal(rows[0].wonThb, 1000); assert.equal(rows[0].quotedThb, 2200);
});

test('lead signals are recorded once with evidence, the score can be rebuilt, and a hot lead alerts the owner once', async () => {
  const id = await chat({ body: 'I need a car to Pattaya' });
  await drafts.draftFromQuote(id, 'web', leg(), priced(1800), {}); // date, route, group, quote request: 45
  const evidence = await say(id, 'How do I pay? Bank transfer ok?');
  await say(id, 'And can I pay by card?');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM ai_lead_signals WHERE conversation_id=? AND signal='payment_question'").bind(id).first()).n, 1);
  assert.equal((await db.prepare("SELECT evidence_message_id FROM ai_lead_signals WHERE conversation_id=? AND signal='payment_question'").bind(id).first()).evidence_message_id, evidence);
  let lead = await leads.currentLead(id);
  assert.equal(lead.score, 60); assert.equal(lead.band, 'warm');
  calls.length = 0;
  await say(id, "Great, I'd like to book. Send me the link please"); // intent + booking link: 90
  await Promise.all([leads.rescore(id), leads.rescore(id), leads.rescore(id)]);
  lead = await leads.currentLead(id);
  assert.equal(lead.score, 90); assert.equal(lead.band, 'hot');
  assert.equal(calls.filter((c) => c.url.endsWith('/sendMessage') && /Hot lead/.test(c.body.text)).length, 1, 'alerted once');
  const stored = await db.prepare('SELECT score,reasons_json FROM ai_lead_scores WHERE conversation_id=?').bind(id).first();
  assert.equal(stored.score, 90);
  assert.deepEqual(JSON.parse(stored.reasons_json).sort(), lead.reasons.sort(), 'reproducible from recorded signals');
  await say(id, 'no thanks, not interested anymore');
  const declined = await leads.currentLead(id);
  assert.equal(declined.score, 60, 'an explicit decline takes 30 points off'); assert.equal(declined.band, 'warm');
});

test('with SALES_AI_LEADS off nothing is scored', async () => {
  const env = globalThis.__pr5.env; env.SALES_AI_LEADS = '0'; env.SALES_AI_FOLLOWUPS = '0';
  try {
    const id = await chat({ body: 'How do I pay?' });
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM ai_lead_signals WHERE conversation_id=?').bind(id).first()).n, 0);
    assert.equal(await leads.rescore(id), null);
  } finally { env.SALES_AI_LEADS = '1'; env.SALES_AI_FOLLOWUPS = '1'; }
});

test('a sent quote queues its follow-ups and review; a due follow-up is sent once with the right text', async () => {
  const id = await chat();
  const bundle = await sentQuote(id, { sentAt: new Date(noon.getTime() - 4 * 3600_000) });
  const queued = await jobs(bundle);
  assert.deepEqual(queued.map((j) => `${j.kind}:${j.seq}`), ['customer:1', 'customer:2', 'review:1']);
  await dueNow(bundle);
  await Promise.all([fu.runFollowups(noon), fu.runFollowups(noon)]);
  await fu.runFollowups(noon);
  const texts = (await botTexts(id)).filter((t) => /checking in|reminder/i.test(t));
  assert.equal(texts.length, 1, 'sent once');
  assert.match(texts[0], /checking in about your trip/, 'the 3-hour quote has expired by now: no price, no validity claim');
  assert.doesNotMatch(texts[0], /฿/);
  const after = await jobs(bundle);
  assert.equal(after.filter((j) => j.kind === 'customer' && j.status === 'sent').length, 1);
  assert.ok(after.filter((j) => j.kind === 'customer' && j.status !== 'sent').every((j) => j.status === 'pending' || /less than 6 hours/.test(j.reason ?? '')), 'two due together: only one goes out');
});

test('a reminder names the validity only while the quote is still valid', async () => {
  const id = await chat();
  const bundle = await sentQuote(id, { sentAt: new Date(noon.getTime() - 3600_000) });
  await dueNow(bundle);
  await fu.runFollowups(noon);
  assert.match((await botTexts(id)).at(-1), /valid until/);
});

test('replies, takeover, acceptance, opt-out and the WhatsApp window stop follow-ups at send time', async () => {
  const cases = [
    ['customer replied', async (id) => { await say(id, 'thanks, checking with my family', new Date(noon.getTime() - 60_000).toISOString()); }, 'cancelled', /replied/],
    ['takeover', async (id) => { await db.prepare("UPDATE website_conversations SET assigned_name='Ops',assigned_staff_id='ops1' WHERE id=?").bind(id).run(); }, 'suppressed', /Ops has the chat/],
    ['accepted', async (id, bundle) => { await db.prepare("UPDATE crm_quotes SET status='accepted' WHERE id=(SELECT crm_quote_id FROM ai_quote_drafts WHERE bundle_id=?)").bind(bundle).run(); }, 'cancelled', /accepted/],
    ['opt-out', async (id) => { await say(id, 'STOP', new Date(noon.getTime() - 5 * 3600_000).toISOString()); }, 'cancelled', /not to be contacted/],
  ];
  for (const [name, change, status, reason] of cases) {
    const id = await chat();
    const bundle = await sentQuote(id);
    await change(id, bundle);
    await dueNow(bundle);
    const before = (await botTexts(id)).length;
    await fu.runFollowups(noon);
    const job = (await jobs(bundle))[0];
    assert.equal(job.status, status, name); assert.match(job.reason, reason, name);
    assert.equal((await botTexts(id)).length, before, `${name}: nothing sent`);
  }
  const wa = await chat({ channel: 'whatsapp' });
  const ref = {};
  await drafts.draftFromQuote(wa, 'whatsapp', leg(), priced(1500), ref);
  await db.prepare("UPDATE ai_quote_drafts SET status='sent',decided_at=? WHERE bundle_id=?").bind(new Date(noon.getTime() - 2 * 3600_000).toISOString(), ref.id).run();
  await db.prepare("UPDATE website_chat_messages SET created_at=? WHERE conversation_id=?").bind(new Date(noon.getTime() - 26 * 3600_000).toISOString(), wa).run();
  await fu.scheduleFollowups(ref.id, wa);
  await dueNow(ref.id);
  await fu.runFollowups(noon);
  assert.match((await jobs(ref.id))[0].reason, /no approved template/);
});

test('quiet hours reschedule; an interrupted run is never re-sent; follow-ups off sends nothing', async () => {
  const id = await chat();
  const bundle = await sentQuote(id);
  const night = new Date(noon.getTime() + 10 * 3600_000); // 22:00 Bangkok
  await db.prepare("UPDATE ai_followups SET due_at=? WHERE bundle_id=? AND kind='customer' AND seq=1").bind(new Date(night.getTime() - 1000).toISOString(), bundle).run();
  await fu.runFollowups(night);
  const moved = (await jobs(bundle))[0];
  assert.equal(moved.status, 'pending'); assert.ok(Date.parse(moved.due_at) > night.getTime());
  await db.prepare("UPDATE ai_followups SET status='running',lease_until=? WHERE id=?").bind(new Date(noon.getTime() - 1000).toISOString(), moved.id).run();
  await fu.runFollowups(noon);
  assert.equal((await jobs(bundle))[0].status, 'unknown');
  const other = await chat();
  const b2 = await sentQuote(other);
  await dueNow(b2);
  globalThis.__pr5.env.SALES_AI_FOLLOWUPS = '0';
  try { await fu.runFollowups(noon); } finally { globalThis.__pr5.env.SALES_AI_FOLLOWUPS = '1'; }
  assert.equal((await jobs(b2))[0].status, 'suppressed');
  assert.equal((await botTexts(other)).filter((t) => /checking in|reminder/i.test(t)).length, 0);
});

test('the 7-day review asks the owner for a reason; only the owner can save it', async () => {
  const id = await chat();
  const bundle = await sentQuote(id);
  await dueNow(bundle, 'review');
  calls.length = 0;
  await fu.runFollowups(noon);
  const card = calls.find((c) => c.url.endsWith('/sendMessage') && /No reply for 7 days/.test(c.body.text));
  assert.ok(card);
  const button = card.body.reply_markup.inline_keyboard.flat().find((b) => b.text === 'Price');
  assert.equal(button.callback_data, `sl:${bundle}:0`);
  assert.match((await loss.handleLossCallback(button.callback_data, { id: 222 })).text, /Only the owner/);
  assert.match((await loss.handleLossCallback(button.callback_data, owner)).text, /Saved: Price/);
  assert.equal((await db.prepare('SELECT reason FROM ai_loss_labels WHERE bundle_id=?').bind(bundle).first()).reason, 'pricing');
  assert.match((await loss.handleLossCallback(`sl:${bundle}:9`, owner)).text, /Unknown action/);
});

test('the analysis counts each sent quote once, keeps open quotes open, and explains reasons with evidence', async () => {
  const from = new Date(Date.now() - 400 * 86400000).toISOString(), to = new Date(Date.now() + 86400000).toISOString();
  await db.prepare("DELETE FROM ai_quote_drafts").run();
  const mk = async (sentDaysAgo, price) => { const id = await chat(); const b = await sentQuote(id, { price, sentAt: new Date(Date.now() - sentDaysAgo * 86400000) }); return { id, b }; };
  const booked = await mk(20, 2000), accepted = await mk(20, 1500), open = await mk(1, 1200), silent = await mk(20, 1800), declined = await mk(20, 2500);
  await db.prepare("UPDATE crm_quotes SET status='converted' WHERE id=(SELECT crm_quote_id FROM ai_quote_drafts WHERE bundle_id=?)").bind(booked.b).run();
  await db.prepare("UPDATE crm_quotes SET status='accepted' WHERE id=(SELECT crm_quote_id FROM ai_quote_drafts WHERE bundle_id=?)").bind(accepted.b).run();
  const why = await say(declined.id, 'Sorry, too expensive for us, no thanks', new Date(Date.now() - 19 * 86400000).toISOString());
  await db.prepare("UPDATE ai_lead_signals SET created_at=? WHERE conversation_id=?").bind(new Date(Date.now() - 19 * 86400000).toISOString(), declined.id).run();
  // A superseded revision of another quote is not counted.
  const rev = await chat(); await drafts.draftFromQuote(rev, 'web', leg(), priced(999), {}); await drafts.draftFromQuote(rev, 'web', leg(), priced(1099), {});
  const a = await loss.lossAnalysis(from, to);
  assert.equal(a.total.quotes, 5);
  const by = Object.fromEntries(a.quotes.map((q) => [q.bundleId, q]));
  assert.equal(by[booked.b].outcome, 'converted'); assert.equal(by[accepted.b].outcome, 'accepted'); assert.equal(by[open.b].outcome, 'open');
  assert.equal(by[silent.b].outcome, 'no_decision'); assert.equal(by[silent.b].reason, 'unknown'); assert.equal(by[silent.b].reasonSource, null);
  assert.equal(by[declined.b].outcome, 'declined'); assert.equal(by[declined.b].reason, 'pricing'); assert.equal(by[declined.b].reasonSource, 'inferred'); assert.equal(by[declined.b].evidence, why);
  assert.equal(a.total.closed, 4); assert.equal(a.total.conversionRate, 0.25); assert.equal(a.total.enoughData, false);
  assert.equal(a.wonThb, 2000); assert.equal(a.notWonThb, 1800 + 2500);
  await loss.setLossLabel(silent.b, 'competitor', { name: 'Owner', staffId: 'own1' });
  const b = await loss.lossAnalysis(from, to);
  const s = b.quotes.find((q) => q.bundleId === silent.b);
  assert.equal(s.reason, 'competitor'); assert.equal(s.reasonSource, 'staff'); assert.equal(s.outcome, 'declined', 'a staff label closes it');
  const csv = loss.factsCsv(await loss.quoteFacts(from, to));
  assert.equal(csv.split('\r\n').length, 6);
  assert.doesNotMatch(csv, /\+66|6670000000/, 'no contact details in the export');
});

test('sales insights API is owner only and validates input; there is no scheduled sales report', async () => {
  const get = (q = '') => api.GET(new Request('https://example.invalid/api/admin/sales-insights' + q));
  for (const user of [null, { id: 'ops1', role: 'operations' }, { id: 's', role: 'support' }, { id: 'f', role: 'finance' }]) { globalThis.__pr5.user = user; assert.equal((await get()).status, 403); }
  globalThis.__pr5.user = { id: 'own1', role: 'owner', displayName: 'Owner' };
  assert.equal((await get('?from=2026-13-01')).status, 400);
  assert.equal((await get('?from=2024-01-01&to=2026-01-01')).status, 400, 'at most one year');
  assert.equal((await get()).status, 200);
  assert.equal((await get('?view=leads')).status, 200);
  const csv = await get('?format=csv'); assert.match(csv.headers.get('content-type'), /text\/csv/);
  const post = (body, origin = 'https://example.invalid') => api.POST(new Request('https://example.invalid/api/admin/sales-insights', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await post({ bundleId: 'x', reason: 'pricing' })).status, 400);
  assert.equal((await post({ bundleId: 'a'.repeat(16), reason: 'pricing' }, 'https://evil.example')).status, 403);
  globalThis.__pr5.user = null;
  const { allowedStaffRoute } = await vite.ssrLoadModule('/lib/staff-security.ts');
  for (const role of ['operations', 'support', 'finance', 'editor']) assert.equal(allowedStaffRoute(role, '/admin/sales-insights', 'GET'), false);
  const worker = await readFile(root + '/worker/index.ts', 'utf8');
  assert.doesNotMatch(worker, /daily.?sales|sales.?report|lossAnalysis|sales-insights/i, 'no scheduled sales report');
});
