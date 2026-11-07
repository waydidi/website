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
  // A booking request answered without a web search has no facts to check: ready. Searched and found nothing: not ready.
  assert.deepEqual(r.reliability({ factCount: 0, stale: false, replyType: 'sales', searched: false }), { reliable: true });
  assert.equal(r.reliability({ factCount: 0, stale: false, replyType: 'sales', searched: true }).reliable, false);
  assert.equal(r.reliability({ factCount: 0, stale: false, replyType: 'info', searched: false }).reliable, false);
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

test('owner rule: contact details mean an advert; the Koh Chang villa post is dropped whole or cut off by See more', () => {
  const reason = (t) => { const x = r.screenPost(t); return x.queue ? 'queue' : x.reason; };
  // What the extension read (cut off by "See more"), and the full post with its contacts.
  const cut = '64C & 64D KOH CHANG POOL VILLAS\nLuxury Private Pool Villas for Yearly Rental\nสัมผัสประสบการณ์การพักอาศัยเหนือระดับ ท่ามกลางธรรมชาติและบรรยากาศอันเงียบสงบของเกาะช้าง';
  assert.notEqual(reason(cut), 'queue', cut);
  assert.equal(reason(cut + '\nPlease contact us for rental rates.\n📞 Tel (Thai / English): +66 64 456 0999\n📲 WhatsApp: +66 64 557 8215\n📲 LINE ID: @kohchangvillas'), 'promo');
  for (const t of ['Private van Bangkok to Pattaya every day. LINE ID: @fastvan', 'รถตู้รับส่งสนามบิน ทุกวัน ไลน์ไอดี: @vanbkk', 'Island tours daily, call 081 234 5678', 'Day trip to Koh Wai, WhatsApp +66 81 234 5678', 'Looking for a villa? Contact us +66 81 234 5678', 'Condo for rent near the beach', 'บ้านให้เช่า ใกล้ทะเล'])
    assert.equal(reason(t), 'promo', t);
  assert.equal(reason('Yearly rental condo in Jomtien, any good areas?'), 'long_stay');
  // A traveller who adds their own number while asking is still a lead.
  assert.equal(reason('Looking for a driver tomorrow from Trat airport, WhatsApp me +66 81 234 5678'), 'queue');
  assert.equal(reason('Is there a WhatsApp group for Koh Chang drivers?'), 'queue', 'the word WhatsApp alone is not a contact');
});

test('owner targeting rules: giveaways, bait, spam, solved, admin posts and requests Waydidi cannot serve are skipped', () => {
  const reason = (t) => { const x = r.screenPost(t); return x.queue ? 'queue' : x.reason; };
  const cases = {
    giveaway: ['GIVEAWAY time! Win a free island tour', 'แจกฟรี บัตรเข้าสวนน้ำ', '抽奖送门票', 'Розыгрыш экскурсии'],
    bait: ['Comment YES if you love Thailand', 'Tag a friend you would bring to Phuket', 'ใครเห็นด้วยบ้าง'],
    spam: ['Earn $500 per day from home', 'Crypto investment opportunity, DM', 'สินเชื่อด่วน อนุมัติไว', 'Check this bit.ly/abc'],
    solved: ['UPDATE: booked, thanks all!', 'Solved, thank you everyone', 'ได้แล้วค่ะ ขอบคุณทุกคน', '已解决，谢谢'],
    admin_post: ['Group rules: be kind, no selling', 'ประกาศจากแอดมิน ห้ามขายของ', 'Admin notice: posts about visas go in the pinned thread'],
    not_served: ['We are hiring a receptionist in Pattaya', 'Looking for a roommate in Chiang Mai', 'Lost my wallet at Walking Street, anyone found it?', 'Puppies for adoption in Phuket', 'Need a lawyer urgently in Pattaya'],
  };
  for (const [want, list] of Object.entries(cases)) for (const t of list) assert.equal(reason(t), want, t);
  // A driver to a hospital is still a lead; so are Russian, Korean, food, nightlife and plan questions.
  for (const t of ['Need a taxi to Bangkok Hospital Pattaya tonight', 'Подскажите трансфер из аэропорта в Паттайю', '파타야 공항 픽업 추천해 주세요', 'Where to eat good seafood on Koh Samet?', 'Best nightlife in Pattaya', 'Itinerary for 5 days Phuket and Krabi', 'ร้านอาหารแถวหาดไหนดี', '曼谷夜生活', '普吉岛行程'])
    assert.equal(reason(t), 'queue', t);
});

test('"no agents" posts are answered without a sales pitch; strong leads get a higher priority', () => {
  for (const t of ['Need a driver, no agents please', 'หาคนขับรถ ไม่รับนายหน้า', '找司机 不要中介', 'Private persons only, need a van']) assert.equal(r.noSalesPitch(t), true, t);
  assert.equal(r.noSalesPitch('Need a driver tomorrow'), false);
  assert.equal(r.leadPriority('Any tips for Koh Chang?'), 0);
  assert.equal(r.leadPriority('Need a van from Bangkok to Pattaya on 3 Jan for 6 people'), 6);
  assert.equal(r.leadPriority('รถจากสุวรรณภูมิไปพัทยา พรุ่งนี้ 4 คน'), 6);
  assert.equal(r.normalisedText(' Hello,  WORLD!! '), 'hello world');
});

test('the collector may mark a post commenting_disabled or already_engaged; any other value is ignored', () => {
  const url = 'https://www.facebook.com/groups/g1/posts/1234567/';
  const out = r.readIngest({ posts: [{ url, text: 'Need a driver tomorrow', skip: 'already_engaged' }, { url: url.replace('1234567', '7654321'), text: 'Need a driver tomorrow', skip: 'drop table' }] });
  assert.equal(out.posts[0].skip, 'already_engaged');
  assert.equal('skip' in out.posts[1], false);
});

test('owner\'s first real run: shop adverts, invitations, lost and found and new-member hellos are skipped for free', () => {
  const reason = (t) => { const x = r.screenPost(t); return x.queue ? 'queue' : x.reason; };
  const cases = [
    ['I lost my lovely sunglasses around lonely beach yesterday... anyone found them?', 'not_served'],
    ['Lost my phone in a taxi from the pier yesterday', 'not_served'],
    ['Jay Nid Curry Rice \nHello! We’d like to recommend our curry rice shop on White Sand Beach', 'promo'],
    ['Wanna feel something different like relaxing and having a good time with us', 'promo'],
    ['Tonight the fun begin! We open at 20.00. Chill atmosphere, cool music', 'promo'],
    ['ส้มตำปากหมา วันนี้ร้านปิดนะคะ', 'promo'],
    ['Hello new member just want to say Hello and talk a little bit about me', 'intro'],
    // Still leads:
    ['Hi, I am new here, can anyone recommend a driver from Trat airport?', 'queue'],
    ['Can anyone recommend a good restaurant near our resort?', 'queue'],
    ['I lost my booking confirmation, how do I get the ferry ticket?', 'queue'],
    ['Need a nice beach front bungalow, 8th January 3 nights any recommendations?', 'queue'],
  ];
  for (const [t, want] of cases) assert.equal(reason(t), want, t);
});
