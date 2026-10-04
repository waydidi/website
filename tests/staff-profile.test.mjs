import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const db = await mf.getD1Database('DB');
await db.exec('CREATE TABLE staff_accounts (id TEXT PRIMARY KEY, display_name TEXT, email TEXT, role TEXT, active INTEGER);');
await db.prepare("INSERT INTO staff_accounts VALUES ('alice','Alice','alice@example.invalid','support',1),('bob','Bob','bob@example.invalid','owner',1)").run();
globalThis.__profileTest = { env: { DB: db }, user: { id: 'alice', role: 'support' }, files: new Map() };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'profile-boundaries', enforce: 'pre', resolveId(id) {
  if (id === 'cloudflare:workers') return '\0profile-env';
  if (id === '@/lib/admin' || id === root + '/lib/admin') return '\0profile-admin';
  if (id === '@/lib/file-store' || id === root + '/lib/file-store') return '\0profile-files';
}, load(id) {
  if (id === '\0profile-env') return 'export const env=globalThis.__profileTest.env';
  if (id === '\0profile-admin') return 'export async function getWaydidiAdmin(){return globalThis.__profileTest.user}';
  if (id === '\0profile-files') return 'export async function getFile(k){return globalThis.__profileTest.files.get(k)}; export async function putFile(k,body,contentType){globalThis.__profileTest.files.set(k,{body,contentType})}; export async function deleteFile(k){globalThis.__profileTest.files.delete(k)}';
} }], server: { middlewareMode: true } });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__profileTest; });
const profile = await vite.ssrLoadModule('/app/api/admin/profile/route.ts');
const avatar = await vite.ssrLoadModule('/app/api/admin/avatar/route.ts');
const security = await vite.ssrLoadModule('/lib/staff-security.ts');
const req = (body, origin = 'https://example.invalid') => new Request('https://example.invalid/api/admin/profile', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('profile updates only the signed-in staff account and cannot elevate its role', async () => {
  assert.equal((await profile.PATCH(req({ displayName: 'Alice Smith', email: 'alice.new@example.invalid', id: 'bob', role: 'owner' }))).status, 200);
  const alice = await db.prepare("SELECT * FROM staff_accounts WHERE id='alice'").first();
  assert.equal(alice.display_name, 'Alice Smith'); assert.equal(alice.email, 'alice.new@example.invalid'); assert.equal(alice.role, 'support');
  assert.equal((await db.prepare("SELECT display_name FROM staff_accounts WHERE id='bob'").first()).display_name, 'Bob');
});
test('profile rejects invalid input, unauthenticated and cross-origin requests', async () => {
  assert.equal((await profile.PATCH(req({ displayName: 'A', email: 'invalid' }))).status, 400);
  assert.equal((await profile.PATCH(req({ displayName: 'Alice', email: 'alice@example.invalid' }, 'https://other.invalid'))).status, 403);
  globalThis.__profileTest.user = null;
  assert.equal((await profile.PATCH(req({ displayName: 'Alice', email: 'alice@example.invalid' }))).status, 401);
  globalThis.__profileTest.user = { id: 'alice', role: 'support' };
});
test('staff avatars are isolated by account and removal affects only that account', async () => {
  globalThis.__profileTest.files.set('staff/alice/avatar', { body: new Uint8Array([1]).buffer, contentType: 'image/png' });
  globalThis.__profileTest.files.set('staff/bob/avatar', { body: new Uint8Array([2]).buffer, contentType: 'image/png' });
  assert.deepEqual([...new Uint8Array(await (await avatar.GET()).arrayBuffer())], [1]);
  assert.equal((await avatar.DELETE(new Request('https://example.invalid/api/admin/avatar', { method: 'DELETE', headers: { origin: 'https://example.invalid' } }))).status, 200);
  assert.equal((await avatar.GET()).status, 404); assert.ok(globalThis.__profileTest.files.has('staff/bob/avatar'));
});
test('all staff roles may manage their own profile without accessing staff administration', () => {
  for (const role of ['operations','finance','editor','support']) {
    assert.equal(security.allowedStaffRoute(role, '/admin/profile', 'GET'), true);
    assert.equal(security.allowedStaffRoute(role, '/api/admin/profile', 'PATCH'), true);
    assert.equal(security.allowedStaffRoute(role, '/api/admin/avatar', 'POST'), true);
    assert.equal(security.allowedStaffRoute(role, '/api/admin/staff', 'POST'), false);
  }
});
