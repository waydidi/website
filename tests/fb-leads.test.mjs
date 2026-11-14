import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
// Facebook group leads end to end on an in-memory D1: the ingest endpoint (off switch, token), queueing without
// duplicates, drafting within the daily limit, the two Comment-group messages, retries, and Posted / Skip races.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const db = await mf.getD1Database('DB');
const TOKEN = 't'.repeat(40);
const env = { DB: db, TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: '-100', TELEGRAM_COMMENT_CHAT_ID: '-200', FB_LEADS_ENABLED: 'true', FB_LEADS_INGEST_TOKEN: TOKEN };
globalThis.__flTest = { env };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'fl-env', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers') return '\0fl-env'; if (id === '@/lib/cee/quotes' || id.endsWith('/lib/cee/quotes')) return '\0fl-quotes'; }, load(id) { if (id === '\0fl-env') return 'export const env=globalThis.__flTest.env'; if (id === '\0fl-quotes') return 'export async function quoteTransfer(){return {ok:false,reason:"x",handover:false}}'; } }], server: { middlewareMode: true } });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__flTest; });
const fl = await vite.ssrLoadModule('/lib/telegram/fb-leads.ts');
const route = await vite.ssrLoadModule('/app/api/integrations/fb-leads/route.ts');
const replyRoute = await vite.ssrLoadModule('/app/api/integrations/fb-leads/reply/route.ts');

// Telegram calls (answerCallbackQuery, editMessageText) are recorded, never sent.
const tgCalls = [];
globalThis.fetch = async (url, init) => { tgCalls.push({ method: String(url).split('/').pop(), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { headers: { 'content-type': 'application/json' } }); };

const now = new Date('2026-11-06T05:00:00Z');
const post = (n, over = {}) => ({ url: `https://www.facebook.com/groups/thaitravel/posts/${1000000 + n}/`, text: `Need a driver from BKK airport to Pattaya #${n}`, groupName: 'Thai Travel', ...over });
const ingest = (body, token = TOKEN) => route.POST(new Request('https://waydidi.com/api/integrations/fb-leads', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const draftOf = (over = {}) => async (text) => ({ id: 'd' + text.length, text, parts: ['Take the train &amp; then a taxi <3', '<b>Check before posting</b>'], keyboard: [[{ text: '🔄 Search again', callback_data: 'ph_again:d1' }]], replyType: 'sales', factCount: 2, stale: false, ...over });
function sender() { const sent = []; let id = 100; return { sent, send: async (chat, text, keyboard) => { sent.push({ chat, text, keyboard }); return { message_id: ++id, chat: { id: Number(chat) } }; } }; }
const lead = (n) => db.prepare("SELECT * FROM fb_leads WHERE post_key=?").bind(String(1000000 + n)).first();

beforeEach(async () => { await fl.ensureLeadTables(); await db.prepare('DELETE FROM fb_leads').run(); tgCalls.length = 0; env.FB_LEADS_ENABLED = 'true'; delete env.FB_LEADS_DAILY_LIMIT; delete env.FB_LEADS_REPLY_QUEUE_ENABLED; delete env.FB_LEADS_REPLY_DAILY_CAP; delete env.FB_LEADS_REPLY_GAP_MIN; delete env.FB_LEADS_AUTO_POST_ENABLED; });

test('ingest: not found while off, 401 without the right token, 400 for a bad body', async () => {
  env.FB_LEADS_ENABLED = '';
  assert.equal((await ingest({ posts: [post(1)] })).status, 404);
  env.FB_LEADS_ENABLED = 'true';
  assert.equal((await ingest({ posts: [post(1)] }, 'wrong')).status, 401);
  assert.equal((await ingest({ posts: [post(1)] }, TOKEN + 'x')).status, 401);
  assert.equal((await route.POST(new Request('https://waydidi.com/api/integrations/fb-leads', { method: 'POST', body: '{}' }))).status, 401, 'no token');
  assert.equal((await ingest({ nope: 1 })).status, 400);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM fb_leads').first()).n, 0, 'nothing queued by a refused request');
});

test('ingest: posts are queued once; sending the same post again (or twice at once) is ignored', async () => {
  const res = await ingest({ posts: [post(1), post(2), { url: 'https://example.com/', text: 'hi there' }] });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { accepted: 2, duplicates: 0, skipped: 0, rejected: [{ index: 2, reason: 'Not a Facebook group post link.' }] });
  const [a, b] = await Promise.all([ingest({ posts: [post(1), post(3)] }), ingest({ posts: [post(3)] })]);
  const total = [(await a.json()), (await b.json())].reduce((s, x) => s + x.accepted, 0);
  assert.equal(total, 1, 'post 3 queued exactly once');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM fb_leads').first()).n, 3);
  const row = await lead(1);
  assert.equal(row.status, 'queued'); assert.equal(row.group_name, 'Thai Travel'); assert.match(row.id, /^[a-f0-9]{16}$/);
});

test('a lead is drafted and sent as two messages: the comment alone, then group, link, checks and Posted / Skip', async () => {
  await fl.queueLeads([{ groupKey: 'thaitravel', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'Thai <Travel>' }], now);
  const s = sender();
  assert.deepEqual(await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now }), { drafted: 1, sent: 1 });
  assert.equal(s.sent.length, 2);
  assert.equal(s.sent[0].chat, '-200');
  assert.equal(s.sent[0].text, 'Take the train &amp; then a taxi &lt;3', 'the comment alone, escaped once');
  assert.equal(s.sent[0].keyboard, undefined);
  assert.match(s.sent[1].text, /📌 <b>Thai &lt;Travel&gt;<\/b>\nhttps:\/\/www\.facebook\.com\/groups\/thaitravel\/posts\/1000001\//);
  assert.doesNotMatch(s.sent[1].text, /Needs your check/);
  const row = await lead(1);
  // Only two buttons, without emoji (owner's choice): no Open post, Search again or Wrong or outdated.
  assert.deepEqual(s.sent[1].keyboard, [[{ text: 'Posted', callback_data: `fl_posted:${row.id}` }, { text: 'Skip', callback_data: `fl_skip:${row.id}` }]]);
  assert.equal(row.status, 'sent'); assert.equal(row.comment_message_id, 101); assert.equal(row.link_message_id, 102);
  assert.deepEqual(await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now }), { drafted: 0, sent: 0 }, 'nothing sent twice');
});

