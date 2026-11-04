import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// Bank account numbers and tax IDs encrypted at rest (lib/field-crypto.ts, lib/pii.ts), masked for staff,
// full only for owner and finance with every Show / export logged (app/api/admin/sensitive, reports export).
const root = fileURLToPath(new URL('..', import.meta.url));
const KEY = 'test-only-pii-key-0123456789abcdefghijklmnop';
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("x")}}', compatibilityDate: '2026-05-15', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(`${root}/drizzle`)).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(`${root}/drizzle/${name}`, 'utf8'));
  for (const s of statements) await d1.prepare(s).run().catch(() => undefined);
}
const state = globalThis.__pii = { env: { DB: d1, PII_ENCRYPTION_KEY: KEY }, staff: null };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{
  name: 'pii-boundaries', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0pii-env'; if (id.endsWith('/lib/admin')) return '\0pii-admin'; },
  load(id) {
    if (id === '\0pii-env') return 'export const env=globalThis.__pii.env';
    if (id === '\0pii-admin') return 'export async function getWaydidiAdmin(){return globalThis.__pii.staff}';
  },
}] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__pii; });

const crypto_ = await vite.ssrLoadModule('/lib/field-crypto.ts');
const rules = await vite.ssrLoadModule('/lib/sensitive-access-rules.ts');
const pii = await vite.ssrLoadModule('/lib/pii.ts');
const backfill = await vite.ssrLoadModule('/lib/pii-backfill.ts');
const reveal = await vite.ssrLoadModule('/app/api/admin/sensitive/route.ts');
const exportRoute = await vite.ssrLoadModule('/app/api/admin/reports/export/route.ts');
const billing = await vite.ssrLoadModule('/lib/billing-profiles.ts');
const security = await vite.ssrLoadModule('/lib/staff-security.ts');

const withKey = async (key, fn) => { const before = state.env.PII_ENCRYPTION_KEY; state.env.PII_ENCRYPTION_KEY = key; try { return await fn(); } finally { state.env.PII_ENCRYPTION_KEY = before; } };
const post = (body, origin = 'https://example.invalid') => reveal.POST(new Request('https://example.invalid/api/admin/sensitive', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) }));
const logCount = async () => (await d1.prepare('SELECT COUNT(*) n FROM sensitive_access_log').first().catch(() => ({ n: 0 }))).n;

test('field encryption: round trip, random per value, bound to its column, tamper and wrong key refused', async () => {
  const a = await crypto_.sealField('1234567890', KEY, 'drivers.bank_account_number');
  const b = await crypto_.sealField('1234567890', KEY, 'drivers.bank_account_number');
  assert.ok(a.startsWith('enc:v1:')); assert.notEqual(a, b); assert.equal(a.includes('1234567890'), false);
  assert.equal(await crypto_.openField(a, KEY, 'drivers.bank_account_number'), '1234567890');
  await assert.rejects(crypto_.openField(a, KEY, 'booking_tax_invoices.tax_id'), /FIELD_DECRYPT_FAILED/);
  await assert.rejects(crypto_.openField(a, `${KEY}-other`, 'drivers.bank_account_number'), /FIELD_DECRYPT_FAILED/);
  const tampered = a.slice(0, -2) + (a.endsWith('A') ? 'BB' : 'AA');
  await assert.rejects(crypto_.openField(tampered, KEY, 'drivers.bank_account_number'), /FIELD_DECRYPT_FAILED|FIELD_CIPHERTEXT_INVALID/);
  await assert.rejects(crypto_.openField('enc:v1:not base64!', KEY, 'x'), /FIELD_CIPHERTEXT_INVALID/);
  assert.equal(await crypto_.openField('1234567890', KEY, 'x'), '1234567890', 'older plain values read as they are');
  assert.equal(await crypto_.sealField('', KEY, 'x'), '');
  assert.equal(await crypto_.sealField(a, KEY, 'drivers.bank_account_number'), a, 'never double-encrypted');
  await assert.rejects(crypto_.sealField('1', 'short', 'x'), /FIELD_KEY_INVALID/);
  assert.equal(crypto_.maskTail('1234567890123'), '•••• 0123');
  assert.equal(crypto_.maskTail('12'), '••');
});

