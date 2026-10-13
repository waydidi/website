import { migrationStatements } from './helpers/migrations.mjs';
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
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__beEnv = { DB: d1 };
globalThis.__admin = { email: 'owner@example.invalid', displayName: 'Owner', role: 'owner' };
globalThis.__republished = [];
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'be-test', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0be-env'; if (id.endsWith('/lib/admin')) return '\0be-admin'; if (id.endsWith('/lib/telegram/booking-changes')) return '\0be-tg'; },
  load(id) {
    if (id === '\0be-env') return 'export const env=globalThis.__beEnv';
    if (id === '\0be-admin') return 'export async function getWaydidiAdmin(){return globalThis.__admin}';
    if (id === '\0be-tg') return 'export async function notifyBookingEdited(ref){globalThis.__republished.push(ref)}';
  } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const rules = await vite.ssrLoadModule('/lib/booking-edit.ts');
const quick = await vite.ssrLoadModule('/lib/quick-book-rules.ts');
const paymentRoute = await vite.ssrLoadModule('/app/api/admin/bookings/[reference]/payment/route.ts');
const bookingRoute = await vite.ssrLoadModule('/app/api/admin/bookings/[reference]/route.ts');

const row = { reference: 'R', serviceType: 'transfer', pickup: 'BKK', dropoff: 'Pattaya', pickupDate: '2099-01-01', pickupTime: '09:00', returnDate: null, returnTime: null, vehicle: 'economy_sedan', passengers: 2, luggage: 1,
  customerName: 'Tayla', customerSurname: 'Smith', customerPhone: '+61 400', customerEmail: 't@example.invalid', flightNumber: null, childSeats: 0, specialRequests: null, paymentMethod: 'cash', paymentStatus: 'cash_due' };

test('the payment choice shown for each booking', () => {
  assert.equal(rules.paymentChoiceOf('manual', 'paid'), 'paid');
  assert.equal(rules.paymentChoiceOf('cash', 'cash_due'), 'cash');
  assert.equal(rules.paymentChoiceOf('cash', 'paid'), 'paid');
  assert.equal(rules.paymentChoiceOf('transfer', 'pending'), 'waiting');
  assert.equal(rules.paymentChoiceOf('stripe', 'paid'), null, 'card payments are not editable');
  assert.equal(rules.editableFrom(row).payment, 'cash');
});

test('customer details and extras are validated; missing fields keep their value', () => {
  const d = rules.parseDetails({ customerName: '  Tayla   Kaye ', customerEmail: 'NEW@Example.com', flightNumber: 'tg 123', childSeats: 2 }, row);
  assert.deepEqual(d, { customerName: 'Tayla Kaye', customerSurname: 'Smith', customerPhone: '+61 400', customerEmail: 'new@example.com', flightNumber: 'TG123', childSeats: 2, specialRequests: null });
  assert.equal(rules.detailsChanged(d, row), true);
  assert.equal(rules.detailsChanged(rules.parseDetails({}, row), row), false);
  assert.match(rules.parseDetails({ customerEmail: 'nope' }, row).error, /email/);
  assert.match(rules.parseDetails({ childSeats: 5 }, row).error, /Child seats/);
  assert.match(rules.parseDetails({ customerName: '' }, row).error, /name/);
  assert.match(rules.parseDetails({ customerPhone: '12' }, row).error, /phone/);
});

test('changing the payment: what each change does and who may do it', () => {
  const b = (method, status, received = 0) => ({ paymentMethod: method, paymentStatus: status, totalMinor: 100000, receivedMinor: received });
  assert.match(rules.planPaymentChange(b('stripe', 'paid'), 'cash', 'owner').error, /Card/);
  assert.deepEqual(rules.planPaymentChange(b('cash', 'cash_due'), 'cash', 'operations'), { kind: 'none' });
  assert.deepEqual(rules.planPaymentChange(b('cash', 'cash_due'), 'waiting', 'operations'), { kind: 'switch', paymentMethod: 'transfer', paymentStatus: 'pending' });
  assert.deepEqual(rules.planPaymentChange(b('transfer', 'pending', 30000), 'cash', 'operations'), { kind: 'switch', paymentMethod: 'cash', paymentStatus: 'cash_due' });
  assert.match(rules.planPaymentChange(b('cash', 'cash_due'), 'paid', 'operations').error, /owner or finance/);
  assert.deepEqual(rules.planPaymentChange(b('transfer', 'pending', 30000), 'paid', 'finance'), { kind: 'record', amountMinor: 70000 }, 'only the remaining balance');
  assert.match(rules.planPaymentChange(b('cash', 'paid', 100000), 'waiting', 'owner').error, /paid in full/);
  assert.match(rules.planPaymentChange(b('manual', 'paid'), 'cash', 'operations').error, /owner or finance/);
  assert.deepEqual(rules.planPaymentChange(b('manual', 'paid'), 'waiting', 'owner'), { kind: 'switch', paymentMethod: 'transfer', paymentStatus: 'pending' });
});

