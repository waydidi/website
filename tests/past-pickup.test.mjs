import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Admin → New booking: a pickup (or return) that has already passed can't be saved.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'env', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers') return '\0env'; }, load(id) { if (id === '\0env') return 'export const env={}'; } }] });
after(() => vite.close());
const { pastPickupProblem: problem } = await vite.ssrLoadModule('/lib/booking-time.ts');
// 13 Oct 2026 19:30 in Bangkok.
const now = new Date('2026-10-13T19:30:00+07:00').getTime();

test('a pickup that has passed, or is right now, is refused; a later one is fine (even at short notice)', () => {
  assert.match(problem({ pickupDate: '2026-10-13', pickupTime: '09:00' }, now), /already passed/);
  assert.match(problem({ pickupDate: '2026-10-12', pickupTime: '23:59' }, now), /already passed/);
  assert.match(problem({ pickupDate: '2026-10-13', pickupTime: '19:30' }, now), /already passed/);
  assert.equal(problem({ pickupDate: '2026-10-13', pickupTime: '19:45' }, now), null); // staff may book at short notice
  assert.equal(problem({ pickupDate: '2026-10-14', pickupTime: '09:00' }, now), null);
});

test('the date and time must be real, and a return must come after the pickup and not be in the past', () => {
  assert.match(problem({ pickupDate: '', pickupTime: '09:00' }, now), /Choose the pickup/);
  assert.match(problem({ pickupDate: '2026-10-14', pickupTime: '' }, now), /Choose the pickup/);
  assert.equal(problem({ pickupDate: '2026-10-14', pickupTime: '09:00', returnDate: '', returnTime: '' }, now), null); // no return trip
  assert.match(problem({ pickupDate: '2026-10-14', pickupTime: '09:00', returnDate: '2026-10-14', returnTime: '' }, now), /Choose the return/);
  assert.match(problem({ pickupDate: '2026-10-14', pickupTime: '09:00', returnDate: '2026-10-14', returnTime: '08:00' }, now), /after the pickup/);
  assert.match(problem({ pickupDate: '2026-10-14', pickupTime: '09:00', returnDate: '2026-10-14', returnTime: '09:00' }, now), /after the pickup/);
  assert.equal(problem({ pickupDate: '2026-10-14', pickupTime: '09:00', returnDate: '2026-10-16', returnTime: '10:00' }, now), null);
});

test('the Admin booking save refuses a past pickup (the same check the form uses)', async () => {
  const { manualBookingProblem } = await vite.ssrLoadModule('/lib/manual-booking.ts');
  const base = { serviceType: 'transfer', dropoff: 'Hotel', vehicle: 'economy_sedan', pickupDate: '2020-01-01', pickupTime: '09:00' };
  assert.match(manualBookingProblem(base), /already passed/);
  assert.equal(manualBookingProblem({ ...base, pickupDate: '2099-01-01' }), null);
  assert.match(manualBookingProblem({ ...base, pickupDate: '2099-01-01', returnDate: '2098-01-01', returnTime: '09:00' }), /after the pickup/);
  // A tour or hourly booking has no return trip: only the pickup is checked.
  assert.equal(manualBookingProblem({ ...base, serviceType: 'tour', pickupDate: '2099-01-01', returnDate: '2098-01-01', returnTime: '09:00' }), null);
});