test('the Worker secret: off stores as typed, a short key refuses, a missing key refuses to open encrypted values', async () => {
  await withKey(undefined, async () => {
    assert.equal(pii.piiEncryptionOn(), false);
    assert.equal(await pii.sealPii('1234567890', pii.PII_COLUMNS.driverAccount), '1234567890');
    assert.equal((await pii.piiFingerprint('KBANK:1234567890')).length, 64);
  });
  await withKey('too-short', async () => { await assert.rejects(pii.sealPii('1234567890', pii.PII_COLUMNS.driverAccount), /at least 32/); });
  const sealed = await pii.sealPii('1234567890', pii.PII_COLUMNS.driverAccount);
  assert.ok(sealed.startsWith('enc:v1:'));
  assert.equal(await pii.openPii(sealed, pii.PII_COLUMNS.driverAccount), '1234567890');
  await withKey(undefined, async () => { await assert.rejects(pii.openPii(sealed, pii.PII_COLUMNS.driverAccount), /PII_KEY_MISSING/); });
  const fp = await pii.piiFingerprint('KBANK:1234567890');
  assert.ok(fp.startsWith('h1:')); assert.equal(fp, await pii.piiFingerprint('KBANK:1234567890'));
});

test('only owner and finance may see full numbers; the Worker route list agrees', () => {
  assert.equal(rules.canSeeFullPii('owner'), true); assert.equal(rules.canSeeFullPii('finance'), true);
  for (const role of ['operations', 'support', 'editor', '', null]) assert.equal(rules.canSeeFullPii(role), false);
  assert.equal(security.allowedStaffRoute('finance', '/api/admin/sensitive', 'POST'), true);
  for (const role of ['operations', 'support', 'editor']) assert.equal(security.allowedStaffRoute(role, '/api/admin/sensitive', 'POST'), false);
  assert.deepEqual(rules.parseRevealRequest({ kind: 'tax_invoice', id: 'ABC123' }), { kind: 'tax_invoice', id: 'ABC123' });
  for (const bad of [null, {}, { kind: 'payout_export', id: 'x' }, { kind: 'driver_account', id: "x' OR 1=1" }, { kind: 'driver_account', id: 'x'.repeat(101) }]) assert.equal(rules.parseRevealRequest(bad), null);
});

async function seedDriver(id, account) {
  const now = new Date().toISOString();
  await d1.prepare(`INSERT INTO drivers (id, full_name, phone, base_location, vehicle, bank_code, bank_account_number, id_image_key, id_image_mime, id_image_bytes, id_image_sha256, car_image_key, car_image_mime, car_image_bytes, car_image_sha256, created_at, updated_at)
    VALUES (?, 'Test Driver', '+66800000000', 'Bangkok', 'Camry', 'KBANK', ?, 'k', 'image/jpeg', 1, 'x', 'k', 'image/jpeg', 1, 'x', ?, ?)`).bind(id, account, now, now).run();
}

test('Show: owner and finance get the full number and each view is logged; others, cross-site and bad input are refused without a log', async () => {
  await seedDriver('drv-reveal', await pii.sealPii('9876543210', pii.PII_COLUMNS.driverAccount));
  const before = await logCount();
  state.staff = null; assert.equal((await post({ kind: 'driver_account', id: 'drv-reveal' })).status, 401);
  for (const role of ['operations', 'support', 'editor']) {
    state.staff = { id: `s-${role}`, role };
    const r = await post({ kind: 'driver_account', id: 'drv-reveal' });
    assert.equal(r.status, 403); assert.equal(JSON.stringify(await r.json()).includes('9876543210'), false);
  }
  state.staff = { id: 's-owner', role: 'owner' };
  assert.equal((await post({ kind: 'driver_account', id: 'drv-reveal' }, 'https://evil.invalid')).status, 403);
  assert.equal((await post({ kind: 'nope', id: 'drv-reveal' })).status, 400);
  assert.equal((await post({ kind: 'driver_account', id: 'missing' })).status, 404);
  assert.equal(await logCount(), before, 'nothing logged for refused requests');
  const ok = await post({ kind: 'driver_account', id: 'drv-reveal' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).value, '9876543210'); assert.match(ok.headers.get('cache-control'), /no-store/);
  state.staff = { id: 's-fin', role: 'finance' };
  assert.equal((await (await post({ kind: 'driver_account', id: 'drv-reveal' })).json()).value, '9876543210');
  const log = (await d1.prepare("SELECT staff_id, staff_role, kind, record_id FROM sensitive_access_log WHERE record_id='drv-reveal' ORDER BY at").all()).results;
  assert.deepEqual(log.map((r) => r.staff_role), ['owner', 'finance']);
  assert.equal(JSON.stringify(log).includes('9876543210'), false, 'the number itself is never logged');
  // Without the key an encrypted number can't be shown, and nothing is logged.
  await withKey(undefined, async () => { assert.equal((await post({ kind: 'driver_account', id: 'drv-reveal' })).status, 503); });
  assert.equal(await logCount(), before + 2);
});

