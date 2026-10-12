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
globalThis.__slipTestEnv = { DB: d1, WAYDIDI_SLIP_PAYEE_NAMES: 'Waydidi Travel Co., Ltd.', WAYDIDI_SLIP_PAYEE_ACCOUNTS: '123-4-56789-0', WAYDIDI_SLIP_AUTO_APPROVE: '1' };
// The OCR call is replaced by whatever the test puts in globalThis.__slipRead.
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'slip-test-boundaries', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0slip-env'; if (id.endsWith('/lib/payment-slip-ocr')) return '\0slip-ocr'; },
  load(id) {
    if (id === '\0slip-env') return 'export const env=globalThis.__slipTestEnv';
    if (id === '\0slip-ocr') return 'export const slipOcrConfigured=()=>Boolean(globalThis.__slipRead); export async function readSlip(){return globalThis.__slipRead()}';
  } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__slipTestEnv; delete globalThis.__slipRead; });

const rules = await vite.ssrLoadModule('/lib/payment-slip-rules.ts');
const slips = await vite.ssrLoadModule('/lib/payment-slips.ts');

const config = rules.slipConfig(globalThis.__slipTestEnv);
const NOW = Date.parse('2026-10-12T10:00:00+07:00');
const good = { isTransferSlip: true, amountMinor: 150000, transferredAt: '2026-10-12T09:41', bankReference: '016285094152CTF07848', senderName: 'MR JOHN SMITH', receiverName: 'บจก. เวย์ดิดิ / WAYDIDI TRAVEL CO., LTD.', receiverAccount: 'xxx-x-x6789-x', bank: 'KBank', confidence: 'high', tamperSigns: [] };
const ctx = { outstandingMinor: 150000, bookingCreatedAt: '2026-10-10T03:00:00.000Z', now: NOW, config, duplicateImageElsewhere: false, duplicateBankReference: false };

test('slip rules: configuration is required and parsed', () => {
  assert.equal(rules.slipConfig({}), null);
  assert.deepEqual(config.payeeAccounts, ['1234567890']);
  assert.equal(config.autoApprove, true);
  assert.equal(rules.slipConfig({ WAYDIDI_SLIP_PAYEE_NAMES: 'x' }).autoApprove, false);
});

