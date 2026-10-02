import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = (await readFile(root + '/drizzle/' + name, 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
// Base-price tests: seasons are switched off here and checked on their own below.
await d1.prepare('UPDATE price_seasons SET active = 0').run();
globalThis.__hourlyTestEnv = { DB: d1, GOOGLE_MAPS_SERVER_KEY: 'mock', RATE_LIMIT_SALT: 'isolated-test-secret' };
globalThis.__hourlyAdmin = true;
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'hourly-boundaries', enforce: 'pre', resolveId(id) {
  if (id === 'cloudflare:workers') return '\0hourly-env';
  if (id.endsWith('/lib/booking-fulfillment')) return '\0hourly-fulfillment';
  if (id.endsWith('/lib/admin')) return '\0hourly-admin';
}, load(id) {
  if (id === '\0hourly-env') return 'export const env=globalThis.__hourlyTestEnv';
  if (id === '\0hourly-fulfillment') return `export async function fulfillBooking(b){await globalThis.__hourlyTestEnv.DB.prepare("UPDATE bookings SET status='confirmed',fulfillment_status='complete' WHERE reference=?").bind(b.reference).run()}`;
  if (id === '\0hourly-admin') return 'export async function getWaydidiAdmin(){return globalThis.__hourlyAdmin?{email:"audit@example.invalid"}:null}';
} }], server: { middlewareMode: true } });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await vite.close(); await mf.dispose(); delete globalThis.__hourlyTestEnv; delete globalThis.__hourlyAdmin; });
const policy = await vite.ssrLoadModule('/lib/hourly-policy.ts');
const pricing = await vite.ssrLoadModule('/lib/hourly-city-pricing.ts');
const validation = await vite.ssrLoadModule('/lib/booking-validation.ts');
const quoteRoute = await vite.ssrLoadModule('/app/api/hourly-quote/route.ts');
const checkout = await vite.ssrLoadModule('/app/api/checkout/route.ts');
const admin = await vite.ssrLoadModule('/app/api/admin/hourly-city-pairs/route.ts');
const operations = await vite.ssrLoadModule('/app/api/hourly-requests/route.ts');
const adminForms = await vite.ssrLoadModule('/app/api/admin/forms/route.ts');
const date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const dates = { pickupDate: date, pickupTime: '10:00', timezone: 'Asia/Bangkok' };
let seq = 0, duration = 7200;
const places = {
  bangkok: [13.7563, 100.5018], pattaya: [12.9236, 100.8825], ayutthaya: [14.3532, 100.5684], kanchanaburi: [14.0228, 99.5328],
  ratchaburi: [13.5198, 99.9568, 'Ratchaburi'], maeklong: [13.4075, 100.0012, 'Samut Songkhram'],
  'khao-yai': [14.43, 101.37, 'Nakhon Ratchasima'], phuket: [7.88, 98.39], unknown: [19.95, 99.88], airport: [13.69, 100.75],
};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://places.googleapis.com/')) {
    const id = u.split('/').at(-1), p = places[id]; assert.ok(p, id);
    return Response.json({ id, formattedAddress: id, location: { latitude: p[0], longitude: p[1] }, addressComponents: p[2] ? [{ longText: p[2], types: ['administrative_area_level_1'] }] : [] });
  }
  if (u.startsWith('https://routes.googleapis.com/')) return Response.json({ routes: [{ distanceMeters: 150000, duration: duration + 's', polyline: { encodedPolyline: 'mock-route' } }] });
  throw new Error('External request blocked in test: ' + u);
};
function request(path, payload) { return new Request('https://example.invalid' + path, { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json', 'cf-connecting-ip': 'test-' + ++seq }, body: JSON.stringify(payload) }); }
async function quote(payload = {}) { const r = await quoteRoute.POST(request('/api/hourly-quote', { ...dates, areaSlug: 'bangkok', pickupPlaceId: 'bangkok', dropoffPlaceId: 'pattaya', bookedHours: 6, ...payload })); return { status: r.status, body: await r.json() }; }
function checkoutInput(q, overrides = {}) { return { ...dates, checkoutAttemptId: crypto.randomUUID(), customerName: 'Test', customerSurname: 'Passenger', customerEmail: 'test@example.invalid', customerPhone: '+66123456789', pickup: 'Bangkok', dropoff: 'Pattaya', passengers: 1, luggage: 0, vehicle: 'economy_sedan', childSeats: 0, oversizedLuggage: false, termsAccepted: true, paymentMethod: 'cash', serviceType: 'hourly', hourlyQuoteId: q.quoteId, bookedHours: q.bookedHours, ...overrides }; }

test('approved pairs quote identical prices in both directions, including market and park areas', async () => {
  for (const destination of ['pattaya', 'ayutthaya', 'ratchaburi', 'maeklong', 'khao-yai', 'kanchanaburi']) {
    const a = await quote({ dropoffPlaceId: destination });
    const b = await quote({ pickupPlaceId: destination, dropoffPlaceId: 'bangkok' });
    assert.equal(a.status, 200, JSON.stringify(a.body)); assert.equal(b.status, 200, JSON.stringify(b.body));
    assert.deepEqual(a.body.prices, b.body.prices);
    assert.deepEqual(Object.values(a.body.prices).map(p => p.total), [2500, 2900, 3500]);
    assert.equal(a.body.prices.comfort_bmw, undefined);
  }
});
test('actual endpoints set pair price even with an unrelated service area', async () => {
  const result = await quote({ areaSlug: 'phuket', bookedHours: 3 });
  assert.equal(result.status, 200); assert.equal(result.body.bookedHours, 6);
  assert.equal(result.body.area.id, 'phuket'); assert.equal(result.body.cityPairId, 'bangkok-pattaya');
  assert.equal(result.body.prices.economy_sedan.total, 2500);
});
test('local 6-hour sedan costs 1800 and has explicit unlimited distance and included tolls', async () => {
  const result = await quote({ dropoffPlaceId: 'bangkok', areaSlug: 'phuket' });
  assert.equal(result.status, 200); assert.equal(result.body.cityToCity, false);
  assert.equal(result.body.prices.economy_sedan.total, 1800);
  assert.equal(result.body.inclusions.unlimitedKilometres, true); assert.equal(result.body.inclusions.tollsIncluded, true);
});
test('an active season raises the hourly price, and only the highest overlapping season applies', async () => {
  await d1.batch([
    d1.prepare("INSERT INTO price_seasons (id,name,starts_on,ends_on,repeats_yearly,adjustment_type,adjustment,service,active,created_at,updated_at) VALUES ('t-low','Test low',?,?,0,'percent',10,'all',1,'x','x')").bind(date, date),
    d1.prepare("INSERT INTO price_seasons (id,name,starts_on,ends_on,repeats_yearly,adjustment_type,adjustment,service,active,created_at,updated_at) VALUES ('t-high','Test high',?,?,0,'percent',20,'hourly',1,'x','x')").bind(date, date),
  ]);
  try {
    const result = await quote({ dropoffPlaceId: 'bangkok', areaSlug: 'phuket' });
    assert.equal(result.status, 200);
    assert.equal(result.body.prices.economy_sedan.total, 2200); // 1800 + 20% = 2160, rounded up to 50
    assert.equal(result.body.prices.economy_sedan.seasonName, 'Test high');
  } finally { await d1.prepare("DELETE FROM price_seasons WHERE id IN ('t-low','t-high')").run(); }
});
test('airport pickup belongs to Bangkok pricing', async () => {
  const result = await quote({ pickupPlaceId: 'airport' }); assert.equal(result.status, 200); assert.equal(result.body.cityPairId, 'bangkok-pattaya');
});
test('unsupported, unverified and unusually long itineraries require operations without saving prices', async () => {
  for (const input of [
    { dropoffPlaceId: 'phuket' }, { pickupPlaceId: 'unknown' },
    { pickupPlaceId: undefined, pickupText: 'Chiang Rai Airport' },
    { dropoffPlaceId: undefined, dropoffText: 'Pattaya' },
  ]) { const r = await quote(input); assert.equal(r.status, 422); assert.equal(r.body.manualReview, true); assert.equal(r.body.quoteId, undefined); }
  duration = 22000; const long = await quote(); duration = 7200;
  assert.equal(long.status, 422); assert.match(long.body.error, /unusually long/);
});
test('legacy API cannot bypass area selection or hourly duration limits', async () => {
  assert.equal((await quote({ areaSlug: undefined })).status, 400);
  for (const h of [1, 2, 11, 12]) assert.equal((await quote({ bookedHours: h })).status, 400);
  assert.equal((await quote({ bookedHours: 3, dropoffPlaceId: undefined })).status, 200);
});
test('all package defaults match the confirmed price schedule', async () => {
  const pair = (await pricing.hourlyCityPairSettings())[0];
  assert.deepEqual([6, 7, 8, 9, 10].map(h => pricing.cityPairPrices(pair, h).premium_minivan.total), [3500, 3800, 4100, 4300, 4500]);
  assert.deepEqual([6, 7, 8, 9, 10].map(h => pricing.cityPairPrices(pair, h).economy_sedan.total), [2500, 2800, 3100, 3400, 3700]);
});
test('checkout stores destination coordinates, route and fixed overtime rates', async () => {
  const q = (await quote()).body;
  const response = await checkout.POST(request('/api/checkout', checkoutInput(q)));
  const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
  const row = await d1.prepare('SELECT * FROM bookings WHERE hourly_quote_id=?').bind(q.quoteId).first();
  assert.equal(row.total, 2500); assert.equal(row.dropoff_latitude, places.pattaya[0]); assert.equal(row.dropoff_longitude, places.pattaya[1]);
  assert.equal(row.route_distance_meters, 150000); assert.equal(row.extra_hour_rate, 300); assert.equal(row.extra_distance_rate, 0);
});
test('quotes last exactly 30 minutes and expired or pre-policy quotes cannot check out', async () => {
  const q = (await quote()).body;
  const row = await d1.prepare('SELECT * FROM hourly_quotes WHERE id=?').bind(q.quoteId).first();
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 1800000);
  await d1.prepare('UPDATE hourly_quotes SET expires_at=? WHERE id=?').bind(new Date(Date.now() - 1).toISOString(), q.quoteId).run();
  const r = await checkout.POST(request('/api/checkout', checkoutInput(q))); assert.equal(r.status, 409); assert.equal((await r.json()).code, 'HOURLY_QUOTE_EXPIRED');
  const legacy = (await quote()).body;
  await d1.prepare("UPDATE hourly_quotes SET expires_at='9999-12-31T23:59:59.999Z',pricing_version=1 WHERE id=?").bind(legacy.quoteId).run();
  const old = await checkout.POST(request('/api/checkout', checkoutInput(legacy))); assert.equal(old.status, 409); assert.equal((await old.json()).code, 'HOURLY_QUOTE_EXPIRED');
});
test('admin edits affect new quotes while existing 30-minute rates remain locked', async () => {
  const old = (await quote({ bookedHours: 7 })).body;
  const pair = (await pricing.hourlyCityPairSettings())[0]; pair.rates.economy_sedan.c7 = 3000;
  const save = await admin.POST(request('/api/admin/hourly-city-pairs', pair)); assert.equal(save.status, 200, await save.text());
  const current = (await quote({ bookedHours: 7 })).body; assert.equal(current.prices.economy_sedan.total, 3000);
  const result = await checkout.POST(request('/api/checkout', checkoutInput(old))); assert.equal(result.status, 200, await result.text());
  const b = await d1.prepare('SELECT total FROM bookings WHERE hourly_quote_id=?').bind(old.quoteId).first(); assert.equal(b.total, 2800);
  pair.rates.economy_sedan.c7 = 2800; assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 200);
});
test('admin rejects free prices, decreasing packages and unauthenticated changes', async () => {
  const pair = (await pricing.hourlyCityPairSettings())[0]; pair.rates.economy_sedan.c6 = 0;
  assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 400);
  pair.rates.economy_sedan.c6 = 4000; assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 400);
  globalThis.__hourlyAdmin = false;
  try { assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 401); } finally { globalThis.__hourlyAdmin = true; }
});
test('disabled vehicles vanish from new quotes and cannot use old quotes at checkout', async () => {
  const old = (await quote()).body, pair = (await pricing.hourlyCityPairSettings())[0];
  pair.rates.economy_sedan.active = false; assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 200);
  assert.equal((await quote()).body.prices.economy_sedan, undefined);
  const r = await checkout.POST(request('/api/checkout', checkoutInput(old))); assert.equal(r.status, 409); assert.equal((await r.json()).code, 'HOURLY_UNAVAILABLE');
  pair.rates.economy_sedan.active = true; assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 200);
});
test('database failure never silently restores default prices or re-enables availability', async () => {
  const bound = globalThis.__hourlyTestEnv.DB; globalThis.__hourlyTestEnv.DB = { prepare() { throw new Error('TEST_DB_UNAVAILABLE'); } };
  try { assert.equal((await quote()).status, 503); } finally { globalThis.__hourlyTestEnv.DB = bound; }
});
test('15-minute overtime grace and started-hour rounding use vehicle-specific rates', () => {
  for (const rate of [300, 350, 400]) {
    for (const [minutes, hours] of [[0, 0], [15, 0], [15.01, 1], [60, 1], [60.01, 2], [120, 2]]) assert.equal(policy.hourlyOvertime(minutes, rate).total, hours * rate);
  }
});
test('BMW and 1-2 hour local bookings are rejected consistently at checkout', () => {
  const base = checkoutInput({ quoteId: crypto.randomUUID(), bookedHours: 6 });
  assert.equal(validation.checkoutInputSchema.safeParse({ ...base, vehicle: 'comfort_bmw' }).success, false);
  for (const h of [1, 2]) assert.equal(validation.checkoutInputSchema.safeParse({ ...base, bookedHours: h }).success, false);
});
test('operations submission is idempotent and appears in the existing admin queue', async () => {
  const answers = { name: 'Test Passenger', phone: '+66123456789', email: 'test@example.invalid', pickup: 'Bangkok', dropoff: 'Phuket', hours: 6, date, time: '10:00', passengers: 1, luggage: 0, vehicle: 'economy_sedan', childSeats: 0, exchangeStop: false, ferryPeople: 0 };
  const input = { requestId: crypto.randomUUID(), areaSlug: 'bangkok', note: 'Unsupported pair', answers };
  for (let i = 0; i < 2; i++) { const r = await operations.POST(request('/api/hourly-requests', input)); assert.equal(r.status, 200, await r.text()); }
  const forms = await (await adminForms.GET()).json();
  const rows = forms.forms.filter(f => f.note?.includes('Unsupported pair')); assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'submitted'); assert.equal(rows[0].answers.dropoff, 'Phuket'); assert.equal(rows[0].serviceType, 'hourly');
  const b = await d1.prepare("SELECT count(*) AS n FROM bookings WHERE dropoff='Phuket'").first(); assert.equal(b.n, 0);
});

