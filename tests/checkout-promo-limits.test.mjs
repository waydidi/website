import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// Checkout saves the booking with its promo use, commissions and sources in one batch: a code's last use can't be
// taken twice, and a booking is never saved without the records its price and partner payouts depend on.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
globalThis.__promoLimitEnv = { DB: d1, RATE_LIMIT_SALT: 'test-only-secret', STRIPE_SECRET_KEY: 'sk_test_promo_limits', STRIPE_PUBLISHABLE_KEY: 'pk_test_promo_limits' };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'promo-limit-boundaries', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0promo-limit-env'; if (id.endsWith('/lib/booking-fulfillment')) return '\0promo-limit-delivery'; },
  load(id) { if (id === '\0promo-limit-env') return 'export const env=globalThis.__promoLimitEnv'; if (id === '\0promo-limit-delivery') return 'export async function fulfillBooking(){return {emailStatus:"pending"}}'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__promoLimitEnv; });
const checkout = await vite.ssrLoadModule('/app/api/checkout/route.ts');
const { ensureAffiliateTables } = await vite.ssrLoadModule('/lib/affiliates.ts');

const now = new Date().toISOString(), date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
await d1.prepare('UPDATE price_seasons SET active=0').run();

async function quote() {
  const id = crypto.randomUUID();
  await d1.prepare(`INSERT INTO fare_quotes (id,pickup_place_id,dropoff_place_id,pickup_text,dropoff_text,area_id,area_name,distance_meters,duration_seconds,vehicle_prices_json,pricing_version,departure_date,departure_time,timezone,expires_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, 'test-pickup', 'test-dropoff', 'Suvarnabhumi Airport', 'Pattaya', 'sample-pattaya', 'Pattaya', 125000, 6000,
    JSON.stringify({ economy_sedan: { total: 1400, basePrice: 1400, distanceSurcharge: 0 } }), 1, date, '09:00', 'Asia/Bangkok', new Date(Date.now() + 1800000).toISOString(), now).run();
  return id;
}
async function promo(code, extra = {}) {
  const row = { id: crypto.randomUUID(), max_uses: null, per_customer_limit: 1, ...extra };
  await d1.prepare(`INSERT INTO promo_codes (id,code,title,discount_type,discount_value,min_fare,max_uses,per_customer_limit,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(row.id, code, `Test ${code}`, 'fixed', 100, 0, row.max_uses, row.per_customer_limit, 'active', now, now).run();
  return row.id;
}
let customer = 0;
async function book(extra = {}) {
  customer++;
  const body = { checkoutAttemptId: crypto.randomUUID(), customerName: 'Test', customerSurname: `Traveller${customer}`, customerEmail: `traveller${customer}@example.invalid`, customerPhone: `+668123${String(customer).padStart(5, '0')}`,
    pickup: 'Suvarnabhumi Airport', dropoff: 'Pattaya', pickupDate: date, pickupTime: '09:00', timezone: 'Asia/Bangkok', passengers: 2, luggage: 1, vehicle: 'economy_sedan', childSeats: 0, exchangeStop: false,
    oversizedLuggage: false, termsAccepted: true, paymentMethod: 'cash', fareQuoteId: await quote(), ...extra };
  const response = await checkout.POST(new Request('https://example.invalid/api/checkout', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${customer % 250}` }, body: JSON.stringify(body) }));
  const json = await response.json();
  return { status: response.status, json, email: body.customerEmail, reference: json.reference };
}
const bookingsFor = async (email) => (await d1.prepare('SELECT reference,total FROM bookings WHERE customer_email=?').bind(email).all()).results;
const uses = async (promoId) => (await d1.prepare('SELECT COUNT(*) n FROM promo_redemptions WHERE promo_id=?').bind(promoId).first()).n;

test('a code used once applies its discount and records the use with the booking', async () => {
  const id = await promo('ONCEONLY', { max_uses: 5 });
  const result = await book({ promoCode: 'ONCEONLY' });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  assert.deepEqual(await bookingsFor(result.email), [{ reference: result.reference, total: 1300 }]);
  const use = await d1.prepare('SELECT * FROM promo_redemptions WHERE booking_reference=?').bind(result.reference).first();
  assert.equal(use.promo_id, id); assert.equal(use.discount, 100); assert.equal(use.final_total, 1300);
});

test('two checkouts at once cannot both take the last use of a code', async () => {
  const id = await promo('LASTONE', { max_uses: 1 });
  const results = await Promise.all([book({ promoCode: 'LASTONE' }), book({ promoCode: 'LASTONE' }), book({ promoCode: 'LASTONE' })]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => [r.status, r.json])));
  for (const r of results.filter((x) => x.status !== 200)) {
    assert.equal(r.status, 409); assert.equal(r.json.code, 'PROMO_INVALID');
    assert.deepEqual(await bookingsFor(r.email), [], 'a refused checkout leaves no booking behind');
  }
  assert.equal(await uses(id), 1);
});

test('one customer cannot use a once-per-customer code twice by checking out twice at once', async () => {
  const id = await promo('PERPERSON', { max_uses: 100, per_customer_limit: 1 });
  const same = { customerEmail: 'same.person@example.invalid', customerPhone: '+66899999999' };
  const results = await Promise.all([book({ promoCode: 'PERPERSON', ...same }), book({ promoCode: 'PERPERSON', ...same })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await bookingsFor('same.person@example.invalid')).length, 1);
  assert.equal(await uses(id), 1);
  // A different person still can.
  assert.equal((await book({ promoCode: 'PERPERSON' })).status, 200);
});

test('an unpaid, expired booking gives its use back', async () => {
  await promo('COMEBACK', { max_uses: 1 });
  const first = await book({ promoCode: 'COMEBACK' });
  assert.equal(first.status, 200);
  assert.equal((await book({ promoCode: 'COMEBACK' })).status, 409);
  await d1.prepare("UPDATE bookings SET status='expired' WHERE reference=?").bind(first.reference).run();
  assert.equal((await book({ promoCode: 'COMEBACK' })).status, 200);
});

test('a partner code books with its commission, source and discount use in the same save', async () => {
  await ensureAffiliateTables();
  await d1.prepare("INSERT INTO affiliates (id,slug,code,name,email,commission_percent,discount_percent,status,created_at,updated_at) VALUES ('aff-1','partner-one','PARTNER5','Partner One','partner@example.invalid',8,5,'active',?,?)").bind(now, now).run();
  const result = await book({ promoCode: 'PARTNER5' });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  const link = await d1.prepare('SELECT * FROM booking_affiliates WHERE booking_reference=?').bind(result.reference).first();
  assert.equal(link.affiliate_id, 'aff-1'); assert.equal(link.via, 'code'); assert.ok(link.commission > 0);
  assert.equal((await d1.prepare('SELECT source FROM booking_sources WHERE booking_reference=?').bind(result.reference).first()).source, 'aff:partner-one');
  assert.equal((await d1.prepare('SELECT promo_id FROM promo_redemptions WHERE booking_reference=?').bind(result.reference).first()).promo_id, 'affiliate');
});

test('a store QR booking saves the store commission and special-price use with the booking', async () => {
  await d1.prepare("INSERT INTO storefronts (id,slug,name,discount_percent,commission_percent,active,created_at,updated_at) VALUES ('store-1','corner-shop','Corner Shop',10,5,1,?,?)").bind(now, now).run();
  const result = await book({ source: 'store:corner-shop' });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  const link = await d1.prepare('SELECT * FROM booking_storefronts WHERE booking_reference=?').bind(result.reference).first();
  assert.equal(link.storefront_id, 'store-1'); assert.equal(link.discount, 140); assert.ok(link.commission > 0);
  assert.equal((await d1.prepare('SELECT source FROM booking_sources WHERE booking_reference=?').bind(result.reference).first()).source, 'store:corner-shop');
  assert.equal((await d1.prepare('SELECT promo_id FROM promo_redemptions WHERE booking_reference=?').bind(result.reference).first()).promo_id, 'storefront');
});

test('if a commission record cannot be saved, the booking is not saved either', async () => {
  await d1.prepare("CREATE TRIGGER test_block_affiliate BEFORE INSERT ON booking_affiliates BEGIN SELECT RAISE(ABORT, 'test-only failure'); END").run();
  try {
    const result = await book({ promoCode: 'PARTNER5' });
    assert.equal(result.status, 503);
    assert.deepEqual(await bookingsFor(result.email), [], 'no booking without its partner commission');
    assert.equal((await d1.prepare('SELECT COUNT(*) n FROM promo_redemptions r LEFT JOIN bookings b ON b.reference=r.booking_reference WHERE b.reference IS NULL').first()).n, 0);
  } finally { await d1.prepare('DROP TRIGGER test_block_affiliate').run(); }
});

test('an unknown or invalid code is still refused before anything is saved', async () => {
  const result = await book({ promoCode: 'NOSUCHCODE' });
  assert.equal(result.status, 409); assert.equal(result.json.code, 'PROMO_INVALID');
  assert.deepEqual(await bookingsFor(result.email), []);
});