test('slip rules: only real image bytes are accepted', () => {
  assert.equal(rules.sniffSlipImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(rules.sniffSlipImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(rules.sniffSlipImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(rules.sniffSlipImage(new TextEncoder().encode('<svg onload=alert(1)>')), null);
});

test('slip rules: model output is validated, never trusted', () => {
  const parsed = rules.parseSlipExtraction({ is_transfer_slip: true, amount_baht: 1500.005, confidence: 'certain', tamper_signs: ['x', 5], bank_reference: ' 0162 850 ' });
  assert.equal(parsed.amountMinor, 150001);
  assert.equal(parsed.confidence, 'low');
  assert.deepEqual(parsed.tamperSigns, ['x']);
  assert.equal(parsed.bankReference, '0162850');
  assert.equal(rules.parseSlipExtraction('nonsense').isTransferSlip, false);
  assert.equal(rules.parseSlipExtraction({ amount_baht: -5 }).amountMinor, null);
});

test('slip rules: Buddhist-era years and Bangkok time', () => {
  assert.equal(rules.slipTime('2569-10-12T09:41'), Date.parse('2026-10-12T09:41:00+07:00'));
  assert.equal(rules.slipTime('2026-10-12 09:41'), Date.parse('2026-10-12T09:41:00+07:00'));
  assert.equal(rules.slipTime('12 Oct'), null);
});

test('slip rules: a clean slip for the exact balance is approved', () => {
  assert.deepEqual(rules.assessSlip(good, ctx), { decision: 'approve', reasons: [] });
});

test('slip rules: every doubt sends the slip to a person', () => {
  const reasons = (patch, c = {}) => rules.assessSlip({ ...good, ...patch }, { ...ctx, ...c }).reasons;
  assert.deepEqual(reasons({ amountMinor: 100000 }), ['amount_mismatch']);
  assert.deepEqual(reasons({ amountMinor: 200000 }), ['over_balance']);
  assert.deepEqual(reasons({ amountMinor: null }), ['amount_unreadable']);
  assert.deepEqual(reasons({}, { outstandingMinor: 0 }), ['nothing_due']);
  assert.deepEqual(reasons({ receiverName: 'Somchai Shop' }), ['payee_mismatch']);
  assert.deepEqual(reasons({ receiverAccount: 'xxx-x-x1111-x' }), ['payee_mismatch']);
  assert.deepEqual(reasons({ transferredAt: '2026-10-01T09:00' }), ['date_out_of_range']);
  assert.deepEqual(reasons({ transferredAt: '2026-10-13T09:00' }), ['date_out_of_range']);
  assert.deepEqual(reasons({ transferredAt: null }), ['date_unreadable']);
  assert.deepEqual(reasons({ confidence: 'medium' }), ['low_confidence']);
  assert.deepEqual(reasons({ isTransferSlip: false }), ['not_a_slip']);
  assert.deepEqual(reasons({ tamperSigns: ['digits misaligned'] }), ['tampering_suspected']);
  assert.deepEqual(reasons({}, { duplicateImageElsewhere: true }), ['duplicate_image']);
  assert.deepEqual(reasons({}, { duplicateBankReference: true }), ['duplicate_reference']);
  assert.deepEqual(reasons({}, { config: { ...config, autoApprove: false } }), ['auto_approve_off']);
  assert.deepEqual(rules.assessSlip(null, ctx, 'unavailable').reasons, ['ocr_unavailable']);
  assert.deepEqual(rules.assessSlip(null, ctx, 'failed').reasons, ['ocr_failed']);
});

test('slip rules: approval amounts are whole satang within the balance', () => {
  assert.equal(rules.validApprovalAmount(150000, 150000), true);
  assert.equal(rules.validApprovalAmount(150001, 150000), false);
  assert.equal(rules.validApprovalAmount(0, 150000), false);
  assert.equal(rules.validApprovalAmount(1.5, 150000), false);
  assert.equal(rules.validApprovalAmount('150000', 150000), false);
});

let sequence = 0;
async function cashBooking(total = 1500) {
  const reference = `SLIP${++sequence}`;
  const now = '2026-10-10T03:00:00.000Z';
  await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,access_token_hash,fulfillment_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(reference, 'Test Passenger', 'test@example.invalid', 'BKK', 'Pattaya', '2026-11-01', '09:00', 2, 1, 'economy_sedan', 'cash', total, 'confirmed', 'cash_due', 0, 'test', 'complete', now, now).run();
  await d1.prepare("INSERT INTO booking_payments(id,booking_reference,provider,status,amount_expected,amount_paid,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(`primary:${reference}`, reference, 'cash', 'cash_due', total, 0, now, now).run();
  return reference;
}
const jpeg = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n >> 8, 1, 2, 3]);
const booking = (reference) => d1.prepare('SELECT payment_status,amount_paid FROM bookings WHERE reference=?').bind(reference).first();
const submitAt = new Date(NOW);

test('slips: a clean slip is approved automatically and recorded as a cash receipt', async () => {
  const reference = await cashBooking();
  globalThis.__slipRead = async () => ({ ...good, bankReference: `REF-${reference}` });
  const result = await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(1), mime: 'image/jpeg', now: submitAt });
  assert.equal(result.ok, true);
  assert.equal(result.slip.status, 'approved');
  assert.deepEqual(await booking(reference), { payment_status: 'paid', amount_paid: 1500 });
  const receipt = await d1.prepare('SELECT amount_minor,collected_by FROM cash_receipts WHERE booking_reference=?').bind(reference).first();
  assert.deepEqual(receipt, { amount_minor: 150000, collected_by: 'slip-checker' });
  // The same upload again is idempotent; a booking with nothing due takes no more slips.
  assert.equal((await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(1), mime: 'image/jpeg', now: submitAt })).slip.id, result.slip.id);
  assert.equal((await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(2), mime: 'image/jpeg', now: submitAt })).status, 409);
});

test('slips: a reused bank reference or image is never approved automatically', async () => {
  const first = await cashBooking();
  globalThis.__slipRead = async () => ({ ...good, bankReference: 'SHARED-REF' });
  assert.equal((await slips.submitSlip({ reference: first, customerId: 'c1', bytes: jpeg(10), mime: 'image/jpeg', now: submitAt })).slip.status, 'approved');
  const second = await cashBooking();
  const again = await slips.submitSlip({ reference: second, customerId: 'c2', bytes: jpeg(10), mime: 'image/jpeg', now: submitAt });
  assert.equal(again.slip.status, 'needs_review');
  const [row] = (await slips.slipQueue()).filter((s) => s.id === again.slip.id);
  assert.deepEqual(row.reasons.map((r) => r.code).sort(), ['duplicate_image', 'duplicate_reference']);
  // Even a person cannot approve one bank transaction twice.
  const approve = await slips.approveSlip(again.slip.id, 150000, 'finance@example.invalid');
  assert.equal(approve.ok, false);
  assert.match(approve.error, /already approved/);
  assert.deepEqual(await booking(second), { payment_status: 'cash_due', amount_paid: 0 });
});