test('posts that ask for nothing, adverts and long-stay searches are kept out of the AI queue and cost nothing',async()=>{
  const res=await ingest({posts:[post(1),post(2,{text:'Beautiful sunset at Kata beach today, so happy'}),post(3,{text:'ที่ไหนดีคะ ไปเกาะช้างช่วงปีใหม่'}),post(4,{text:'Book now! Special price private van to Pattaya, contact us'}),post(5,{text:'Looking for a condo to rent for 3 months in Phuket'})]});
  assert.deepEqual(await res.json(),{accepted:5,duplicates:0,skipped:3,rejected:[]});
  const st=[];for(const n of [1,2,3,4,5])st.push((await lead(n)).status);
  assert.deepEqual(st,['queued','not_lead','queued','not_lead','not_lead']);
  let calls=0;await fl.processLeads({draft:async(t)=>{calls++;return draftOf()(t);},send:sender().send,now:()=>now,batch:5});
  assert.equal(calls,2,'the photo caption, the advert and the long-stay search are never drafted');
});

test('a booking request drafted without a web search is ready to post (no "Needs your check")', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now);
  const s = sender();
  await fl.processLeads({ draft: draftOf({ factCount: 0, searched: false }), send: s.send, now: () => now });
  assert.doesNotMatch(s.sent[1].text, /Needs your check/);
  assert.equal((await lead(1)).reliable, 1);
});

test('not ready: no checked facts → sent with "Needs your check"; social post → no message', async () => {
  await fl.queueLeads([1, 2].map((n) => ({ groupKey: 'thaitravel', postKey: String(1000000 + n), url: post(n).url, text: post(n).text, groupName: 'G' })), now);
  const s = sender();
  let i = 0;
  const draft = async (text) => draftOf(i++ === 0 ? { factCount: 0 } : { replyType: 'social' })(text);
  await fl.processLeads({ draft, send: s.send, now: () => now });
  assert.equal(s.sent.length, 2, 'only the first post is sent');
  assert.match(s.sent[1].text, /⚠️ Not ready to post: no fact passed the source checks$/);
  assert.doesNotMatch(s.sent[1].text, /Check the facts yourself/, 'only the short reason, not the whole note');
  assert.equal((await lead(1)).reliable, 0);
  assert.equal((await lead(2)).status, 'not_lead');
});

test('daily limit (Thailand day) and off switch stop drafting', async () => {
  env.FB_LEADS_DAILY_LIMIT = '2';
  await fl.queueLeads([1, 2, 3].map((n) => ({ groupKey: 'g', postKey: String(1000000 + n), url: post(n).url, text: post(n).text, groupName: 'G' })), now);
  const s = sender();
  let calls = 0; const draft = async (t) => { calls++; return draftOf()(t); };
  await fl.processLeads({ draft, send: s.send, now: () => now, batch: 5 });
  assert.equal(calls, 2);
  await fl.processLeads({ draft, send: s.send, now: () => now, batch: 5 });
  assert.equal(calls, 2, 'still the same Thailand day');
  await fl.processLeads({ draft, send: s.send, now: () => new Date('2026-11-06T17:01:00Z'), batch: 5 });
  assert.equal(calls, 3, 'a new day after midnight Bangkok time');
  env.FB_LEADS_ENABLED = 'false';
  await fl.queueLeads([{ groupKey: 'g', postKey: '2000000', url: post(9).url, text: 'x y z', groupName: 'G' }], now);
  assert.deepEqual(await fl.processLeads({ draft, send: s.send, now: () => now }), { drafted: 0, sent: 0 });
});

