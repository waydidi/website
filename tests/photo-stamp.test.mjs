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

test('the stamp covers the bottom 30% of the picture, under a 30% dark overlay', () => {
  assert.equal(stamp.STAMP_HEIGHT_SHARE, 0.3);
 assert.equal(stamp.STAMP_OVERLAY_OPACITY, 0.3);
 assert.equal(stamp.STAMP_COVER_OPACITY, 1); // photos from the phone's camera app: solid, hiding that app's own panel
});

test('the text is 1.5 px smaller and the logo 10% bigger than before; pictures are saved as large as the server accepts', () => {
 // At the 480 px wide reference picture: the text was 26.4 px (0.055) and is now about 24.9 px; the logo was 115.2 px (0.24), now 126.7 px.
 assert.ok(Math.abs(480 * 0.055 - 480 * stamp.STAMP_TEXT_WIDTH_SHARE - 1.5) < 0.05);
 assert.ok(Math.abs(stamp.STAMP_LOGO_WIDTH_SHARE / 0.24 - 1.1) < 1e-9);
 // Never enlarged; at most 1600 px on a side and under 2 megapixels, the same shape.
 assert.deepEqual(stamp.fitForUpload(480, 640), { width: 480, height: 640 });
 assert.deepEqual(stamp.fitForUpload(1600, 1200), { width: 1600, height: 1200 });
 for (const [w, h] of [[4000, 3000], [3000, 4000], [1920, 1080], [1080, 1920], [4032, 4032], [1700, 100], [100, 3000]]) {
  const fit = stamp.fitForUpload(w, h);
  assert.ok(fit.width <= 1600 && fit.height <= 1600, `${w}x${h} fits 1600`);
  assert.ok(fit.width * fit.height <= 2_000_000, `${w}x${h} under 2 MP`);
  assert.ok(Math.abs(fit.width / fit.height / (w / h) - 1) < 0.02, `${w}x${h} keeps its shape`);
 }
 assert.deepEqual(stamp.fitForUpload(3000, 4000), { width: 1200, height: 1600 });
 assert.ok(stamp.UPLOAD_JPEG_QUALITY >= 0.9);
});
