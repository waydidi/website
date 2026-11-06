import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
// Facebook group leads: reading collector input, the off switch, the daily limit and when a draft is ready to post.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const r = await vite.ssrLoadModule('/lib/fb-leads-rules.ts');
const token = 'x'.repeat(32);

test('off unless enabled, with a long token and a Comment group', () => {
  assert.equal(r.leadsEnabled({}), false);
  assert.equal(r.leadsEnabled({ FB_LEADS_ENABLED: 'true', FB_LEADS_INGEST_TOKEN: token }), false, 'no Comment group');
  assert.equal(r.leadsEnabled({ FB_LEADS_ENABLED: 'true', FB_LEADS_INGEST_TOKEN: 'short', TELEGRAM_COMMENT_CHAT_ID: '-1' }), false, 'token too short');
  assert.equal(r.leadsEnabled({ FB_LEADS_ENABLED: '1', FB_LEADS_INGEST_TOKEN: token, TELEGRAM_COMMENT_CHAT_ID: '-1' }), false, 'only "true" turns it on');
  assert.equal(r.leadsEnabled({ FB_LEADS_ENABLED: 'TRUE ', FB_LEADS_INGEST_TOKEN: token, TELEGRAM_COMMENT_CHAT_ID: '-1' }), true);
});

test('group post links: the three Facebook shapes become one clean link; anything else is refused', () => {
  assert.deepEqual(r.parsePostUrl('https://www.facebook.com/groups/thailandtravel/posts/1234567890/?__cft__[0]=AZ&__tn__=R'),
    { groupKey: 'thailandtravel', postKey: '1234567890', url: 'https://www.facebook.com/groups/thailandtravel/posts/1234567890/' });
  assert.equal(r.parsePostUrl('https://m.facebook.com/groups/123456/permalink/9876543210/').url, 'https://www.facebook.com/groups/123456/posts/9876543210/');
  assert.equal(r.parsePostUrl('https://web.facebook.com/groups/123456/?multi_permalinks=55555555,66666666').postKey, '55555555');
  assert.equal(r.parsePostUrl('https://www.facebook.com/groups/g1/posts/pfbid02abcDEF123456789xyz/').postKey, 'pfbid02abcDEF123456789xyz');
  for (const bad of ['http://www.facebook.com/groups/g/posts/1234567/', 'https://facebook.evil.com/groups/g/posts/1234567/', 'https://www.facebook.com/someone/posts/1234567/',
    'https://www.facebook.com/groups/g/', 'https://www.facebook.com/groups/g/posts/abc/', 'https://user:pw@www.facebook.com/groups/g/posts/1234567/', 'not a url', 42, null])
    assert.equal(r.parsePostUrl(bad), null, String(bad));
});

test('collector body: valid posts are kept, bad ones refused with a reason, limits enforced', () => {
  assert.ok('error' in r.readIngest(null));
  assert.ok('error' in r.readIngest({ posts: [] }));
  assert.ok('error' in r.readIngest({ posts: Array.from({ length: 26 }, () => ({})) }));
  const url = 'https://www.facebook.com/groups/g1/posts/1234567/';
  const out = r.readIngest({ posts: [
    { url, text: '  Need a van from BKK to Pattaya \u0000 for 6 people  ', groupName: '  Thailand   Travel  ' },
    { url, text: 'same post again' },
    { url: 'https://example.com/x', text: 'hello there' },
    { url: 'https://www.facebook.com/groups/g1/posts/7654321/', text: ' ' },
    { url: 'https://www.facebook.com/groups/g2/posts/7654321/', text: 'x'.repeat(5000) },
  ] });
  assert.equal(out.posts.length, 2);
  assert.equal(out.posts[0].text, 'Need a van from BKK to Pattaya  for 6 people');
  assert.equal(out.posts[0].groupName, 'Thailand Travel');
  assert.equal(out.posts[1].groupName, 'g2', 'the group key when no name is given');
  assert.equal(out.posts[1].text.length, r.MAX_TEXT);
  assert.deepEqual(out.rejected.map((x) => x.index), [1, 2, 3]);
  assert.ok(out.rejected.every((x) => !/van|hello/.test(x.reason)), 'reasons never repeat the post text');
});