test('two runs at once draft each post once and cannot pass the limit', async () => {
  env.FB_LEADS_DAILY_LIMIT = '3';
  await fl.queueLeads([1, 2, 3, 4, 5].map((n) => ({ groupKey: 'g', postKey: String(1000000 + n), url: post(n).url, text: post(n).text, groupName: 'G' })), now);
  const s = sender(); const seen = [];
  const draft = async (t) => { seen.push(t); await new Promise((r) => setTimeout(r, 5)); return draftOf()(t); };
  await Promise.all([fl.processLeads({ draft, send: s.send, now: () => now, batch: 5 }), fl.processLeads({ draft, send: s.send, now: () => now, batch: 5 })]);
  assert.equal(seen.length, 3); assert.equal(new Set(seen).size, 3);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM fb_leads WHERE status='sent'").first()).n, 3);
});

test('retries: a failed draft is retried then marked failed; a failed send is resumed without repeating the comment', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now);
  const s = sender();
  const broken = async () => { throw new Error('model down'); };
  for (let k = 0; k < 3; k++) await fl.processLeads({ draft: broken, send: s.send, now: () => now });
  assert.deepEqual([(await lead(1)).status, (await lead(1)).attempts], ['failed', 3]);
  const notes = s.sent.filter((m) => m.text.startsWith('⚠️ Couldn'));
  assert.equal(notes.length, 1, 'the team is told once, after the last try');
  assert.ok(notes[0].text.includes('<b>G</b>')); assert.doesNotMatch(notes[0].text, /Need a driver/, 'never the post text');
  // Sending the failed post in again queues it again (and only a failed one).
  assert.deepEqual(await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now), { accepted: 1, duplicates: 0, skipped: 0 });
  assert.equal((await lead(1)).status, 'queued');
  assert.deepEqual(await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now), { accepted: 0, duplicates: 1, skipped: 0 }, 'a queued post is not queued twice');
  await db.prepare("UPDATE fb_leads SET status='failed',attempts=3 WHERE post_key='1000001'").run();

  await fl.queueLeads([{ groupKey: 'g', postKey: '1000002', url: post(2).url, text: post(2).text, groupName: 'G' }], now);
  let n = 0; const flaky = async (chat, text, kb) => { if (++n === 2) throw new Error('telegram down'); return s.send(chat, text, kb); };
  await fl.processLeads({ draft: draftOf(), send: flaky, now: () => now });
  assert.equal((await lead(2)).status, 'drafted');
  await fl.processLeads({ draft: async () => { throw new Error('must not redraft'); }, send: flaky, now: () => now });
  assert.equal((await lead(2)).status, 'sent');
  assert.equal(s.sent.filter((m) => m.text.startsWith('Take the train')).length, 1, 'the comment was sent once');

  // A draft stopped half-way (Worker stopped) goes back to the queue after 10 minutes.
  await db.prepare("UPDATE fb_leads SET status='drafting',attempts=1,updated_at=? WHERE post_key='1000001'").bind(new Date(now.getTime() - 11 * 60000).toISOString()).run();
  await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now });
  assert.equal((await lead(1)).status, 'sent');
});

test('Posted / Skip: the first tap wins, a second tap is told who marked it, the message shows it', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now);
  await fl.processLeads({ draft: draftOf(), send: sender().send, now: () => now });
  const id = (await lead(1)).id;
  await Promise.all([
    fl.handleLeadCallback('posted', id, { name: 'Anna', telegramUserId: '7' }, 'q1', '-200', 102, now),
    fl.handleLeadCallback('skipped', id, { name: 'Ben', telegramUserId: '8' }, 'q2', '-200', 102, now),
  ]);
  const row = await lead(1);
  assert.ok(['posted', 'skipped'].includes(row.status));
  const answers = tgCalls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text);
  assert.equal(answers.filter((t) => /^Already marked/.test(t)).length, 1, 'exactly one tap loses');
  const edit = tgCalls.find((c) => c.method === 'editMessageText');
  assert.match(edit.body.text, new RegExp(`${row.status === 'posted' ? '✅ Posted' : '⏭ Skipped'}</b> by ${row.marked_by} · 06/11/2026 12:00`));
  assert.ok(!JSON.stringify(edit.body.reply_markup).includes('fl_posted'), 'the Posted / Skip buttons are removed');
  tgCalls.length = 0;
  await fl.handleLeadCallback('posted', 'ffffffffffffffff', { name: 'Anna', telegramUserId: '7' }, 'q3', '-200', 1, now);
  assert.match(tgCalls[0].body.text, /not found/);
});

test('privacy: post text and comments are cleared after 90 days, the counts stay', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], new Date('2026-07-01T00:00:00Z'));
  await fl.purgeOldLeads(now);
  const row = await lead(1);
  assert.equal(row.post_text, ''); assert.equal(row.comment, null); assert.equal(row.status, 'failed', 'a post still waiting is closed');
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000002', url: post(2).url, text: post(2).text, groupName: 'G' }], now);
  await fl.purgeOldLeads(now);
  assert.equal((await lead(2)).post_text, post(2).text, 'recent posts are kept');
});

