import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// /trip check-first summary: nearest-first ordering with opening-hours moves (lib/trip-plan.ts), what is missing or
// unsure (lib/telegram/trip-draft-rules.ts), and the AI reader's drop-off and "given" fields (lib/trip-chat-rules.ts).
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const plan = await vite.ssrLoadModule('/lib/trip-plan.ts');
const rules = await vite.ssrLoadModule('/lib/telegram/trip-draft-rules.ts');
const chat = await vite.ssrLoadModule('/lib/trip-chat-rules.ts');

// Points on a line: 1 unit of latitude = 20 minutes' drive, so the times are easy to work out.
const travel = (a, b) => Math.round(Math.abs(a.lat - b.lat) * 20);
const place = (id, lat, open = '06:00', close = '22:00', extra = {}) => ({ id, name: id, latitude: lat, longitude: 0, openTime: open, closeTime: close, lastEntry: null, closedDays: [], durationMin: 30, arrivalBufferMin: 0, programs: [], exceptions: [], tags: [], ...extra });
const stop = (id, lat, extra = {}) => ({ id, kind: 'attraction', name: id, attractionId: id, lat, lng: 0, durationMin: 30, priority: 'must', ...extra });
const input = (attractions, over = {}) => ({ date: '2026-12-12', startMin: 8 * 60, from: { lat: 0, lng: 0 }, end: { lat: 0, lng: 0 }, endLimit: 20 * 60, attractions: Object.fromEntries(attractions.map((a) => [a.id, a])), travel, ...over });
const ids = (r) => r.stops.map((s) => s.id);

test('nearest place first from the pickup, whatever order the places were typed in', () => {
  const r = plan.nearestFirst([stop('far', 3), stop('mid', 2), stop('near', 1)], input([place('far', 3), place('mid', 2), place('near', 1)]));
  assert.deepEqual(ids(r), ['near', 'mid', 'far']);
  assert.deepEqual(r.moved, []);
});

test('a place reached after it closes is moved to where it is open, and the move is reported', () => {
  // Nearest-first would reach "early" (closes 09:30) last, at 10:00; going there first arrives at 09:00.
  const at = [place('a', 1), place('b', 2), place('early', 3, '06:00', '09:30')];
  const r = plan.nearestFirst([stop('a', 1), stop('b', 2), stop('early', 3)], input(at));
  assert.equal(ids(r)[0], 'early');
  assert.deepEqual(r.moved, [{ stopId: 'early', name: 'early', reason: 'closed_by_then' }]);
  assert.equal(plan.schedule(r.stops, input(at)).problems.filter((p) => p.level === 'error').length, 0);
});

test('a place the group would wait long to open is moved later when that is better', () => {
  // "late" is nearest but opens at 11:00: going there first means waiting over two hours.
  const at = [place('late', 1, '11:00', '18:00'), place('b', 2), place('c', 3)];
  const r = plan.nearestFirst([stop('late', 1), stop('b', 2), stop('c', 3)], input(at));
  assert.notEqual(ids(r)[0], 'late');
  assert.equal(r.moved[0]?.reason, 'not_open_yet');
});

test('a place closed all day cannot be fixed by moving: it stays and the plan says so', () => {
  const at = [place('a', 1), place('shut', 2, '06:00', '22:00', { closedDays: [6] })]; // 12 Dec 2026 is a Saturday
  const r = plan.nearestFirst([stop('a', 1), stop('shut', 2)], input(at));
  assert.deepEqual(ids(r), ['a', 'shut']);
  assert.deepEqual(r.moved, []);
  assert.match(plan.schedule(r.stops, input(at)).problems.map((p) => p.message).join('\n'), /shut is closed on this date/);
});

test('a stop with a package time keeps its time; the others go nearest-first around it', () => {
  const at = [place('a', 1), place('b', 2), place('show', 3)];
  const r = plan.nearestFirst([stop('show', 3, { sessionTime: '13:00', priority: 'fixed' }), stop('b', 2), stop('a', 1)], input(at));
  assert.deepEqual(ids(r).filter((x) => x !== 'show'), ['a', 'b']);
  assert.ok(ids(r).includes('show'));
});

const ready = (over = {}) => ({ title: 't', area: 'Phuket', language: 'en', notes: null, tripDate: '2026-12-20', startTime: '09:00', hours: 8, hoursGiven: true,
  adults: 4, children: 0, peopleGiven: true, bags: 2, pickup: { text: 'graceland', found: true, name: 'Graceland Resort', address: 'Patong', lat: 7.9, lng: 98.3 }, dropoff: null,
  car: { ok: true, vehicle: 'comfort_suv', named: false }, price: null, priceAmbiguous: [], rate: 2800,
  places: [{ stopId: 's1', name: 'Big Buddha', attractionId: 'bb', lat: 7.8, lng: 98.3, durationMin: 60, priority: 'must' }], times: [{ stopId: 's1', arrival: '09:40', end: '10:40' }],
  endAt: '11:20', moved: [], warnings: [], unsure: [], farApart: null, multiday: null, suggested: false, ...over });