test('backfill encrypts older plain rows once, even with two runs at the same time; off without the key', async () => {
  const now = new Date().toISOString();
  await seedDriver('drv-plain-1', '1111111111'); await seedDriver('drv-plain-2', '2222222222'); await seedDriver('drv-empty', '');
  await d1.prepare("INSERT INTO booking_tax_invoices (id, booking_reference, name, tax_id, branch, address, created_at) VALUES ('tax-1','REFTAX1','Co','1234567890123','Head office','Addr',?)").bind(now).run();
  await d1.prepare("INSERT INTO customer_billing_profiles (id, customer_id, name, tax_id, branch, address, created_at, updated_at) VALUES ('bp-1','cust-1','Co','1234567890123','Head office','Addr',?,?)").bind(now, now).run();
  assert.equal(await withKey(undefined, () => backfill.encryptPlainPii(25, d1)), 0);
  const [a, b] = await Promise.all([backfill.encryptPlainPii(25, d1), backfill.encryptPlainPii(25, d1)]);
  assert.ok(a + b >= 4);
  assert.equal(await backfill.encryptPlainPii(25, d1), 0, 'nothing left: a retry changes nothing');
  for (const id of ['drv-plain-1', 'drv-plain-2']) {
    const row = await d1.prepare('SELECT bank_account_number v FROM drivers WHERE id=?').bind(id).first();
    assert.ok(row.v.startsWith('enc:v1:'));
    assert.equal(await pii.openPii(row.v, pii.PII_COLUMNS.driverAccount), id === 'drv-plain-1' ? '1111111111' : '2222222222');
  }
  assert.equal((await d1.prepare("SELECT bank_account_number v FROM drivers WHERE id='drv-empty'").first()).v, '');
  const tax = await d1.prepare("SELECT tax_id v FROM booking_tax_invoices WHERE id='tax-1'").first();
  assert.equal(await pii.openPii(tax.v, pii.PII_COLUMNS.taxInvoiceTaxId), '1234567890123');
  assert.deepEqual((await billing.billingProfilesFor('cust-1')).map((p) => p.taxId), ['1234567890123'], 'the customer still sees their own full tax ID');
});

test('a saved billing profile is stored sealed and read back in full by its owner only', async () => {
  const stored = await billing.storedBillingProfile({ name: 'Acme', taxId: '0105551234567', branch: 'Head office', address: '1 Road' });
  assert.ok(stored.taxId.startsWith('enc:v1:'));
  const now = new Date().toISOString();
  await d1.prepare('INSERT INTO customer_billing_profiles (id, customer_id, name, tax_id, branch, address, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)').bind('bp-2', 'cust-2', stored.name, stored.taxId, stored.branch, stored.address, now, now).run();
  assert.deepEqual((await billing.billingProfilesFor('cust-2')).map((p) => p.taxId), ['0105551234567']);
  assert.deepEqual(await billing.billingProfilesFor('cust-other'), []);
});

test('payout CSV: owner and finance only, full numbers, every export logged', async () => {
  const get = () => exportRoute.GET(new Request('https://example.invalid/api/admin/reports/export?type=payouts&from=2026-01-01&to=2026-01-31'));
  const before = await logCount();
  for (const role of ['operations', 'support']) { state.staff = { id: `s-${role}`, role }; assert.equal((await get()).status, 403); }
  assert.equal(await logCount(), before);
  state.staff = { id: 's-fin', role: 'finance' };
  const r = await get();
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  const log = await d1.prepare("SELECT staff_role, kind, record_id FROM sensitive_access_log WHERE kind='payout_export'").first();
  assert.deepEqual({ ...log }, { staff_role: 'finance', kind: 'payout_export', record_id: '2026-01-01..2026-01-31' });
});