test('LINE quick book: typed prices and price buttons', () => {
  assert.deepEqual(quick.parsePriceReply('3400'), { price: 3400, payment: 'cash' });
  assert.deepEqual(quick.parsePriceReply('฿3,400 THB'), { price: 3400, payment: 'cash' });
  assert.deepEqual(quick.parsePriceReply('3400 โอน'), { price: 3400, payment: 'waiting' });
  assert.deepEqual(quick.parsePriceReply('3400 transfer'), { price: 3400, payment: 'waiting' });
  assert.deepEqual(quick.parsePriceReply('3400 cash'), { price: 3400, payment: 'cash' });
  assert.equal(quick.parsePriceReply('3400 tomorrow'), null, 'unknown words are not guessed');
  assert.equal(quick.parsePriceReply('hello'), null);
  assert.deepEqual(quick.parseBookPostback('book:tok:3400:waiting'), { token: 'tok', price: 3400, payment: 'waiting' });
  assert.deepEqual(quick.parseBookPostback('book:tok:3400'), { token: 'tok', price: 3400, payment: 'cash' });
  assert.equal(quick.parseBookPostback('book:tok:abc'), null);
});

let n = 0;
async function seed(method, status, total = 1000) {
  const ref = `ED${++n}X`;
  await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,fulfillment_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(ref, 'Tayla', 'Smith', 't@example.invalid', '+61 400', 'BKK', 'Pattaya', '2099-01-01', '09:00', 2, 1, 'economy_sedan', method, total, 'confirmed', status, 0, 'x', 'complete', 'x', 'x').run();
  return ref;
}
const pay = (ref, payment) => paymentRoute.POST(new Request(`https://waydidi.com/api/admin/bookings/${ref}/payment`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://waydidi.com' }, body: JSON.stringify({ payment }) }), { params: Promise.resolve({ reference: ref }) });
const state = (ref) => d1.prepare("SELECT payment_method,payment_status,amount_paid,(SELECT COUNT(*) FROM cash_receipts WHERE booking_reference=bookings.reference) AS receipts FROM bookings WHERE reference=?").bind(ref).first();

test('operations switch cash to waiting for payment; the driver gets the updated job', async () => {
  globalThis.__admin = { email: 'ops@example.invalid', displayName: 'Ops', role: 'operations' };
  const ref = await seed('cash', 'cash_due');
  const res = await pay(ref, 'waiting');
  assert.equal(res.status, 200);
  assert.deepEqual(await state(ref), { payment_method: 'transfer', payment_status: 'pending', amount_paid: 0, receipts: 0 });
  assert.ok(globalThis.__republished.includes(ref));
  const denied = await pay(ref, 'paid');
  assert.equal(denied.status, 409, 'operations cannot mark paid');
  assert.deepEqual(await state(ref), { payment_method: 'transfer', payment_status: 'pending', amount_paid: 0, receipts: 0 });
});

test('owner marks paid: the balance is recorded once, even if the request is repeated', async () => {
  globalThis.__admin = { email: 'owner@example.invalid', displayName: 'Owner', role: 'owner' };
  const ref = await seed('transfer', 'pending');
  const results = await Promise.all([pay(ref, 'paid'), pay(ref, 'paid')]);
  assert.ok(results.every((r) => r.status === 200));
  assert.deepEqual(await state(ref), { payment_method: 'transfer', payment_status: 'paid', amount_paid: 1000, receipts: 1 });
  assert.equal((await pay(ref, 'paid')).status, 200, 'already paid is fine');
  assert.equal((await pay(ref, 'cash')).status, 409, 'paid in full cannot go back');
});

test('card bookings and cancelled bookings are refused', async () => {
  const card = await seed('stripe', 'paid');
  assert.equal((await pay(card, 'cash')).status, 409);
  const cancelled = await seed('cash', 'cash_due');
  await d1.prepare("UPDATE bookings SET status='cancelled' WHERE reference=?").bind(cancelled).run();
  assert.equal((await pay(cancelled, 'waiting')).status, 409);
  assert.equal((await pay(card, 'later')).status, 400);
});

test('Edit booking saves customer details and extras without changing the price', async () => {
  const ref = await seed('cash', 'cash_due', 1500);
  const body = { customerName: 'Tayla Kaye', customerSurname: 'Whitehead', customerPhone: '+61 411 111 111', customerEmail: 'tk@example.invalid', flightNumber: 'qf 23', childSeats: 1, specialRequests: 'Baby seat please',
    pickup: 'BKK', dropoff: 'Pattaya', pickupDate: '2099-01-01', pickupTime: '09:00', vehicle: 'economy_sedan', passengers: 2, luggage: 1 };
  const res = await bookingRoute.PATCH(new Request(`https://waydidi.com/api/admin/bookings/${ref}`, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: 'https://waydidi.com' }, body: JSON.stringify(body) }), { params: Promise.resolve({ reference: ref }) });
  assert.equal(res.status, 200);
  const b = await d1.prepare('SELECT customer_name,customer_surname,customer_phone,customer_email,flight_number,child_seats,special_requests,total FROM bookings WHERE reference=?').bind(ref).first();
  assert.deepEqual(b, { customer_name: 'Tayla Kaye', customer_surname: 'Whitehead', customer_phone: '+61 411 111 111', customer_email: 'tk@example.invalid', flight_number: 'QF23', child_seats: 1, special_requests: 'Baby seat please', total: 1500 });
  const bad = await bookingRoute.PATCH(new Request(`https://waydidi.com/api/admin/bookings/${ref}`, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: 'https://waydidi.com' }, body: JSON.stringify({ ...body, customerEmail: 'nope' }) }), { params: Promise.resolve({ reference: ref }) });
  assert.equal(bad.status, 400);
});
