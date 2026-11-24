import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { isRideId, newRideId, parseRideSearch, rideSearchKey, rideUrl } from '../lib/ride-search-rules.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const valid = { pickupPlaceId: 'ChIJ_bkk_airport_1', dropoffPlaceId: 'ChIJ-sukhumvit-24', pickup: 'Suvarnabhumi Airport (BKK)', dropoff: 'Marriott Executive Apartments, Bangkok', date: '2026-12-01', time: '09:30', adults: 2, children: 1, luggage: 3 };

test('ride IDs are 32 random hex characters and the address is /reservation?ride=…', () => {
  const a = newRideId(), b = newRideId();
  assert.match(a, /^[0-9a-f]{32}$/); assert.notEqual(a, b);
  assert.equal(isRideId(a), true);
  for (const bad of ['', 'ABC', a.toUpperCase(), a + '0', '../' + a.slice(3), null, 42]) assert.equal(isRideId(bad), false, String(bad));
  assert.equal(rideUrl(a), `/reservation?ride=${a}`);
});

test('a valid search is read once into trip inputs only', () => {
  const ride = parseRideSearch({ ...valid, name: 'Somchai', email: 'x@example.com', phone: '0812345678' });
  assert.deepEqual(ride, { ...valid, returnDate: null, returnTime: null });
  assert.deepEqual(parseRideSearch({ ...valid, returnDate: '2026-12-05', returnTime: '18:00' })?.returnTime, '18:00');
  assert.equal(parseRideSearch({ ...valid, pickup: 'x'.repeat(500) })?.pickup.length, 300);
});

test('invalid searches are refused', () => {
  for (const change of [
    { pickupPlaceId: 'bad id!' }, { dropoffPlaceId: '' }, { pickup: '  ' }, { date: '2026-13-01' }, { date: '1/12/2026' },
    { time: '24:00' }, { adults: 0 }, { adults: 1.5 }, { children: -1 }, { luggage: 41 }, { adults: 15, children: 6 },
    { returnDate: '2026-12-05' }, { returnDate: '2026-12-05', returnTime: 'evening' },
  ]) assert.equal(parseRideSearch({ ...valid, ...change }), null, JSON.stringify(change));
  for (const junk of [null, 'text', [], 7]) assert.equal(parseRideSearch(junk), null);
});

test('the same trip gives the same key, a changed trip a new one', () => {
  const a = parseRideSearch(valid), b = parseRideSearch({ ...valid });
  assert.equal(rideSearchKey(a), rideSearchKey(b));
  assert.notEqual(rideSearchKey(a), rideSearchKey(parseRideSearch({ ...valid, time: '10:00' })));
});

// Save and open through the real routes and an in-memory D1 (the table is made on first use).
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
await d1.prepare('CREATE TABLE checkout_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint_hash TEXT NOT NULL, created_at TEXT NOT NULL)').run();
globalThis.__rideEnv = { DB: d1, RATE_LIMIT_SALT: 'test-salt' };
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, plugins: [{ name: 'ride-env', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers') return '\0ride-env'; }, load(id) { if (id === '\0ride-env') return 'export const env=globalThis.__rideEnv'; } }], server: { middlewareMode: true } });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__rideEnv; });
const save = await vite.ssrLoadModule('/app/api/ride-search/route.ts');
const open = await vite.ssrLoadModule('/app/api/ride-search/[id]/route.ts');
const post = (body, { ip = '1.1.1.1', origin = 'https://waydidi.com', type = 'application/json' } = {}) => save.POST(new Request('https://waydidi.com/api/ride-search', { method: 'POST', headers: { origin, 'content-type': type, 'cf-connecting-ip': ip }, body: JSON.stringify(body) }));
const get = (id) => open.GET(new Request(`https://waydidi.com/api/ride-search/${id}`), { params: Promise.resolve({ id }) });

test('a saved search opens again by its ride ID, with no personal details stored', async () => {
  const response = await post({ ...valid, email: 'x@example.com' });
  assert.equal(response.status, 200);
  const { ride } = await response.json();
  assert.equal(isRideId(ride), true);
  const opened = await get(ride);
  assert.equal(opened.status, 200);
  assert.deepEqual((await opened.json()).ride, { ...valid, returnDate: null, returnTime: null });
  const row = await d1.prepare('SELECT search_json FROM ride_searches WHERE id = ?').bind(ride).first();
  assert.doesNotMatch(row.search_json, /example\.com/);
});

test('other sites, bad bodies, unknown, malformed and expired IDs are refused', async () => {
  assert.equal((await post(valid, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(valid, { type: 'text/plain' })).status, 403);
  assert.equal((await post({ ...valid, date: 'soon' })).status, 400);
  assert.equal((await get('0'.repeat(32))).status, 404);
  assert.equal((await get('not-a-ride')).status, 404);
  const { ride } = await (await post(valid, { ip: '2.2.2.2' })).json();
  await d1.prepare("UPDATE ride_searches SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(ride).run();
  assert.equal((await get(ride)).status, 404);
  // Saving a new search clears expired ones.
  await post(valid, { ip: '3.3.3.3' });
  assert.equal(await d1.prepare('SELECT id FROM ride_searches WHERE id = ?').bind(ride).first(), null);
});

test('two saves at once get two different rides, and one visitor is limited', async () => {
  const [a, b] = await Promise.all([post(valid, { ip: '4.4.4.4' }), post(valid, { ip: '4.4.4.4' })]);
  const [ra, rb] = [(await a.json()).ride, (await b.json()).ride];
  assert.notEqual(ra, rb);
  for (let i = 0; i < 58; i++) assert.equal((await post(valid, { ip: '4.4.4.4' })).status, 200);
  assert.equal((await post(valid, { ip: '4.4.4.4' })).status, 429);
  assert.equal((await post(valid, { ip: '5.5.5.5' })).status, 200);
});
