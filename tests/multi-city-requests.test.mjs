import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__multiCityEnv = { DB: d1, RATE_LIMIT_SALT: 'isolated-test-secret', MULTI_CITY_REQUESTS: '1' };
globalThis.__multiCityAlerts = [];
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, plugins: [{ name: 'multi-city-boundaries', enforce: 'pre', resolveId(id) {
  if (id === 'cloudflare:workers') return '\0multi-city-env';
  if (id.endsWith('/lib/email')) return '\0multi-city-email';
}, load(id) {
  if (id === '\0multi-city-env') return 'export const env=globalThis.__multiCityEnv';
  if (id === '\0multi-city-email') return 'export async function sendFormAlert(input){globalThis.__multiCityAlerts.push(input);if(globalThis.__multiCityAlertFails)throw new Error("email down");return {status:"sent"}}';
} }], server: { middlewareMode: true } });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__multiCityEnv; delete globalThis.__multiCityAlerts; delete globalThis.__multiCityAlertFails; });

const route = await vite.ssrLoadModule('/app/api/multi-city-requests/route.ts');
const rules = await vite.ssrLoadModule('/lib/multi-city.ts');

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const body = (over = {}) => ({
  requestId: crypto.randomUUID(), name: 'Test Passenger', phone: '+66123456789', email: 'test@example.invalid', passengers: 3, luggage: 2, note: 'Two car seats',
  legs: [{ from: 'Bangkok', to: 'Ayutthaya', date: day(10), time: '09:00' }, { from: 'Ayutthaya', to: 'Sukhothai', date: day(12), time: '10:00' }], ...over,
});
const post = (input, headers = {}) => route.POST(new Request('https://waydidi.test/api/multi-city-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) }));
const forms = async () => (await d1.prepare('SELECT * FROM booking_forms ORDER BY created_at').all()).results;

beforeEach(async () => {
  await d1.prepare('DELETE FROM booking_forms').run();
  // Each test starts with a clean rate-limit window; the limit itself has its own test.
  await d1.prepare('DELETE FROM checkout_attempts').run();
  globalThis.__multiCityEnv.MULTI_CITY_REQUESTS = '1';
  globalThis.__multiCityAlerts.length = 0;
  globalThis.__multiCityAlertFails = false;
});

test('a valid request reaches the staff queue with every leg, and creates no booking', async () => {
  const response = await post(body());
  assert.equal(response.status, 200, await response.clone().text());
  const [form] = await forms();
  assert.equal(form.status, 'submitted');
  assert.equal(form.service_type, 'transfer');
  assert.equal(JSON.parse(form.answers).pickup, 'Bangkok');
  assert.equal(JSON.parse(form.answers).vehicle, 'comfort_suv');
  assert.match(form.note, /1\) .* Bangkok -> Ayutthaya/);
  assert.match(form.note, /2\) .* Ayutthaya -> Sukhothai/);
  assert.match(form.note, /Customer note: Two car seats/);
  assert.equal(globalThis.__multiCityAlerts.length, 1);
  assert.equal(globalThis.__multiCityAlerts[0].price, null);
  assert.equal((await d1.prepare('SELECT count(*) AS n FROM bookings').first()).n, 0);
});

test('with the Worker variable off or unset the endpoint does not exist', async () => {
  for (const value of ['0', undefined]) {
    globalThis.__multiCityEnv.MULTI_CITY_REQUESTS = value;
    assert.equal((await post(body())).status, 404);
  }
  assert.equal((await forms()).length, 0);
});

test('another origin and a non-JSON request are refused', async () => {
  assert.equal((await post(body(), { Origin: 'https://evil.example' })).status, 403);
  const plain = await route.POST(new Request('https://waydidi.test/api/multi-city-requests', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body()) }));
  assert.equal(plain.status, 403);
  assert.equal((await forms()).length, 0);
});

test('invalid journeys are refused', async () => {
  const leg = (date, time = '09:00') => ({ from: 'Bangkok', to: 'Pattaya', date, time });
  const cases = {
    'one leg': { legs: [leg(day(10))] },
    'seven legs': { legs: Array.from({ length: 7 }, (_, i) => leg(day(10 + i))) },
    'out of order': { legs: [leg(day(12)), leg(day(10))] },
    'same start twice': { legs: [leg(day(10)), leg(day(10))] },
    'in the past': { legs: [leg('2020-01-01'), leg('2020-01-02')] },
    'bad email': { email: 'nope' },
    'too many passengers': { passengers: 21 },
    'fractional passengers': { passengers: 1.5 },
    'bad request id': { requestId: 'not-a-uuid' },
  };
  for (const [name, over] of Object.entries(cases)) assert.equal((await post(body(over))).status, 400, name);
  assert.equal((await forms()).length, 0);
});

test('a retry with the same id saves one request and alerts staff once', async () => {
  const input = body();
  assert.equal((await post(input)).status, 200);
  const retry = await post(input);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).reused, true);
  assert.equal((await forms()).length, 1);
  assert.equal(globalThis.__multiCityAlerts.length, 1);
});

test('the same id with different details is refused rather than overwritten', async () => {
  const input = body();
  assert.equal((await post(input)).status, 200);
  assert.equal((await post({ ...input, name: 'Someone Else' })).status, 409);
  const [form] = await forms();
  assert.equal(JSON.parse(form.answers).name, 'Test Passenger');
});

test('two identical requests at once save one request and alert staff once', async () => {
  const input = body();
  const responses = await Promise.all([post(input), post(input)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal((await forms()).length, 1);
  assert.equal(globalThis.__multiCityAlerts.length, 1);
});

test('a failed staff email does not lose the request', async () => {
  globalThis.__multiCityAlertFails = true;
  assert.equal((await post(body())).status, 200);
  assert.equal((await forms()).length, 1);
});

test('repeated requests from one visitor are rate limited', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await post(body())).status, 200, `request ${i}`);
  assert.equal((await post(body())).status, 429);
  assert.equal((await forms()).length, 10);
});

test('a group too big for any car still reaches staff', async () => {
  assert.equal((await post(body({ passengers: 15 }))).status, 200);
  assert.equal(JSON.parse((await forms())[0].answers).vehicle, 'premium_minivan');
});

test('the staff note omits the customer note line when there is none', () => {
  const legs = [{ from: 'A town', to: 'B town', date: '2030-01-01', time: '09:00' }];
  assert.doesNotMatch(rules.multiCityNote({ legs, note: '' }), /Customer note/);
});
