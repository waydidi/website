import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['lib/transfer-routes.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { TRANSFER_ROUTES, TRANSFER_CITIES, cityRoutes, transferHubs, transferCity } = await import('data:text/javascript,' + encodeURIComponent(result.outputFiles[0].text));

test('every route place belongs to a city with a hub name', () => {
  for (const route of TRANSFER_ROUTES) for (const place of [route.from, route.to]) assert.ok(transferCity(place.destination), place.slug);
  assert.equal(new Set(TRANSFER_CITIES.map(c => c.slug)).size, TRANSFER_CITIES.length);
});

test('the catalogue includes the added Bangkok routes in both directions', () => {
  for (const place of ['sukhothai', 'khao-yai', 'rayong', 'sai-yok', 'laem-chabang', 'chiang-mai']) {
    assert.ok(TRANSFER_ROUTES.some(r => r.slug === `bangkok-to-${place}`), `to ${place}`);
    assert.ok(TRANSFER_ROUTES.some(r => r.slug === `${place}-to-bangkok`), `from ${place}`);
  }
});

test('a hub separates routes leaving a city from routes arriving', () => {
  const { from, to } = cityRoutes(TRANSFER_ROUTES, 'pattaya');
  assert.ok(from.length && from.every(r => r.from.destination === 'pattaya'));
  assert.ok(to.length && to.every(r => r.to.destination === 'pattaya'));
});

test('a city with no priced route gets no hub, and an empty price list gets none at all', () => {
  const airport = TRANSFER_ROUTES.filter(r => r.slug === 'bkk-airport-to-bangkok');
  assert.deepEqual(transferHubs(airport).map(c => c.slug), ['bangkok']);
  assert.deepEqual(transferHubs([]), []);
  assert.equal(transferCity('not-a-city'), undefined);
});