test('the link message shows only the group, the post link and "Check before posting · type" (owner choice)', async () => {
  await fl.queueLeads([{ groupKey: 'kohchangcommunity', postKey: '1754083255681086', url: 'https://www.facebook.com/groups/kohchangcommunity/posts/1754083255681086/', text: 'Which beach is best for kids on Koh Chang?', groupName: 'Koh Chang Community' }], now);
  const s = sender();
  const full = '<b>Check before posting</b> · Information only\n\n🔎 Fresh search · Source from 06/11/2026\n✅ Up to date: searched just now.\n\n<b>Sources</b>\n🏛 official tat.or.th · 01/11/2026\nhttps://www.tat.or.th/x\n\n<i>Draft only: nothing was posted. Post it yourself.</i>';
  await fl.processLeads({ draft: draftOf({ replyType: 'info', parts: ['Kai Bae is calm for kids.', full] }), send: s.send, now: () => now });
  assert.equal(s.sent[1].text, '📌 <b>Koh Chang Community</b>\nhttps://www.facebook.com/groups/kohchangcommunity/posts/1754083255681086/\n\n<b>Check before posting</b> · Information only');
  assert.ok(s.sent[1].keyboard.flat().some((b) => b.callback_data?.startsWith('fl_posted:')), 'the buttons stay');
});

test('a post the AI sorter flags as an advert is closed with no message', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now);
  const s = sender();
  await fl.processLeads({ draft: draftOf({ replyType: 'info', advert: true, parts: [] }), send: s.send, now: () => now });
  assert.equal(s.sent.length, 0);
  assert.deepEqual([(await lead(1)).status, (await lead(1)).reply_type], ['not_lead', 'advert']);
});

test('skip reasons are stored: the word rules, what the extension saw on the page, and the AI sorter', async () => {
  const res = await ingest({ posts: [
    post(1, { text: 'GIVEAWAY! Win a free island tour, tag a friend' }),
    post(2, { text: 'Comment YES if you love Thailand' }),
    post(3, { text: 'Earn $300 per day, work from home, bit.ly/xyz' }),
    post(4, { text: 'UPDATE: booked, thanks everyone for the driver tips' }),
    post(5, { text: 'Group rules: no selling, be kind' }),
    post(6, { text: 'Looking for a flatmate in Chiang Mai, 2 bedroom' }),
    post(7, { text: 'Need a driver from Trat airport tomorrow', skip: 'commenting_disabled' }),
    post(8, { text: 'Which ferry is best to Koh Chang?', skip: 'already_engaged' }),
    post(9, { text: 'Which beach is best for kids on Koh Chang?', skip: 'something_else' }),
  ] });
  assert.deepEqual(await res.json(), { accepted: 9, duplicates: 0, skipped: 8, rejected: [] });
  const reasons = [];
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) { const row = await lead(n); reasons.push(row.status === 'queued' ? 'queued' : row.skip_reason); }
  assert.deepEqual(reasons, ['giveaway', 'bait', 'spam', 'solved', 'admin_post', 'not_served', 'commenting_disabled', 'already_engaged', 'queued'], 'an unknown skip value from a collector is ignored');
  // The AI sorter's verdict is stored too, and gets no message.
  const s = sender();
  await fl.processLeads({ draft: draftOf({ replyType: 'info', postType: 'news', skipReason: 'news', parts: [] }), send: s.send, now: () => now });
  assert.equal(s.sent.length, 0);
  assert.deepEqual([(await lead(9)).status, (await lead(9)).skip_reason], ['not_lead', 'news']);
});

test('the same question copied into another group within 7 days is collected once (cross_posted)', async () => {
  const text = 'Looking for a private driver from Bangkok airport to Hua Hin on 12 Dec for 4 people';
  await fl.queueLeads([{ groupKey: 'g1', postKey: '1000001', url: post(1).url, text, groupName: 'G1' }], now);
  const second = await fl.queueLeads([{ groupKey: 'g2', postKey: '1000002', url: post(2).url, text: '  looking for a PRIVATE driver from Bangkok airport to Hua Hin on 12 Dec for 4 people!! ', groupName: 'G2' }], now);
  assert.equal(second.skipped, 1);
  assert.equal((await lead(2)).skip_reason, 'cross_posted');
  assert.equal((await lead(1)).status, 'queued');
  // After 7 days the same text is a new request again.
  await fl.queueLeads([{ groupKey: 'g3', postKey: '1000003', url: post(3).url, text, groupName: 'G3' }], new Date(now.getTime() + 8 * 86_400_000));
  assert.equal((await lead(3)).status, 'queued');
});

test('strong leads are drafted first; "no agents" posts are drafted with no sales pitch', async () => {
  await fl.queueLeads([
    { groupKey: 'g', postKey: '1000001', url: post(1).url, text: 'Any tips for Koh Chang?', groupName: 'G' },
    { groupKey: 'g', postKey: '1000002', url: post(2).url, text: 'Need a van from Bangkok to Pattaya on 3 Jan for 6 people, no agents please', groupName: 'G' },
  ], now);
  assert.ok((await lead(2)).priority > (await lead(1)).priority);
  const seen = [];
  await fl.processLeads({ draft: async (text, options) => { seen.push({ text, noSalesPitch: options.noSalesPitch, leadsOnly: options.leadsOnly }); return draftOf()(text); }, send: sender().send, now: () => now, batch: 1 });
  assert.deepEqual(seen, [{ text: 'Need a van from Bangkok to Pattaya on 3 Jan for 6 people, no agents please', noSalesPitch: true, leadsOnly: true }], 'the later but stronger lead first');
});

