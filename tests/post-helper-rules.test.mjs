import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const r = await vite.ssrLoadModule('/lib/post-helper-rules.ts');
const now = new Date('2026-10-21T05:00:00Z');

test('sources are classified: official, news, blog; social posts and forums are blocked', () => {
  assert.deepEqual([r.classifySource('https://www.immigration.go.th/x').tier, r.classifySource('https://tourismthailand.org/a').tier, r.classifySource('https://www.bangkokpost.com/x').tier, r.classifySource('https://someblog.com/thailand').tier], [1, 1, 2, 3]);
  for (const u of ['https://www.facebook.com/groups/x', 'https://old.reddit.com/r/Thailand', 'https://www.tripadvisor.com/ShowTopic', 'ftp://x.go.th/a', 'not a url']) assert.equal(r.classifySource(u).tier, 0, u);
  assert.equal(r.classifySource('https://evilgo.th.example.com').tier, 3, 'a look-alike domain is not official');
});

test('page ages: dates and "2 months ago" are read, unknown stays unknown', () => {
  assert.equal(r.pageAgeDays('October 11, 2026', now), 10);
  assert.equal(r.pageAgeDays('2 months ago', now), 60);
  assert.equal(r.pageAgeDays('1 year ago', now), 365);
  assert.equal(r.pageAgeDays('yesterday', now), 1);
  assert.equal(r.pageAgeDays('', now), null);
  assert.equal(r.pageAgeDays('sometime', now), null);
});

const found = (...items) => items.map(([url, pageAge]) => ({ url, pageAge }));
test('risky facts need an official page or two recent news sites; blogs only support tips', () => {
  const sources = found(['https://www.immigration.go.th/visa', 'January 5, 2026'], ['https://blog.example.com/visa', '2 weeks ago'], ['https://www.bangkokpost.com/a', '1 month ago'], ['https://www.nationthailand.com/b', '3 weeks ago'], ['https://www.thethaiger.com/old', '2 years ago'], ['https://blog.example.com/tip', '3 months ago'], ['https://blog.example.com/stale', '2 years ago'], ['https://blog.example.com/undated', '']);
  const facts = [
    { claim: 'Visa rule X (official)', category: 'visa', sources: ['https://www.immigration.go.th/visa'] },
    { claim: 'Visa rule from a blog only', category: 'visa', sources: ['https://blog.example.com/visa'] },
    { claim: 'Fee confirmed by two news sites', category: 'fees', sources: ['https://www.bangkokpost.com/a', 'https://www.nationthailand.com/b'] },
    { claim: 'Fee from one news site', category: 'fees', sources: ['https://www.bangkokpost.com/a'] },
    { claim: 'Fee from old news', category: 'fees', sources: ['https://www.thethaiger.com/old'] },
    { claim: 'Tip from a recent blog', category: 'tip', sources: ['https://blog.example.com/tip'] },
    { claim: 'Tip from a stale blog', category: 'tip', sources: ['https://blog.example.com/stale'] },
    { claim: 'Tip from an undated blog', category: 'tip', sources: ['https://blog.example.com/undated'] },
    { claim: 'Invented source', category: 'general', sources: ['https://www.immigration.go.th/never-returned'] },
  ];
  const { kept, dropped } = r.verifyFacts(facts, sources, now);
  assert.deepEqual(kept.map((f) => f.claim), ['Visa rule X (official)', 'Fee confirmed by two news sites', 'Tip from a recent blog']);
  assert.deepEqual(kept.map((f) => f.label), ['official', 'news', 'blog']);
  assert.equal(dropped.length, 6);
  assert.match(dropped.find((d) => d.claim === 'Invented source').reason, /no source/);
  assert.match(dropped.find((d) => d.claim === 'Visa rule from a blog only').reason, /official/);
  assert.match(kept[1].sources[0].dateLabel, /^\d\d\/\d\d\/2026$/);
});

test('saved knowledge is due after each 10 January and 10 July (Thailand date)', () => {
  const d = (s) => new Date(s);
  assert.equal(r.lastRefreshDate(d('2026-01-09T10:00:00Z')), '2025-07-10');
  assert.equal(r.lastRefreshDate(d('2026-01-09T18:00:00Z')), '2026-01-10'); // already 10 Jan in Thailand
  assert.equal(r.lastRefreshDate(d('2026-07-09T10:00:00Z')), '2026-01-10');
  assert.equal(r.lastRefreshDate(d('2026-10-21T00:00:00Z')), '2026-07-10');
  assert.equal(r.refreshDue('2026-07-01T00:00:00Z', d('2026-10-21T00:00:00Z')), true);
  assert.equal(r.refreshDue('2026-07-11T00:00:00Z', d('2026-10-21T00:00:00Z')), false);
  assert.equal(r.refreshDue('2026-07-11T00:00:00Z', d('2027-01-10T01:00:00Z')), true);
});