test('city-pair admin save rolls back every vehicle when one update fails', async () => {
  const pair = (await pricing.hourlyCityPairSettings())[0];
  const before = pair.rates.economy_sedan.c6;
  await d1.exec("CREATE TRIGGER audit_pair_failure BEFORE UPDATE ON hourly_city_pair_rates WHEN NEW.vehicle_id='comfort_suv' BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
  try {
    pair.rates.economy_sedan.c6 = before + 1;
    assert.equal((await admin.POST(request('/api/admin/hourly-city-pairs', pair))).status, 503);
    assert.equal((await pricing.hourlyCityPairSettings())[0].rates.economy_sedan.c6, before);
  } finally { await d1.exec('DROP TRIGGER audit_pair_failure;'); }
});
test('overtime assessment and partial cash receipts are bounded, idempotent and preserve the base payment', async () => {
  const q = (await quote()).body;
  const checkoutResult = await checkout.POST(request('/api/checkout', checkoutInput(q)));
  assert.equal(checkoutResult.status, 200, await checkoutResult.text());
  const b = await d1.prepare('SELECT * FROM bookings WHERE hourly_quote_id=?').bind(q.quoteId).first();
  const payments = await vite.ssrLoadModule('/app/api/admin/payments/route.ts');
  async function action(payload) { return payments.POST(request('/api/admin/payments', { reference: b.reference, ...payload })); }
  const assessed = await action({ action: 'assess_hourly_overtime', extraMinutes: 15 }); assert.equal(assessed.status, 200, await assessed.text());
  assert.equal((await d1.prepare('SELECT amount_minor FROM hourly_overtime_charges WHERE booking_reference=?').bind(b.reference).first()).amount_minor, 0);
  assert.equal((await action({ action: 'assess_hourly_overtime', extraMinutes: 16 })).status, 200);
  const receiptId = crypto.randomUUID();
  for (let i = 0; i < 2; i++) assert.equal((await action({ action: 'collect_hourly_overtime', amountMinor: 10000, receiptId })).status, 200);
  assert.equal((await action({ action: 'collect_hourly_overtime', amountMinor: 30000, receiptId: crypto.randomUUID() })).status, 409);
  assert.equal((await action({ action: 'assess_hourly_overtime', extraMinutes: 120 })).status, 409);
  const results = await Promise.all([1, 2].map(() => action({ action: 'collect_hourly_overtime', amountMinor: 20000, receiptId: crypto.randomUUID() })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const dashboard = await (await payments.GET()).json(); const row = dashboard.rows.find(r => r.reference === b.reference);
  assert.equal(row.overtimeReceivedMinor, 30000); assert.equal(row.overtimeDueMinor, 0); assert.equal(row.receivedMinor, 30000); assert.equal(row.cashDueMinor, 250000);
  const stored = await d1.prepare('SELECT total,amount_paid,payment_status FROM bookings WHERE reference=?').bind(b.reference).first();
  assert.equal(stored.total, 2500); assert.equal(stored.amount_paid, 0); assert.equal(stored.payment_status, 'cash_due');
});