test('each lead is drafted with the name of the group it came from', async () => {
  await fl.queueLeads([{ groupKey: 'kohchangcommunity', postKey: '1000001', url: post(1).url, text: 'Is anywhere doing anything for remembrance day?', groupName: 'Koh Chang Community' }], now);
  const seen = [];
  await fl.processLeads({ draft: async (text, options) => { seen.push(options.groupName); return draftOf()(text); }, send: sender().send, now: () => now });
  assert.deepEqual(seen, ['Koh Chang Community']);
});

const routedOf = (over = {}) => ({ language: 'en', kind: 'travel', replyType: 'info', topic: 't', question: 'q', timeSensitive: false, route: null, advert: false, postType: 'request', inThailand: 'yes', area: 'Koh Chang', ...over });

test('posts are sorted by the AI as they arrive: the collector is told only real leads count; the answer is reused', async () => {
  const calls = [];
  const sort = async (text, groupName) => { calls.push([text.slice(0, 12), groupName]); return /massage|hello/i.test(text) ? { routed: routedOf({ replyType: 'social', postType: 'chat' }), skipReason: 'chat' } : { routed: routedOf(), skipReason: '' }; };
  const first = await fl.queueLeads([
    { groupKey: 'g', postKey: '1000001', url: post(1).url, text: 'Which beach on Koh Chang is best for kids?', groupName: 'Koh Chang Community' },
    { groupKey: 'g', postKey: '1000002', url: post(2).url, text: 'Thai massage tips? Anyone know a good place near the pier?', groupName: 'Koh Chang Community' },
    { groupKey: 'g', postKey: '1000003', url: post(3).url, text: 'Beautiful sunset tonight', groupName: 'Koh Chang Community' },
  ], now, { sort });
  assert.deepEqual(first, { accepted: 3, duplicates: 0, skipped: 2 }, 'the word rules skip 1, the AI skips 1: one real lead');
  assert.deepEqual(calls, [['Which beach ', 'Koh Chang Community'], ['Thai massage', 'Koh Chang Community']], 'only posts that pass the word rules are sorted');
  assert.deepEqual([(await lead(1)).status, (await lead(2)).status, (await lead(2)).skip_reason, (await lead(3)).skip_reason], ['queued', 'not_lead', 'chat', 'no_request']);
  assert.equal(JSON.parse((await lead(1)).routed_json).area, 'Koh Chang');
  // Sent again: a duplicate, not sorted again.
  const again = await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: 'Which beach on Koh Chang is best for kids?', groupName: 'Koh Chang Community' }], now, { sort });
  assert.deepEqual([again.duplicates, calls.length], [1, 2]);
  // Drafting reuses the stored answer.
  const seen = [];
  await fl.processLeads({ draft: async (text, options) => { seen.push(options.routed?.area); return draftOf()(text); }, send: sender().send, now: () => now });
  assert.deepEqual(seen, ['Koh Chang']);
});

test('when the AI sorter fails (or is off), the post stays queued and is sorted at drafting instead', async () => {
  const out = await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: 'Which ferry is best to Koh Chang?', groupName: 'G' }], now, { sort: async () => { throw new Error('model down'); } });
  assert.deepEqual(out, { accepted: 1, duplicates: 0, skipped: 0 });
  assert.deepEqual([(await lead(1)).status, (await lead(1)).routed_json], ['queued', null]);
  const seen = [];
  await fl.processLeads({ draft: async (text, options) => { seen.push(options.routed === undefined); return draftOf()(text); }, send: sender().send, now: () => now });
  assert.deepEqual(seen, [true], 'no stored answer: drafting sorts it');
});

test('a lead eligible to save knowledge (asked 3x) shows Save as knowledge next to Posted and Skip, with no emoji', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now);
  const s = sender();
  await fl.processLeads({ draft: draftOf({ keyboard: [[{ text: '💾 Save as knowledge (asked 3×)', callback_data: 'ph_save:d1' }]] }), send: s.send, now: () => now });
  assert.deepEqual(s.sent[1].keyboard, [
    [{ text: 'Posted', callback_data: `fl_posted:${(await lead(1)).id}` }, { text: 'Skip', callback_data: `fl_skip:${(await lead(1)).id}` }],
    [{ text: 'Save as knowledge (asked 3×)', callback_data: 'ph_save:d1' }],
  ]);
});

test('a lead not yet eligible to save knowledge (no Search again/Wrong or outdated row either) shows only Posted and Skip', async () => {
  await fl.queueLeads([{ groupKey: 'g', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'G' }], now);
  const s = sender();
  await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now }); // draftOf's default keyboard: only Search again, no Save row
  assert.deepEqual(s.sent[1].keyboard, [[{ text: 'Posted', callback_data: `fl_posted:${(await lead(1)).id}` }, { text: 'Skip', callback_data: `fl_skip:${(await lead(1)).id}` }]]);
});