test('slips: without OCR every slip waits for finance, who approve within the balance only', async () => {
  globalThis.__slipRead = undefined;
  const reference = await cashBooking(2000);
  const { slip } = await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(20), mime: 'image/jpeg', now: submitAt });
  assert.equal(slip.status, 'needs_review');
  assert.equal((await slips.approveSlip(slip.id, 200001, 'finance@example.invalid')).ok, false);
  assert.equal((await slips.approveSlip(slip.id, 0, 'finance@example.invalid')).ok, false);
  assert.equal((await slips.approveSlip(slip.id, 50000, 'finance@example.invalid')).ok, true);
  assert.equal((await slips.approveSlip(slip.id, 50000, 'finance@example.invalid')).ok, true, 'retrying the same approval is safe');
  assert.equal((await slips.approveSlip(slip.id, 60000, 'finance@example.invalid')).ok, false);
  assert.deepEqual(await booking(reference), { payment_status: 'cash_due', amount_paid: 500 });
  assert.equal((await slips.rejectSlip(slip.id, 'no', 'finance@example.invalid')).ok, false, 'a decided slip stays decided');
});

test('slips: concurrent approve and reject record money at most once', async () => {
  globalThis.__slipRead = undefined;
  const reference = await cashBooking(1000);
  const { slip } = await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(30), mime: 'image/jpeg', now: submitAt });
  const results = await Promise.all([slips.approveSlip(slip.id, 100000, 'a@example.invalid'), slips.rejectSlip(slip.id, 'Not received', 'b@example.invalid'), slips.approveSlip(slip.id, 100000, 'c@example.invalid')]);
  const final = await d1.prepare('SELECT status FROM payment_slips WHERE id=?').bind(slip.id).first();
  const receipts = await d1.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor),0) AS total FROM cash_receipts WHERE booking_reference=?').bind(reference).first();
  if (final.status === 'approved') assert.deepEqual(receipts, { n: 1, total: 100000 });
  else { assert.equal(final.status, 'rejected'); assert.deepEqual(receipts, { n: 0, total: 0 }); assert.equal(results[0].ok || results[2].ok, false); }
});

test('slips: two slips cannot together pay more than the booking total', async () => {
  globalThis.__slipRead = undefined;
  const reference = await cashBooking(1000);
  const a = (await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(40), mime: 'image/jpeg', now: submitAt })).slip;
  const b = (await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(41), mime: 'image/jpeg', now: submitAt })).slip;
  const results = await Promise.all([slips.approveSlip(a.id, 100000, 'f@example.invalid'), slips.approveSlip(b.id, 100000, 'f@example.invalid')]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(await booking(reference), { payment_status: 'paid', amount_paid: 1000 });
});

test('slips: card bookings and unconfigured sites take no slips', async () => {
  const reference = await cashBooking();
  await d1.prepare("UPDATE bookings SET payment_method='stripe' WHERE reference=?").bind(reference).run();
  assert.equal((await slips.submitSlip({ reference, customerId: 'c1', bytes: jpeg(50), mime: 'image/jpeg', now: submitAt })).status, 409);
  const saved = globalThis.__slipTestEnv.WAYDIDI_SLIP_PAYEE_NAMES;
  delete globalThis.__slipTestEnv.WAYDIDI_SLIP_PAYEE_NAMES;
  try { assert.equal((await slips.submitSlip({ reference: await cashBooking(), customerId: 'c1', bytes: jpeg(51), mime: 'image/jpeg', now: submitAt })).status, 404); }
  finally { globalThis.__slipTestEnv.WAYDIDI_SLIP_PAYEE_NAMES = saved; }
});

test('slip routes check the customer, the role and the request origin', async () => {
  const customerRoute = await readFile(new URL('../app/api/account/trips/[reference]/slips/route.ts', import.meta.url), 'utf8');
  assert.match(customerRoute, /customerBooking\(session\.customer/);
  assert.match(customerRoute, /if \(!sameOrigin\(request\)\)/);
  assert.match(customerRoute, /sniffSlipImage\(bytes\)/);
  const adminRoute = await readFile(new URL('../app/api/admin/payments/slips/route.ts', import.meta.url), 'utf8');
  assert.match(adminRoute, /role === "owner" \|\| role === "finance"/);
  assert.match(adminRoute, /!sameOrigin\(request\) \|\| !isJsonRequest\(request\)/);
});
