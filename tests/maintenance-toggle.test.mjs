import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Admin → Settings → Maintenance mode: only the owner can read or change it, and it works on a database where the
// site_settings migration was never applied (Workers Builds doesn't run migrations).
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
globalThis.__maintenanceEnv = { DB: d1 };
globalThis.__maintenanceStaff = null;
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'maintenance-boundaries', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0maintenance-env'; if (id === '@/lib/admin' || id.endsWith('/lib/admin')) return '\0maintenance-admin'; },
  load(id) {
    if (id === '\0maintenance-env') return 'export const env=globalThis.__maintenanceEnv';
    if (id === '\0maintenance-admin') return 'export async function getWaydidiAdmin(){return globalThis.__maintenanceStaff}';
  } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__maintenanceEnv; delete globalThis.__maintenanceStaff; });
const route = await vite.ssrLoadModule('/app/api/admin/maintenance/route.ts');

const as = (role) => { globalThis.__maintenanceStaff = role ? { id: `staff-${role}`, displayName: `Test ${role}`, email: `${role}@example.invalid`, fullName: null, role } : null; };
const post = (body, origin = 'https://example.invalid') => route.POST(new Request('https://example.invalid/api/admin/maintenance', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const stored = async () => d1.prepare("SELECT value FROM site_settings WHERE key='maintenance'").first().catch(() => null);

test('the owner can read and switch maintenance mode, even before the settings table exists', async () => {
  as('owner');
  assert.equal(await d1.prepare("SELECT name FROM sqlite_master WHERE name='site_settings'").first(), null, 'fresh database, no migration applied');
  const first = await route.GET();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { on: false, updatedBy: null, updatedAt: null });
  const on = await post({ on: true });
  assert.equal(on.status, 200);
  const body = await on.json();
  assert.equal(body.on, true); assert.equal(body.updatedBy, 'Test owner'); assert.ok(body.updatedAt);
  assert.equal((await stored()).value, 'on');
  const read = await (await route.GET()).json();
  assert.equal(read.on, true); assert.equal(read.updatedBy, 'Test owner');
  assert.equal((await post({ on: false })).status, 200);
  assert.equal((await stored()).value, 'off');
});

test('other staff roles and signed-out visitors can neither read nor change it', async () => {
  as('owner'); await post({ on: false });
  for (const role of ['operations', 'finance', 'support', 'agency', null]) {
    as(role);
    const read = await route.GET();
    assert.equal(read.status, 403, String(role));
    assert.equal((await read.json()).code, role ? 'OWNER_REQUIRED' : 'SIGN_IN_REQUIRED');
    assert.equal((await post({ on: true })).status, 403, String(role));
  }
  assert.equal((await stored()).value, 'off', 'nothing changed');
});

test('cross-site requests and invalid values are refused without writing', async () => {
  as('owner'); await post({ on: false });
  assert.equal((await post({ on: true }, 'https://elsewhere.invalid')).status, 403);
  for (const body of [{}, { on: 'yes' }, { on: 1 }, null]) assert.equal((await post(body)).status, 400, JSON.stringify(body));
  const notJson = await route.POST(new Request('https://example.invalid/api/admin/maintenance', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'text/plain' }, body: '{"on":true}' }));
  assert.equal(notJson.status, 403);
  assert.equal((await stored()).value, 'off');
});

test('the Settings page always shows the card, with the reason when the switch is not available', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(root + '/app/admin/settings/page.tsx', 'utf8');
  assert.match(page, /<MaintenanceToggle \/>/);
  const card = await readFile(root + '/components/admin-settings/maintenance.tsx', 'utf8');
  assert.doesNotMatch(card, /return null/, 'the card never disappears');
  assert.match(card, /Only the owner can turn maintenance mode on or off/);
  assert.match(card, /Couldn&apos;t load the current setting/);
});