// ---- Reply queue: the extension opens drafted leads one at a time; a person presses Post on Facebook. ----
const replyCall = (body, token = TOKEN) => replyRoute.POST(new Request('https://waydidi.com/api/integrations/fb-leads/reply', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const at = (min) => new Date(now.getTime() + min * 60_000);
/** n leads drafted, sent to Telegram and ready to post (post 1 is the oldest). */
async function sentLeads(n, over = {}) {
  for (let i = 1; i <= n; i++) await fl.queueLeads([{ groupKey: 'thaitravel', postKey: String(1000000 + i), url: post(i).url, text: post(i).text, groupName: 'Thai Travel' }], new Date(now.getTime() + i * 1000), { sort: null });
  await fl.processLeads({ draft: draftOf(over), send: sender().send, now: () => now, batch: n });
}

test('reply queue: not found while its switch is off, 401 without the token, 400 for a bad body', async () => {
  await sentLeads(1);
  assert.equal((await replyCall({ action: 'next' })).status, 404, 'Facebook leads on is not enough');
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  assert.equal((await replyCall({ action: 'next' }, 'wrong')).status, 401);
  assert.equal((await replyRoute.POST(new Request('https://waydidi.com/x', { method: 'POST', body: '{"action":"next"}' }))).status, 401, 'no token');
  assert.equal((await replyCall({ action: 'posted' })).status, 400);
  assert.equal((await lead(1)).reply_claimed_at, null, 'nothing claimed by a refused request');
  const res = await replyCall({ action: 'next' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.lead.comment, 'Take the train & then a taxi <3', 'the comment as plain text, for the comment box');
  assert.equal(body.lead.url, `${post(1).url}#waydidi-reply=${body.lead.id}`);
});

test('reply queue: each lead is handed to one tab; two browsers at once get different leads; a claim lapses after 15 minutes', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  await sentLeads(2);
  const [a, b, c] = await Promise.all([fl.replyQueue({ action: 'next' }, now), fl.replyQueue({ action: 'next' }, now), fl.replyQueue({ action: 'next' }, now)]);
  const ids = [a, b, c].filter((x) => x.lead).map((x) => x.lead.id);
  assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]);
  assert.equal([a, b, c].filter((x) => x.wait === 'empty').length, 1);
  assert.equal((await fl.replyQueue({ action: 'next' }, at(14))).wait, 'empty', 'still open in a tab');
  assert.ok((await fl.replyQueue({ action: 'next' }, at(16))).lead, 'the tab was left: back in the queue');
});

test('reply queue: newest of the strongest first; a lead not ready to post is never handed out', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  await sentLeads(2);
  assert.equal((await fl.replyQueue({ action: 'next' }, now)).lead.id, (await lead(2)).id, 'the newer post first');
  await db.prepare('DELETE FROM fb_leads').run();
  await sentLeads(1, { factCount: 0, replyType: 'info' });
  assert.equal((await lead(1)).reliable, 0);
  assert.equal((await fl.replyQueue({ action: 'next' }, now)).wait, 'empty');
  assert.equal((await fl.replyQueue({ action: 'next', id: (await lead(1)).id }, now)).wait, 'empty', 'not even by id');
});

test('reply queue: posted marks the lead like the Telegram button, once; Telegram then says who marked it', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  await sentLeads(1);
  const id = (await lead(1)).id;
  assert.ok((await fl.replyQueue({ action: 'next', id }, now)).lead, 'opened from the Telegram button, by id');
  const [x, y] = await Promise.all([fl.replyQueue({ action: 'posted', id }, now), fl.replyQueue({ action: 'posted', id }, now)]);
  assert.deepEqual([x, y].map((r) => r.done ?? r.error).sort(), ['already_marked', 'posted'], 'counted once');
  const row = await lead(1);
  assert.equal(row.status, 'posted'); assert.equal(row.marked_by, 'Chrome extension'); assert.equal(row.reply_claimed_at, null);
  const edit = tgCalls.find((c) => c.method === 'editMessageText');
  assert.match(edit.body.text, /Posted<\/b> by Chrome extension/);
  assert.deepEqual(edit.body.reply_markup.inline_keyboard, [], 'buttons removed');
  // A new message under the lead too, once, so the team notices (an edit to an older message is easy to miss).
  const notices = tgCalls.filter((c) => c.method === 'sendMessage');
  assert.equal(notices.length, 1, 'one notice for one posted comment');
  assert.equal(notices[0].body.chat_id, '-200');
  assert.match(notices[0].body.text, /✅ <b>Posted on Facebook<\/b> from Chrome · Thai Travel\nhttps:\/\/www\.facebook\.com\/groups\/thaitravel\/posts\/1000001\//);
  assert.equal(notices[0].body.reply_parameters.message_id, row.link_message_id, 'a reply to the lead');
  assert.equal((await replyCall({ action: 'skipped', id })).status, 409, 'a later mark is refused');
  tgCalls.length = 0;
  await fl.handleLeadCallback('skipped', id, { name: 'Ann', telegramUserId: '7' }, 'q1', '-200', 102);
  assert.match(tgCalls.find((c) => c.method === 'answerCallbackQuery').body.text, /Already marked posted by Chrome extension/);
  assert.equal((await replyCall({ action: 'posted', id: 'f'.repeat(16) })).status, 404);
});

