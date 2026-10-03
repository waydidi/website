import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdir, readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = (await readFile(root + '/drizzle/' + name, 'utf8')).replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__partnerEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', esbuild: { jsx: 'automatic' }, resolve: { alias: { '@': root } }, plugins: [{ name: 'partner-boundaries', enforce: 'pre', resolveId(id) {
  if (id === 'cloudflare:workers') return '\0partner-env';
  if (id.endsWith('/lib/customer-auth')) return '\0partner-auth';
  if (id.endsWith('/components/agencies/agency-form')) return '\0partner-form';
  if (id.endsWith('/components/account/sign-in-form')) return '\0partner-signin';
}, load(id) {
  if (id === '\0partner-env') return 'export const env=globalThis.__partnerEnv';
  if (id === '\0partner-auth') return 'export async function overRateLimit(){return false}; export async function currentCustomer(){return globalThis.__partnerCustomer}; export async function requireCustomer(){if(!globalThis.__partnerCustomer)throw new Error("AUTH_REQUIRED");return globalThis.__partnerCustomer}';
  if (id === '\0partner-form') return 'import {createElement} from "react"; export function AgencyForm(props){return createElement("div",{"data-testid":"agency-form"},JSON.stringify(props))}';
  if (id === '\0partner-signin') return 'export function SignInForm(){return null}';
} }], server: { middlewareMode: true } });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__partnerEnv; delete globalThis.__partnerCustomer; });
const route = await vite.ssrLoadModule('/app/api/agencies/route.ts');
const partners = await vite.ssrLoadModule('/lib/transfer-partners.ts');
const agency = await vite.ssrLoadModule('/lib/agency.ts');
const registration = await vite.ssrLoadModule('/app/agencies/register/page.tsx');
const signIn = await vite.ssrLoadModule('/app/account/sign-in/page.tsx');
let sequence = 0;
function request(input, origin = 'https://example.invalid') { return new Request('https://example.invalid/api/agencies', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ agencyName: 'Test Agency', contactName: 'Test Partner', email: `partner${++sequence}@example.invalid`, phone: '+66123456789', country: 'Thailand', monthlyTransfers: '11-50', message: 'Please contact me.', ...input }) }); }
test('both partner categories persist in the admin queue without granting portal access', async () => {
  for (const type of ['travel-agent', 'host-agency']) {
    const email = `${type}@example.invalid`;
    const r = await route.POST(request({ partnerType: type, email }));
    assert.equal(r.status, 200, await r.text());
    const row = await d1.prepare('SELECT * FROM agency_applications WHERE email=?').bind(email).first();
    assert.equal(row.status, 'new');
    assert.deepEqual(partners.readPartnerApplication(row.message), { type, message: 'Please contact me.' });
    assert.equal(await agency.agencyForCustomer({ email }), null);
    await d1.prepare("UPDATE agency_applications SET status='approved' WHERE id=?").bind(row.id).run();
    assert.equal((await agency.agencyForCustomer({ email: email.toUpperCase() })).id, row.id);
    assert.equal(await agency.agencyForCustomer({ email: 'another@example.invalid' }), null);
  }
});
test('legacy applications remain compatible and new forms default to travel agents', async () => {
  assert.deepEqual(partners.readPartnerApplication('Original note'), { type: 'travel-agent', message: 'Original note' });
  assert.deepEqual(partners.readPartnerApplication(null), { type: 'travel-agent', message: '' });
  assert.equal((await route.POST(request({ email: 'legacy@example.invalid' }))).status, 200);
  const row = await d1.prepare('SELECT message FROM agency_applications WHERE email=?').bind('legacy@example.invalid').first();
  assert.equal(partners.readPartnerApplication(row.message).type, 'travel-agent');
});
test('invalid categories, honeypots, malformed input and cross-origin submissions are rejected', async () => {
  for (const input of [{ partnerType: 'admin' }, { company: 'bot' }, { email: 'invalid' }, { message: 'x'.repeat(1001) }]) assert.equal((await route.POST(request(input))).status, 400);
  assert.equal((await route.POST(request({}, 'https://untrusted.invalid'))).status, 403);
});
test('a database failure reports failure instead of claiming an application was saved', async () => {
  const previous = globalThis.__partnerEnv.DB;
  globalThis.__partnerEnv.DB = { prepare() { throw new Error('TEST_DB_UNAVAILABLE'); } };
  try { assert.equal((await route.POST(request({}))).status, 503); } finally { globalThis.__partnerEnv.DB = previous; }
});
test('homepage actions target working account and partnership routes with Waydidi copy', () => {
  assert.equal(partners.TRANSFER_PARTNERS.length, 2);
  const account = new URL(partners.TRANSFER_PARTNERS[0].href, 'https://example.invalid');
  assert.equal(account.pathname, '/account/sign-in'); assert.equal(account.searchParams.get('next'), '/agencies/register');
  const host = new URL(partners.TRANSFER_PARTNERS[1].href, 'https://example.invalid');
  assert.equal(host.pathname, '/agencies'); assert.equal(host.searchParams.get('partner'), 'host-agency'); assert.equal(host.hash, '#apply');
  assert.doesNotMatch(JSON.stringify(partners.TRANSFER_PARTNERS), /Daytrip/);
});

test('registration requires authentication, prefills verified identity, and shows pending status', async () => {
  globalThis.__partnerCustomer = null;
  await assert.rejects(registration.default(), /AUTH_REQUIRED/);
  globalThis.__partnerCustomer = { email: 'register@example.invalid', name: 'Test', surname: 'Partner' };
  const form = renderToStaticMarkup(await registration.default());
  assert.match(form, /agency-form/); assert.match(form, /register@example.invalid/); assert.match(form, /Test Partner/);
  assert.equal((await route.POST(request({ email: 'register@example.invalid' }))).status, 200);
  const pending = renderToStaticMarkup(await registration.default());
  assert.match(pending, /Your application is being reviewed/); assert.doesNotMatch(pending, /agency-form/);
  await d1.prepare("UPDATE agency_applications SET status='approved' WHERE email=?").bind('register@example.invalid').run();
  await assert.rejects(registration.default(), error => error.digest === 'NEXT_REDIRECT;replace;/agency;307;');
});
test('signed-in account action follows its next route and rejects external redirects', async () => {
  globalThis.__partnerCustomer = { email: 'register@example.invalid' };
  await assert.rejects(signIn.default({ searchParams: Promise.resolve({ next: '/agencies/register' }) }), error => error.digest === 'NEXT_REDIRECT;replace;/agencies/register;307;');
  for (const next of ['https://untrusted.invalid', '//untrusted.invalid', '/\\untrusted.invalid']) await assert.rejects(signIn.default({ searchParams: Promise.resolve({ next }) }), error => error.digest === 'NEXT_REDIRECT;replace;/account;307;');
});
