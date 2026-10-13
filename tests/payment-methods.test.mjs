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
globalThis.__pmEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'pm-test', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0pm-env'; }, load(id) { if (id === '\0pm-env') return 'export const env=globalThis.__pmEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const pm = await vite.ssrLoadModule('/lib/payment-methods.ts');
const manual = await vite.ssrLoadModule('/lib/manual-booking.ts');
const { cashReceiptStatements } = await vite.ssrLoadModule('/lib/cash-collection.ts');
const { acceptsSlips } = await vite.ssrLoadModule('/lib/payment-slips.ts');
const { legacyPaymentProvider } = await vite.ssrLoadModule('/lib/payment-model.ts');
const { confirmationPaymentLabel } = await vite.ssrLoadModule('/lib/confirmation-payment.ts');

test('what each payment method means', () => {
  assert.equal(pm.isOfflinePayment('cash'), true);
  assert.equal(pm.isOfflinePayment('transfer'), true);
  assert.equal(pm.isOfflinePayment('stripe'), false);
  assert.equal(pm.collectsCashAtPickup('cash'), true);
  assert.equal(pm.collectsCashAtPickup('transfer'), false, 'the driver never collects a transfer');
  assert.equal(pm.unpaidStatusFor('transfer'), 'pending');
  assert.equal(pm.unpaidStatusFor('cash'), 'cash_due');
  assert.equal(pm.paymentLabel('transfer', 'pending', 2500), 'Waiting for payment (bank transfer)');
  assert.equal(pm.paymentLabel('transfer', 'paid', 2500), 'Paid by bank transfer');
  assert.equal(pm.paymentLabel('transfer', 'pending', 0), 'Nothing to pay');
  assert.match(pm.paymentLabelThai('transfer', 'pending'), /ไม่ต้องเก็บเงินสด/);
  assert.equal(legacyPaymentProvider('transfer'), 'cash', 'transfers use the offline cash-receipt ledger');
  assert.equal(confirmationPaymentLabel('transfer', 'pending', 2500), 'Waiting for payment (bank transfer)');
  assert.equal(confirmationPaymentLabel('cash', 'cash_due', 2500), 'Cash due at pickup', 'cash wording unchanged');
});

test('Create booking: Paid, Pay in cash and Waiting for payment', () => {
  assert.deepEqual(manual.manualPaymentFields('paid', 2500), { paymentMethod: 'manual', paymentStatus: 'paid' });
  assert.deepEqual(manual.manualPaymentFields('cash', 2500), { paymentMethod: 'cash', paymentStatus: 'cash_due' });
  assert.deepEqual(manual.manualPaymentFields('waiting', 2500), { paymentMethod: 'transfer', paymentStatus: 'pending' });
  assert.deepEqual(manual.manualPaymentFields('waiting', 0), { paymentMethod: 'manual', paymentStatus: 'paid' }, 'nothing to pay is paid');
  assert.equal(manual.manualPayment({ payment: 'waiting' }), 'waiting');
  assert.equal(manual.manualPayment({ paid: true }), 'paid', 'older callers still work');
  assert.equal(manual.manualPayment({ paid: false }), 'cash');
  assert.equal(manual.manualBookingSchema.safeParse({ payment: 'later' }).success, false);
});

let n = 0;
async function booking(method, status, total = 1000) {
  const ref = `PM${++n}X`;
  await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,fulfillment_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(ref, 'A', 'a@example.invalid', 'BKK', 'Pattaya', '2099-01-01', '09:00', 2, 1, 'economy_sedan', method, total, 'confirmed', status, 0, 'x', 'complete', 'x', 'x').run();
  return ref;
}
const record = (ref, id, minor) => d1.batch(cashReceiptStatements(d1, { receiptId: id, reference: ref, amountMinor: minor, collectedBy: 'finance@example.invalid', note: 'test', now: 'x' }));
const row = (ref) => d1.prepare('SELECT payment_status,amount_paid FROM bookings WHERE reference=?').bind(ref).first();

test('a transfer is recorded in the same ledger: partly paid stays waiting, fully paid is paid', async () => {
  const ref = await booking('transfer', 'pending');
  await record(ref, 't1', 40000);
  assert.deepEqual(await row(ref), { payment_status: 'pending', amount_paid: 400 }, 'a part payment never turns into cash for the driver');
  await record(ref, 't1', 40000);
  assert.deepEqual(await row(ref), { payment_status: 'pending', amount_paid: 400 }, 'retrying the same receipt records it once');
  const over = await record(ref, 't2', 70000);
  assert.equal(over[0].meta.changes, 0, 'never above the total');
  await record(ref, 't3', 60000);
  assert.deepEqual(await row(ref), { payment_status: 'paid', amount_paid: 1000 });
});

test('cash bookings behave as before', async () => {
  const ref = await booking('cash', 'cash_due');
  await record(ref, 'c1', 40000);
  assert.deepEqual(await row(ref), { payment_status: 'cash_due', amount_paid: 400 });
});

test('card bookings cannot take offline receipts; transfer bookings take slips', async () => {
  const ref = await booking('stripe', 'pending');
  assert.equal((await record(ref, 's1', 10000))[0].meta.changes, 0);
  assert.equal(acceptsSlips({ payment_method: 'transfer', status: 'confirmed', outstandingMinor: 100 }), true);
  assert.equal(acceptsSlips({ payment_method: 'stripe', status: 'confirmed', outstandingMinor: 100 }), false);
});
