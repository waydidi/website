import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// /trip and /place in the Telegram Admin group: reading what staff type (no AI, no database).
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const r = await vite.ssrLoadModule('/lib/telegram/trip-builder-rules.ts');

test('only /trip and /place start the builder (also with the bot name)', () => {
  assert.equal(r.parseTripCommand('/trip 12 Dec, Grand Palace, THB 3,500'), '12 Dec, Grand Palace, THB 3,500');
  assert.equal(r.parseTripCommand('/Trip@WaydidiBot x'), 'x');
  assert.equal(r.parseTripCommand('/trip'), '');
  for (const other of ['/trips x', '/tripx', 'trip x', 'please /trip x', '/place x', '/c x']) assert.equal(r.parseTripCommand(other), null, other);
  assert.equal(r.parsePlaceCommand('/place Wat Saket | 07:00-19:00'), 'Wat Saket | 07:00-19:00');
  assert.equal(r.parsePlaceCommand('/places x'), null);
});

test('the price must be typed with a currency; it is never guessed', () => {
  assert.deepEqual(r.parseStaffPrice('Grand Palace, SUV, THB 3,500'), { ok: true, thb: 3500 });
  assert.deepEqual(r.parseStaffPrice('ราคา 3500 บาท'), { ok: true, thb: 3500 });
  assert.deepEqual(r.parseStaffPrice('price ฿2,800'), { ok: true, thb: 2800 });
  assert.deepEqual(r.parseStaffPrice('4200 baht total'), { ok: true, thb: 4200 });
  assert.equal(r.parseStaffPrice('2 adults, 12 Dec, Grand Palace 08:00').ok, false, 'numbers without a currency are not a price');
  assert.equal(r.parseStaffPrice('Grand Palace, SUV').reason, 'missing');
  const two = r.parseStaffPrice('car THB 3,000, tickets THB 1,000');
  assert.deepEqual([two.ok, two.reason, two.amounts], [false, 'ambiguous', [3000, 1000]]);
  assert.deepEqual(r.parseStaffPrice('tickets THB 1,000, price THB 3,000'), { ok: true, thb: 3000 }, 'the labelled amount wins');
  assert.deepEqual(r.parseStaffPrice('THB 3500 ... THB 3,500'), { ok: true, thb: 3500 }, 'the same amount twice is one price');
  assert.equal(r.parseStaffPrice('THB 0').ok, false);
});

test('the named car is used when it fits; otherwise the smallest car that fits', () => {
  assert.deepEqual(r.pickVehicle('2 adults, SUV', 2, 2), { ok: true, vehicle: 'comfort_suv' });
  assert.deepEqual(r.pickVehicle('รถตู้ 8 คน', 8, 4), { ok: true, vehicle: 'premium_minivan' });
  assert.deepEqual(r.pickVehicle('2 adults', 2, 1), { ok: true, vehicle: 'economy_sedan' });
  assert.deepEqual(r.pickVehicle('6 adults', 6, 2), { ok: true, vehicle: 'premium_minivan' });
  assert.deepEqual(r.pickVehicle('6 adults, sedan', 6, 2), { ok: false, vehicle: 'economy_sedan' }, 'a named car that is too small is refused');
  assert.deepEqual(r.pickVehicle('20 people', 20, 2), { ok: false, vehicle: null });
});

test('/place: name first, then opening hours, area and time spent in any order', () => {
  assert.deepEqual(r.parsePlaceDetails('Wat Saket | 07:00-19:00 | Bangkok | 60 min'), { name: 'Wat Saket', openTime: '07:00', closeTime: '19:00', durationMin: 60, area: 'Bangkok' });
  assert.deepEqual(r.parsePlaceDetails('Jodd Fairs | Bangkok | 1.5 ชม. | 16:00 - 24:00'), { name: 'Jodd Fairs', openTime: '16:00', closeTime: '23:59', durationMin: 90, area: 'Bangkok' });
  assert.deepEqual(r.parsePlaceDetails('Big C'), { name: 'Big C', openTime: null, closeTime: null, durationMin: null, area: '' });
  assert.equal(r.parsePlaceDetails('x'), null);
  assert.equal(r.parsePlaceDetails(''), null);
});

