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
