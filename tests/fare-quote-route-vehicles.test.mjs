import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).filter(s => s.trim());
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
await d1.prepare('UPDATE price_seasons SET active = 0').run();
globalThis.__fareEnv = { DB: d1, GOOGLE_MAPS_SERVER_KEY: 'mock', RATE_LIMIT_SALT: 'test-private-salt' };
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, plugins: [{ name: 'fare-env', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers') return '\0fare-env'; }, load(id) { if (id === '\0fare-env') return 'export const env=globalThis.__fareEnv'; } }], server: { middlewareMode: true } });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await vite.close(); await mf.dispose(); delete globalThis.__fareEnv; });

const places = { bangkok: { latitude: 13.7466, longitude: 100.5347 }, airport: { latitude: 13.69, longitude: 100.7501 }, pattaya: { latitude: 12.9346, longitude: 100.8836 } };
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://places.googleapis.com/v1/places/')) { const id = u.split('/').at(-1).split('?')[0]; return Response.json({ id, formattedAddress: id, location: places[id] }); }
  if (u.startsWith('https://routes.googleapis.com/')) return Response.json({ routes: [{ distanceMeters: 150000, duration: '8400s' }] });
  throw Error('Unexpected network: ' + u);
};

const route = await vite.ssrLoadModule('/app/api/fare-quote/route.ts');
const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const all = ['economy_sedan', 'comfort_bmw', 'comfort_suv', 'premium_minivan'];
let seq = 0;
const quote = async (pickupPlaceId, dropoffPlaceId) => {
  const response = await route.POST(new Request('https://waydidi.com/api/fare-quote', { method: 'POST', headers: { origin: 'https://waydidi.com', 'content-type': 'application/json', 'cf-connecting-ip': `fare-${seq++}` }, body: JSON.stringify({ pickupPlaceId, dropoffPlaceId, pickupDate: date, pickupTime: '12:30', timezone: 'Asia/Bangkok' }) }));
  return { status: response.status, body: await response.json() };
};
const area = async (id, geometry, vehicles, pricingType) => {
  await d1.prepare("INSERT INTO pricing_areas(id,name,code,status,published_geometry_json,created_at,updated_at) VALUES(?,?,?,'published',?,'x','x')").bind(id, id, id, JSON.stringify([geometry])).run();
  if (pricingType) await d1.prepare('UPDATE pricing_areas SET pricing_type=? WHERE id=?').bind(pricingType, id).run();
  for (const vehicle of vehicles) await d1.prepare("INSERT INTO pricing_rules(id,area_id,vehicle_id,base_price,updated_at) VALUES(?,?,?,2000,'x')").bind(`${id}-${vehicle}`, id, vehicle).run();
};
const pattayaBox = [{ lat: 12.6, lng: 100.7 }, { lat: 13.1, lng: 100.7 }, { lat: 13.1, lng: 101.1 }, { lat: 12.6, lng: 101.1 }];
const airportBox = [{ lat: 13.6, lng: 100.7 }, { lat: 13.8, lng: 100.7 }, { lat: 13.8, lng: 100.9 }, { lat: 13.6, lng: 100.9 }];

beforeEach(async () => {
  await d1.prepare('DELETE FROM pricing_rules').run();
  await d1.prepare('DELETE FROM fare_quotes').run();
  await d1.prepare('DELETE FROM pricing_areas').run();
});

test('Bangkok to Pattaya gets a quote with three cars and no Comfort BMW', async () => {
  await area('pattaya', pattayaBox, all);
  const { status, body } = await quote('bangkok', 'pattaya');
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(Object.keys(body.prices).sort(), ['comfort_suv', 'economy_sedan', 'premium_minivan']);
  const saved = await d1.prepare('SELECT vehicle_prices_json AS p FROM fare_quotes WHERE id=?').bind(body.quoteId).first();
  assert.equal('comfort_bmw' in JSON.parse(saved.p), false);
});

test('Bangkok to its airport still needs and sells all four cars', async () => {
  await area('airport', airportBox, all);
  const { status, body } = await quote('bangkok', 'airport');
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(Object.keys(body.prices).length, 4);
});

test('a missing Comfort BMW price still refuses a Bangkok airport route', async () => {
  await area('airport', airportBox, all.filter(v => v !== 'comfort_bmw'));
  const { status, body } = await quote('bangkok', 'airport');
  assert.equal(status, 422);
  assert.equal(body.manualReview, true);
  assert.equal(body.quoteId, undefined);
});

test('a missing price for any car sold on an intercity route goes to manual review', async () => {
  for (const vehicle of ['economy_sedan', 'comfort_suv', 'premium_minivan']) {
    await d1.prepare('DELETE FROM pricing_rules').run();
    await d1.prepare('DELETE FROM pricing_areas').run();
    await area('pattaya', pattayaBox, all.filter(v => v !== vehicle));
    const { status, body } = await quote('bangkok', 'pattaya');
    assert.equal(status, 422, vehicle);
    assert.equal(body.manualReview, true, vehicle);
  }
  assert.equal((await d1.prepare('SELECT count(*) n FROM fare_quotes').first()).n, 0);
});

test('an inactive rule counts as a missing price', async () => {
  await area('pattaya', pattayaBox, all);
  await d1.prepare("UPDATE pricing_rules SET active=0 WHERE vehicle_id='comfort_suv'").run();
  const { status, body } = await quote('bangkok', 'pattaya');
  assert.equal(status, 422);
  assert.equal(body.manualReview, true);
});

test('a manual area and an unknown destination stay on manual review', async () => {
  await area('pattaya', pattayaBox, all, 'manual');
  const manual = await quote('bangkok', 'pattaya');
  assert.equal(manual.status, 422);
  assert.equal(manual.body.manualReview, true);
});