test('time-sensitive saved answers over 3 months old carry a warning', () => {
  assert.equal(r.staleWarning({ timeSensitive: true, collectedAt: '2026-06-01T00:00:00Z' }, now), true);
  assert.equal(r.staleWarning({ timeSensitive: true, collectedAt: '2026-09-01T00:00:00Z' }, now), false);
  assert.equal(r.staleWarning({ timeSensitive: false, collectedAt: '2025-01-01T00:00:00Z' }, now), false);
});

test('the model replies are read into checked values; bad replies are refused', () => {
  const routed = r.parseRouted('Sure: {"language":"th","kind":"transport","topic":"BKK Airport -> Pattaya taxi!","question":"Taxi from BKK to Pattaya","timeSensitive":true,"route":{"pickup":"BKK","dropoff":"Pattaya","passengers":99,"bags":-3}}');
  assert.equal(routed.topic, 'bkk-airport-pattaya-taxi'); assert.equal(routed.route.passengers, 30); assert.equal(routed.route.bags, 0); assert.equal(routed.language, 'th');
  assert.equal(r.parseRouted('no json'), null); assert.equal(r.parseRouted('{"topic":"","question":"x"}'), null);
  const facts = r.parseFacts('{"facts":[{"claim":"A","category":"visa","sources":["https://x.go.th/a",5]},{"claim":"","category":"tip","sources":[]},{"claim":"B","category":"weird","sources":[]}]}');
  assert.deepEqual(facts.map((f) => [f.claim, f.category, f.sources.length]), [['A', 'visa', 1], ['B', 'general', 0]]);
  assert.equal(r.parseComposed('{"comment":"Line 1\\n\\n\\n\\nLine 2"}').comment, 'Line 1\n\nLine 2');
  assert.equal(r.parseComposed('{"comment":""}'), null);
});

test('closings follow the playbook: sales get one WhatsApp line, info gets a sign-off, social gets nothing; em dashes are removed', () => {
  const wa = '+66 63 206 4884';
  const sales = r.withClosing('sales', 'Easier with bags — what date?', wa, 0);
  assert.match(sales, /^Easier with bags, what date\?\n\nFor private trips, transfers or tour enquiries, WhatsApp \+66 63 206 4884\.$/);
  assert.equal(r.withClosing('adjacent', 'Hi', wa, 1).includes('Want to check options for your dates?'), true);
  assert.equal(r.withClosing('sales', 'Message us on WhatsApp +66 63 206 4884', wa, 0), 'Message us on WhatsApp +66 63 206 4884', 'no second WhatsApp line');
  const info = r.withClosing('info', 'Karon is quieter.', wa, 2);
  assert.match(info, /More Thailand tips and local travel ideas at Waydidi Travel\.$/); assert.doesNotMatch(info, /WhatsApp/);
  assert.equal(r.withClosing('social', 'Welcome!', wa, 0), 'Welcome!');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => r.pick(r.SALES_CTAS, i)).slice(0, 5).length, 5);
  assert.equal(r.parseRouted('{"topic":"a","question":"b","replyType":"sales"}').replyType, 'sales');
  assert.equal(r.parseRouted('{"topic":"a","question":"b","replyType":"weird"}').replyType, 'info');
});

test('/comment starts the post helper (the old /p and /post still work, also with the bot name); other commands do not', () => {
  assert.equal(r.parsePostCommand('/comment Need a taxi to Pattaya'), 'Need a taxi to Pattaya');
  assert.equal(r.parsePostCommand('/Comment@WaydidiBot hi'), 'hi');
  assert.equal(r.parsePostCommand('/comment'), '');
  assert.equal(r.parsePostCommand('/p Need a taxi to Pattaya'), 'Need a taxi to Pattaya');
  assert.equal(r.parsePostCommand('/post Need a taxi\nfor 3 people'), 'Need a taxi\nfor 3 people');
  assert.equal(r.parsePostCommand('/P@WaydidiBot hello'), 'hello');
  assert.equal(r.parsePostCommand('/p'), '');
  assert.equal(r.parsePostCommand('  /p   '), '');
  for (const other of ['/commentary x', '/comments', '/payment 12', '/pa', '/posts x', '/id', 'p hello', 'please /p', '/ask p']) assert.equal(r.parsePostCommand(other), null, other);
});