test('opening hours and time spent in the usual ways staff write them', () => {
  assert.deepEqual(r.parseOpeningHours('9-17'), { openTime: '09:00', closeTime: '17:00' });
  assert.deepEqual(r.parseOpeningHours('8.30–16.30'), { openTime: '08:30', closeTime: '16:30' });
  assert.deepEqual(r.parseOpeningHours('9am - 5pm'), { openTime: '09:00', closeTime: '17:00' });
  assert.deepEqual(r.parseOpeningHours('เปิด 08:00 ถึง 18:00'), { openTime: '08:00', closeTime: '18:00' });
  assert.deepEqual(r.parseOpeningHours('24 hours'), { openTime: '00:00', closeTime: '23:59' });
  assert.equal(r.parseOpeningHours('17:00-09:00'), null, 'closing before opening is refused');
  assert.equal(r.parseOpeningHours('Bangkok'), null);
  assert.equal(r.parseDuration('45 นาที'), 45);
  assert.equal(r.parseDuration('2 hr'), 120);
  assert.equal(r.parseDuration('2 days'), null);
  assert.equal(r.parseDuration('1 min'), null);
});

test('the feature is off unless TELEGRAM_TRIP_BUILDER=1', () => {
  assert.equal(r.tripBuilderOn({}), false);
  assert.equal(r.tripBuilderOn({ TELEGRAM_TRIP_BUILDER: 'true' }), false);
  assert.equal(r.tripBuilderOn({ TELEGRAM_TRIP_BUILDER: '1' }), true);
});

test('/place finds the existing place by its name, ignoring case, "The" and a bracketed part', () => {
  const rows = [
    { id: 'pho', name: 'Wat Pho (Reclining Buddha)', customerName: null, createdAt: '2026-10-04' },
    { id: 'gp-new', name: 'Grand Palace', customerName: null, createdAt: '2026-10-22T16:16' },
    { id: 'gp-the', name: 'The Grand Palace', customerName: null, createdAt: '2026-10-22T16:17' },
    { id: 'gp-kaew', name: 'Grand Palace and Wat Phra Kaew', customerName: null, createdAt: '2026-10-04' },
    { id: 'saket', name: 'Golden Mount', customerName: 'Wat Saket', createdAt: '2026-10-04' },
    { id: 'th', name: 'วัดโพธิ์', customerName: null, createdAt: '2026-10-04' },
  ];
  const id = (name) => r.matchPlace(name, rows)?.id ?? null;
  assert.equal(id('Wat Pho'), 'pho');
  assert.equal(id('wat pho (reclining buddha)'), 'pho');
  assert.equal(id('The Grand Palace'), 'gp-the', 'the exact name wins');
  assert.equal(id('grand palace'), 'gp-new');
  assert.equal(id('Grand Palace!'), 'gp-new', 'then the oldest of the same place');
  assert.equal(id('wat saket'), 'saket', 'the customer name counts');
  assert.equal(id('วัดโพธิ์'), 'th');
  for (const other of ['Wat Phra Kaew', 'Wat', 'Wat Pho Market', '()']) assert.equal(id(other), null, other);
});

test('"/trip create a new trip" and other text with no date, time or price asks for the guide, not a trip', () => {
  for (const ask of ['', 'help', 'create a new trip', 'How do I make a trip?', '?', 'สร้างทริปใหม่', 'วิธีสร้างทริป', 'Grand Palace, Wat Pho, SUV']) assert.equal(r.wantsTripGuide(ask), true, ask);
  for (const trip of ['12 Dec, Hilton 08:00, Grand Palace, THB 3,500', 'tomorrow Hilton 8am Grand Palace 3500 baht', '๑๒ ธ.ค. รับ Hilton', 'Helping hands tour 12 Dec THB 2,000']) assert.equal(r.wantsTripGuide(trip), false, trip);
  for (const line of ['วันที่', 'สถานที่ที่จะไป', 'เพิ่มจาก Google Maps', 'ราคาตามเรทรายชั่วโมง', 'จุดรับและเวลารับ', 'รอยืนยัน', '/trip Big Buddha', 'แพ็กเกจ']) assert.ok(r.TRIP_HELP.includes(line), line);
});