test('the summary is ready only when nothing is missing or unsure', () => {
  assert.equal(rules.tripDraftReady(ready()), true);
  assert.deepEqual(rules.tripDraftMissing(ready({ tripDate: null, peopleGiven: false, startTime: null, pickup: null, places: [] })), ['date', 'people', 'startTime', 'pickup', 'places']);
  assert.deepEqual(rules.tripDraftMissing(ready({ rate: null })), ['price'], 'no price and no hourly rate: the price is asked');
  assert.equal(rules.tripDraftMissing(ready({ rate: null, price: 3500 })).length, 0);
  for (const bad of [{ pickup: { text: 'x', found: false } }, { car: { ok: false, vehicle: null } }, { priceAmbiguous: [3000, 1000] }, { unsure: ['?'] }, { suggested: true },
    { places: [{ stopId: 's2', name: 'Nowhere', attractionId: null, lat: null, lng: null, durationMin: 45, priority: 'must', notFound: true }] }])
    assert.equal(rules.tripDraftReady(ready(bad)), false, JSON.stringify(bad));
});

test('the summary shows the route with times, the car rule, the drop-off and what is asked', () => {
  const text = rules.tripDraftSummary(ready({ moved: [{ stopId: 's1', name: 'Big Buddha', reason: 'closed_by_then' }], warnings: ['Big Buddha closes at 17:30; arrival is 18:00.'] }));
  assert.match(text, /รับ 09:00 · 8 ชม\.\n👥 4 ผู้ใหญ่ · 🚗 Comfort SUV \(อัตโนมัติตามจำนวนคน\)\n📍 รับ: Graceland Resort, Patong \(Google Maps\)\n🏁 ส่ง: ❔ ที่เดียวกับจุดรับ/);
  assert.match(text, /09:00 รับที่จุดรับ\n1\. 09:40–10:40 Big Buddha\n11:20 ถึงจุดส่ง/);
  assert.match(text, /↪️ ย้าย Big Buddha เพราะถ้าไปตามระยะทางจะถึงหลังปิด/);
  assert.match(text, /ประมาณ THB 2,800 ตามเรทรายชั่วโมง \(8 ชม\.\)/);
  assert.match(text, /• Big Buddha closes at 17:30/);
  assert.match(rules.tripDraftSummary(ready({ peopleGiven: false, pickup: null })), /ยังขาด:.*จำนวนคน.*จุดรับ/);
  assert.match(rules.tripDraftSummary(ready({ hoursGiven: false })), /8 ชม\. ❔ ไม่ได้ระบุ/);
  assert.match(rules.tripDraftSummary(ready({ places: [{ stopId: 's1', name: '<b>x</b>', attractionId: 'bb', lat: 1, lng: 1, durationMin: 60, priority: 'must' }] })), /&lt;b&gt;x&lt;\/b&gt;/, 'names are escaped');
});

test('the code reader and the AI must agree on the date and the people, and the newest price wins', () => {
  assert.deepEqual(rules.crossCheck({ tripDate: '2026-12-20', people: 4, peopleGiven: true }, { tripDate: '2026-12-20', people: 4 }), []);
  assert.equal(rules.crossCheck({ tripDate: '2026-12-02', people: 4, peopleGiven: true }, { tripDate: '2026-02-12', people: 4 }).length, 1);
  assert.equal(rules.crossCheck({ tripDate: '2026-12-20', people: 2, peopleGiven: true }, { tripDate: '2026-12-20', people: 3 }).length, 1);
  assert.deepEqual(rules.crossCheck({ tripDate: null, people: 2, peopleGiven: false }, null), []);
  const read = (t) => (/3,500/.test(t) ? { ok: true, thb: 3500 } : /3,000.*1,000/.test(t) ? { ok: false, reason: 'ambiguous', amounts: [3000, 1000] } : { ok: false, reason: 'missing', amounts: [] });
  assert.deepEqual(rules.latestPrice(['car THB 3,000, tickets THB 1,000', 'price THB 3,500'], read), { price: 3500, ambiguous: [] });
  assert.deepEqual(rules.latestPrice(['price THB 3,500', 'make it 5 people'], read), { price: 3500, ambiguous: [] });
  assert.deepEqual(rules.latestPrice(['car THB 3,000, tickets THB 1,000'], read), { price: null, ambiguous: [3000, 1000] });
});

test('the AI reader keeps a drop-off only when it is another place, and says which defaults were really given', () => {
  const read = (o) => chat.parseChatPlan(JSON.stringify({ title: 't', area: '', date: '2026-12-20', stops: [{ name: 'Big Buddha' }], ...o }), [], '2026-11-16', () => 'x');
  assert.equal(read({ pickup: 'Graceland', dropoff: 'Phuket Airport' }).dropoffText, 'Phuket Airport');
  assert.equal(read({ pickup: 'Graceland', dropoff: 'graceland' }).dropoffText, '', 'the same place as the pickup is no drop-off');
  assert.equal(read({ pickup: 'Graceland', dropoff: null }).dropoffText, '');
  assert.deepEqual(read({ startTime: '09:00', adults: 4 }).given, { startTime: true, people: true });
  assert.deepEqual(read({}).given, { startTime: false, people: false });
  assert.equal(read({}).startTime, '08:00', 'the default is kept for Admin → Trip from chat, but marked as not given');
  assert.deepEqual(read({ startTime: '25:99' }).given, { startTime: false, people: false });
});