test('reply queue: the gap between comments and the daily cap hold, Telegram Posted taps included', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true'; env.FB_LEADS_REPLY_DAILY_CAP = '2'; env.FB_LEADS_REPLY_GAP_MIN = '5';
  await sentLeads(4);
  const first = (await fl.replyQueue({ action: 'next' }, now)).lead;
  await fl.replyQueue({ action: 'posted', id: first.id }, now);
  const wait = await fl.replyQueue({ action: 'next' }, at(2));
  assert.equal(wait.wait, 'gap'); assert.equal(wait.retryAt, at(5).toISOString());
  // Someone taps Posted in Telegram on another lead: it counts toward the cap too.
  const second = (await fl.replyQueue({ action: 'next' }, at(6))).lead;
  await fl.handleLeadCallback('posted', second.id, { name: 'Ann', telegramUserId: '7' }, 'q', '-200', 1, at(6));
  assert.equal((await fl.replyQueue({ action: 'next' }, at(30))).wait, 'limit');
  // Two browsers at once with one comment left today: opening is not limited, the next hand-out is.
  env.FB_LEADS_REPLY_DAILY_CAP = '3';
  const both = await Promise.all([fl.replyQueue({ action: 'next' }, at(30)), fl.replyQueue({ action: 'next' }, at(30))]);
  assert.equal(both.filter((r) => r.lead).length, 2);
  await fl.replyQueue({ action: 'posted', id: both[0].lead.id }, at(31));
  const late = await fl.replyQueue({ action: 'posted', id: both[1].lead.id }, at(31));
  assert.equal(late.done, 'posted', 'a comment already posted on Facebook is still recorded');
  assert.equal((await fl.replyQueue({ action: 'next' }, at(60))).wait, 'limit');
});

test('reply queue: release hands the lead back at once; skipped closes it', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  await sentLeads(1);
  const { id } = (await fl.replyQueue({ action: 'next' }, now)).lead;
  assert.deepEqual(await fl.replyQueue({ action: 'release', id }, now), { done: 'released' });
  assert.equal((await fl.replyQueue({ action: 'next' }, now)).lead.id, id);
  assert.deepEqual(await fl.replyQueue({ action: 'skipped', id }, now), { done: 'skipped' });
  assert.equal((await lead(1)).status, 'skipped');
  assert.equal(tgCalls.filter((c) => c.method === 'sendMessage').length, 0, 'a skip sends no new message');
  assert.equal((await fl.replyQueue({ action: 'next' }, at(20))).wait, 'empty');
});

test('reply queue: Telegram shows Open in Chrome only while the queue is on, and only for drafts ready to post', async () => {
  const s = sender();
  await fl.queueLeads([{ groupKey: 'thaitravel', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'Thai Travel' }], now, { sort: null });
  await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now });
  assert.equal(s.sent[1].keyboard.length, 1, 'off: Posted and Skip only');
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  await fl.queueLeads([{ groupKey: 'thaitravel', postKey: '1000002', url: post(2).url, text: post(2).text, groupName: 'Thai Travel' }], now, { sort: null });
  await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now });
  const id = (await lead(2)).id;
  assert.deepEqual(s.sent[3].keyboard[1], [{ text: 'Open in Chrome', url: `${post(2).url}#waydidi-reply=${id}` }]);
  await fl.queueLeads([{ groupKey: 'thaitravel', postKey: '1000003', url: post(3).url, text: post(3).text, groupName: 'Thai Travel' }], now, { sort: null });
  await fl.processLeads({ draft: draftOf({ factCount: 0, replyType: 'info' }), send: s.send, now: () => now });
  assert.equal(s.sent[5].keyboard.length, 1, 'not ready to post: no Open in Chrome');
});

// ---- Post from Telegram: a team member approves one comment; the extension posts it. ----
const team = { name: 'Ann', telegramUserId: '7', isTeam: true };
const answers = () => tgCalls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text);