test('paste a chat: the AI reads the replied chat with the staff line as a note; without a chat, just the staff line', () => {
  assert.equal(r.tripText('THB 3,500', '  Hi, 2 adults on 12 Dec  '), 'Hi, 2 adults on 12 Dec\n\n(Staff note: THB 3,500)');
  assert.equal(r.tripText('12 Dec, Grand Palace, THB 3,000', ''), '12 Dec, Grand Palace, THB 3,000');
  assert.equal(r.tripText('', 'Hi'), 'Hi\n\n(Staff note: none)');
});

// Google Places regularOpeningHours periods (day 0 is Sunday).
const period = (day, open, close, closeDay = day) => {
  const [oh, om] = open.split(':').map(Number), [ch, cm] = close.split(':').map(Number);
  return { open: { day, hour: oh, minute: om }, close: { day: closeDay, hour: ch, minute: cm } };
};
const week = (open, close, days = [0, 1, 2, 3, 4, 5, 6]) => days.map((d) => period(d, open, close));

test("/place without hours: Google Maps' weekly hours become one open and close time and the closed days", () => {
  assert.deepEqual(r.hoursFromGoogle(week('08:30', '17:00')), { openTime: '08:30', closeTime: '17:00', closedDays: [], varies: false });
  // Closed on Monday (a museum).
  assert.deepEqual(r.hoursFromGoogle(week('09:00', '16:00', [0, 2, 3, 4, 5, 6])), { openTime: '09:00', closeTime: '16:00', closedDays: [1], varies: false });
  // A lunch break is bridged: open 08:00 to 17:00.
  assert.deepEqual(r.hoursFromGoogle([0, 1, 2, 3, 4, 5, 6].flatMap((d) => [period(d, '08:00', '12:00'), period(d, '13:00', '17:00')])),
    { openTime: '08:00', closeTime: '17:00', closedDays: [], varies: false });
  // Open 24 hours: Google sends one period that never closes.
  assert.deepEqual(r.hoursFromGoogle([{ open: { day: 0, hour: 0, minute: 0 } }]), { openTime: '00:00', closeTime: '23:59', closedDays: [], varies: false });
  // A night market open past midnight ends at 23:59 (the planner works within one day).
  assert.deepEqual(r.hoursFromGoogle([4, 5, 6].map((d) => period(d, '17:00', '01:00', (d + 1) % 7))), { openTime: '17:00', closeTime: '23:59', closedDays: [0, 1, 2, 3], varies: false });
  // Different weekend hours: the hours most days have, flagged as varying.
  assert.deepEqual(r.hoursFromGoogle([...week('09:00', '18:00', [1, 2, 3, 4, 5]), ...week('08:00', '20:00', [0, 6])]),
    { openTime: '09:00', closeTime: '18:00', closedDays: [], varies: true });
  // A tie goes to Monday's hours.
  assert.equal(r.hoursFromGoogle([period(1, '10:00', '16:00'), period(2, '09:00', '17:00')]).openTime, '10:00');
});

test('no usable hours from Google: nothing is filled in', () => {
  for (const bad of [undefined, [], null, 'x', [{}], [{ open: { day: 9, hour: 9 }, close: { day: 9, hour: 17 } }], [{ open: { day: 1, hour: 30 }, close: { day: 1, hour: 17 } }], [{ open: { day: 1, hour: 9 } }, { open: { day: 2, hour: 9 } }]])
    assert.equal(r.hoursFromGoogle(bad), null, JSON.stringify(bad));
});

test('the /place confirmation says the hours came from Google Maps, the closed days, and when hours differ by day', () => {
  assert.equal(r.placeHoursLineTh({ openTime: '09:00', closeTime: '16:00', closedDays: [1] }, { openTime: '09:00', closeTime: '16:00', closedDays: [1], varies: false }),
    'เปิด 09:00–16:00 · ปิดวันจันทร์ (จาก Google Maps)');
  assert.match(r.placeHoursLineTh({ openTime: '09:00', closeTime: '18:00', closedDays: [] }, { openTime: '09:00', closeTime: '18:00', closedDays: [], varies: true }), /จาก Google Maps · เวลาไม่เท่ากันทุกวัน/);
  assert.equal(r.placeHoursLineTh({ openTime: '07:00', closeTime: '19:00', closedDays: [] }, null), 'เปิด 07:00–19:00', 'typed by staff: no source note');
  assert.match(r.placeHoursLineTh({ openTime: null, closeTime: null, closedDays: [] }, null), /^ยังไม่มีเวลาเปิด/);
});
