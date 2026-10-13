import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// The text burned into the bottom of a GPS camera photo: latitude, longitude, time (Thailand time).
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const stamp = await vite.ssrLoadModule('/lib/photo-stamp.ts');

test('the stamp has latitude, longitude and the time, with the time in Thailand whatever the phone says', () => {
  const lines = stamp.stampLines({ latitude: 13.7563094, longitude: 100.5017651, accuracy: 8 }, '2026-10-13T10:39:05Z');
  assert.deepEqual(lines, ['Waydidi GPS Camera', 'Latitude: 13.756309', 'Longitude: 100.501765', 'Time: 13/10/2026 17:39:05 (UTC+7)']);
});

test('the date rolls over at Thailand midnight, and southern/western coordinates keep their sign', () => {
  assert.equal(stamp.stampTime('2026-10-13T17:00:00Z'), '14/10/2026 00:00:00');
  assert.equal(stamp.stampTime('2026-12-31T16:59:59Z'), '31/12/2026 23:59:59');
  assert.equal(stamp.stampLines({ latitude: -33.8688, longitude: -70.5 }, '2026-10-13T10:39:05Z')[1], 'Latitude: -33.868800');
});

test('the stamp covers the bottom 30% of the picture', () => {
  assert.equal(stamp.STAMP_HEIGHT_SHARE, 0.3);
});