test('Post to Facebook: off by default; only the team can approve; the first tap wins and Telegram shows who', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true';
  await sentLeads(1);
  const id = (await lead(1)).id;
  await fl.handleLeadApprove(id, team, 'q0', '-200', 102, now);
  assert.match(answers()[0], /switched off/);
  env.FB_LEADS_AUTO_POST_ENABLED = 'true';
  await fl.handleLeadApprove(id, { name: 'Stranger', telegramUserId: '99', isTeam: false }, 'q1', '-200', 102, now);
  assert.match(answers()[1], /Only the Waydidi team/);
  assert.equal((await lead(1)).post_approved_at, null, 'a refused tap changes nothing');
  await Promise.all([fl.handleLeadApprove(id, team, 'q2', '-200', 102, now), fl.handleLeadApprove(id, { ...team, name: 'Bo' }, 'q3', '-200', 102, now)]);
  const row = await lead(1);
  assert.ok(row.post_approved_by === 'Ann' || row.post_approved_by === 'Bo');
  assert.equal(answers().filter((t) => /^Approved/.test(t)).length, 1, 'approved once');
  assert.equal(answers().filter((t) => /Already approved by/.test(t)).length, 1);
  const edit = tgCalls.find((c) => c.method === 'editMessageText');
  assert.match(edit.body.text, /⏳ Approved by (Ann|Bo) · Chrome will post it/);
  assert.ok(!JSON.stringify(edit.body.reply_markup).includes('fl_go'), 'the Post to Facebook button is gone once approved');
  assert.ok(JSON.stringify(edit.body.reply_markup).includes('fl_skip'), 'Skip is still there to cancel');
});

test('Post to Facebook: a draft not ready to post cannot be approved, and gets no button', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true'; env.FB_LEADS_AUTO_POST_ENABLED = 'true';
  const s = sender();
  await fl.queueLeads([{ groupKey: 'thaitravel', postKey: '1000001', url: post(1).url, text: post(1).text, groupName: 'Thai Travel' }], now, { sort: null });
  await fl.processLeads({ draft: draftOf({ factCount: 0, replyType: 'info' }), send: s.send, now: () => now });
  assert.ok(!JSON.stringify(s.sent[1].keyboard).includes('fl_go'));
  await fl.handleLeadApprove((await lead(1)).id, team, 'q', '-200', 102, now);
  assert.equal((await lead(1)).post_approved_at, null);
  await fl.queueLeads([{ groupKey: 'thaitravel', postKey: '1000002', url: post(2).url, text: post(2).text, groupName: 'Thai Travel' }], now, { sort: null });
  await fl.processLeads({ draft: draftOf(), send: s.send, now: () => now });
  assert.deepEqual(s.sent[3].keyboard.at(-1), [{ text: 'Post to Facebook', callback_data: `fl_go:${(await lead(2)).id}` }]);
});

test('approved comments go to the extension to post, oldest approval first, inside the cap and gap; the manual queue skips them', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true'; env.FB_LEADS_AUTO_POST_ENABLED = 'true'; env.FB_LEADS_REPLY_GAP_MIN = '5';
  await sentLeads(3);
  const [a, b] = [(await lead(1)).id, (await lead(2)).id];
  assert.equal((await fl.replyQueue({ action: 'approved' }, now)).wait, 'empty', 'nothing approved yet');
  await fl.handleLeadApprove(b, team, 'q', '-200', 1, now);
  await fl.handleLeadApprove(a, team, 'q', '-200', 1, at(1));
  const manual = await fl.replyQueue({ action: 'next' }, at(1));
  assert.equal(manual.lead.id, (await lead(3)).id, 'the manual queue never hands out an approved comment');
  assert.ok(!manual.lead.auto);
  const first = await fl.replyQueue({ action: 'approved' }, at(1));
  assert.equal(first.lead.id, b); assert.equal(first.lead.auto, true);
  const [p, q] = await Promise.all([fl.replyQueue({ action: 'approved' }, at(1)), fl.replyQueue({ action: 'approved' }, at(1))]);
  assert.deepEqual([p.wait, q.wait], ['empty', 'empty'], 'one approved comment in flight at a time, across browsers');
  await fl.replyQueue({ action: 'posted', id: b }, at(2));
  assert.equal((await fl.replyQueue({ action: 'approved' }, at(3))).wait, 'gap');
  assert.equal((await fl.replyQueue({ action: 'approved' }, at(8))).lead.id, a);
});

test('a comment Chrome could not post: approval cleared, never retried by itself, the team is told', async () => {
  env.FB_LEADS_REPLY_QUEUE_ENABLED = 'true'; env.FB_LEADS_AUTO_POST_ENABLED = 'true';
  await sentLeads(1);
  const id = (await lead(1)).id;
  await fl.handleLeadApprove(id, team, 'q', '-200', 1, now);
  assert.ok((await fl.replyQueue({ action: 'approved' }, now)).lead);
  tgCalls.length = 0;
  const [x, y] = await Promise.all([replyCall({ action: 'auto_failed', id }), replyCall({ action: 'auto_failed', id })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409], 'reported once');
  const row = await lead(1);
  assert.equal(row.status, 'sent'); assert.equal(row.post_approved_at, null); assert.equal(row.reply_claimed_at, null);
  const note = tgCalls.find((c) => c.method === 'sendMessage');
  assert.equal(note.body.chat_id, '-200');
  assert.match(note.body.text, /couldn't post the comment for <b>Thai Travel<\/b>\. Please post it by hand\./);
  assert.ok(JSON.stringify(tgCalls.find((c) => c.method === 'editMessageText').body.reply_markup).includes('fl_go'), 'Post to Facebook is offered again');
  assert.equal((await fl.replyQueue({ action: 'approved' }, at(20))).wait, 'empty', 'not retried without a new tap');
});