test('which posts are leads, and when a draft is ready to post', () => {
  assert.deepEqual(['sales', 'adjacent', 'info', 'social'].map(r.isLead), [true, true, true, false]);
  assert.deepEqual(r.reliability({ factCount: 2, stale: false }), { reliable: true });
  assert.equal(r.reliability({ factCount: 0, stale: false }).reliable, false);
  assert.match(r.reliability({ factCount: 3, stale: true }).reason, /over 3 months old/);
});

test('which posts ask for something: questions and travel words pass, plain sharing does not',()=>{
  for(const yes of ['Anyone know a good driver?','Need a van from BKK to Pattaya for 6','How much is a taxi to Ayutthaya','แนะนำที่พักเกาะช้างหน่อยค่ะ','มีรถรับส่งสนามบินไหม','请问有没有包车推荐','Best time to visit Chiang Mai ？'])assert.equal(r.looksLikeRequest(yes),true,yes);
  for(const no of ['Beautiful sunset at Kata beach today','Thank you all for the great trip, see you next year','Happy birthday to our admin'])assert.equal(r.looksLikeRequest(no),false,no);
});

test('adverts, promotions and long-stay searches are screened out; seekers and transport asks are kept',()=>{
  const reason=(t)=>{const x=r.screenPost(t);return x.queue?'queue':x.reason;};
  for(const t of ['Book now! Special price for private van Bangkok to Pattaya, contact us on WhatsApp','We offer private tours and airport transfers all over Thailand. DM us','โปรโมชั่นรถรับส่งสนามบิน ราคาพิเศษ ติดต่อสอบถามได้เลย','Airport transfer 1,200 baht, Line ID: @fasttaxi, call 081 234 5678','欢迎咨询 包车 特价'])assert.equal(reason(t),'promo',t);
  for(const t of ['Looking for a room or condo for 3 months in Chiang Mai, anyone?','Need a house to rent monthly near Phuket airport','ต้องการเช่าห้องระยะยาว 6 เดือน แถวพัทยา','求长租公寓 三个月 清迈'])assert.equal(reason(t),'long_stay',t);
  for(const t of ['Looking for a driver, I will pay 2000 baht, whatsapp me','Anyone recommend a tour company? Special occasion','Need a car and driver for 1 month, Chiang Mai to Pai and back','Need a van for 6 people, room for luggage?','Stay near the airport tonight, which hotel and how do I get to Pattaya?','ใครรู้จักคนขับรถรายเดือนบ้างไหมคะ'])assert.equal(reason(t),'queue',t);
  assert.equal(reason('Beautiful sunset at Kata beach today'),'no_request');
});

test('daily limit, Thailand day start, buttons', () => {
  assert.equal(r.dailyLimit(undefined), 50);
  assert.equal(r.dailyLimit('0'), 50);
  assert.equal(r.dailyLimit('120'), 120);
  assert.equal(r.dailyLimit('2.5'), 50);
  assert.equal(r.thaiDayStart(new Date('2026-11-06T16:59:00Z')), '2026-11-05T17:00:00.000Z');
  assert.equal(r.thaiDayStart(new Date('2026-11-06T17:00:00Z')), '2026-11-06T17:00:00.000Z');
  assert.deepEqual(r.parseLeadCallback('fl_posted:0123456789abcdef'), { action: 'posted', id: '0123456789abcdef' });
  assert.deepEqual(r.parseLeadCallback('fl_skip:0123456789abcdef'), { action: 'skipped', id: '0123456789abcdef' });
  for (const bad of ['fl_posted:xyz', 'fl_delete:0123456789abcdef', 'fl_posted:0123456789abcdef:1']) assert.equal(r.parseLeadCallback(bad), null);
  assert.equal(r.thaiStamp(new Date('2026-11-06T07:05:00Z')), '06/11/2026 14:05');
});
