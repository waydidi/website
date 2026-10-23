import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// Admin → Attractions "Fill from Google Maps" and "Find free photos": only free licences with a credit, only files
// from Wikimedia's image server are copied, and only staff can use it. Google and Commons are fakes.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
globalThis.__afEnv = { DB: d1, GOOGLE_MAPS_SERVER_KEY: 'test-key' };
globalThis.__admin = { email: 'owner@example.com' };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'af-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0af-env'; if (id.endsWith('/lib/admin')) return '\0af-admin'; },
  load(id) { if (id === '\0af-env') return 'export const env=globalThis.__afEnv'; if (id === '\0af-admin') return 'export async function getWaydidiAdmin(){return globalThis.__admin}'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__afEnv; delete globalThis.__admin; });
const rules = await vite.ssrLoadModule('/lib/place-autofill-rules.ts');
const route = await vite.ssrLoadModule('/app/api/admin/attractions/autofill/route.ts');

const FILE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Big_Buddha.jpg/1600px-Big_Buddha.jpg';
const page = (title, url, licence, extra = {}) => ({ title: `File:${title}.jpg`, imageinfo: [{ url, thumburl: url, thumbwidth: 1600, thumbheight: 1067, width: 4000, height: 2667, mime: 'image/jpeg',
  descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}.jpg`, extmetadata: { LicenseShortName: { value: licence }, Artist: { value: '<a href="//x">Jane Doe</a>' } }, ...extra }] });

test('only https files on Wikimedia’s image server may be copied', () => {
  assert.equal(rules.isCommonsFileUrl(FILE), true);
  for (const bad of ['http://upload.wikimedia.org/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org.evil.com/wikipedia/commons/a.jpg', 'https://example.com/wikipedia/commons/a.jpg',
    'https://user@upload.wikimedia.org/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org:8443/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org/other/a.jpg', 'not a url'])
    assert.equal(rules.isCommonsFileUrl(bad), false, bad);
});

test('only freely licensed, large enough JPEG/PNG/WebP photos are offered, with a credit line', () => {
  const answer = { query: { pages: {
    1: page('Big Buddha', FILE, 'CC BY-SA 4.0'),
    2: page('Wat Chalong', FILE.replace('Big_Buddha', 'Wat_Chalong'), 'CC0'),
    3: page('Old Town', FILE.replace('Big_Buddha', 'Old_Town'), 'Public domain'),
    4: page('Logo', FILE.replace('Big_Buddha', 'Logo'), 'Fair use'),
    5: page('Shop', FILE.replace('Big_Buddha', 'Shop'), 'All rights reserved'),
    6: page('Tiny', FILE.replace('Big_Buddha', 'Tiny'), 'CC BY 2.0', { width: 640 }),
    7: page('Clip', FILE.replace('Big_Buddha', 'Clip'), 'CC BY 2.0', { mime: 'image/svg+xml' }),
    8: page('Elsewhere', 'https://example.com/wikipedia/commons/x.jpg', 'CC BY 2.0'),
  } } };
  const photos = rules.commonsPhotos(answer);
  assert.deepEqual(photos.map((p) => p.title).sort(), ['Big Buddha', 'Old Town', 'Wat Chalong']);
  const buddha = photos.find((p) => p.title === 'Big Buddha');
  assert.equal(buddha.credit, 'Photo: Jane Doe, CC BY-SA 4.0, Wikimedia Commons');
  assert.equal(buddha.thumb, FILE.replace('/1600px-', '/400px-'), 'the picker shows a small copy');
  assert.deepEqual(rules.commonsPhotos(null), []);
  assert.equal(rules.mergeCredits('Own photos', ['Photo: A, CC0, Wikimedia Commons', 'Photo: A, CC0, Wikimedia Commons']), 'Own photos; Photo: A, CC0, Wikimedia Commons');
});

// Fake network: Google Places, Commons API and Wikimedia's image server; everything else is refused and recorded.
let calls = [];
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
let imageType = 'image/jpeg', imageBytes = JPEG;
globalThis.fetch = async (url) => {
  const u = String(url); calls.push(u);
  if (u.startsWith('https://places.googleapis.com/v1/places/')) return Response.json({ id: 'gp1', displayName: { text: 'Big Buddha Phuket' }, formattedAddress: 'Karon, Phuket', location: { latitude: 7.8276, longitude: 98.3128 },
    regularOpeningHours: { periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 8, minute: 0 }, close: { day, hour: 19, minute: 30 } })) } });
  if (u.startsWith('https://commons.wikimedia.org/w/api.php')) {
    const near = u.includes('geosearch');
    return Response.json({ query: { pages: near ? { 1: page('Big Buddha', FILE, 'CC BY-SA 4.0'), 2: page('Ad', FILE.replace('Big_Buddha', 'Ad'), 'Fair use') } : { 1: page('Big Buddha', FILE, 'CC BY-SA 4.0'), 3: page('Night', FILE.replace('Big_Buddha', 'Night'), 'CC0') } } });
  }
  if (u.startsWith('https://upload.wikimedia.org/')) return new Response(imageBytes, { headers: { 'content-type': imageType } });
  return new Response('refused', { status: 599 });
};
beforeEach(() => { calls = []; imageType = 'image/jpeg'; imageBytes = JPEG; globalThis.__admin = { email: 'owner@example.com' }; });
const post = (body, headers = {}) => route.POST(new Request('https://example.invalid/api/admin/attractions/autofill', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));

test('Fill from Google Maps: name, address, map position, opening hours and closed days', async () => {
  const res = await post({ action: 'google', placeId: 'gp1', query: 'Big Buddha' });
  assert.equal(res.status, 200);
  const { place } = await res.json();
  assert.deepEqual(place, { placeId: 'gp1', name: 'Big Buddha Phuket', address: 'Karon, Phuket', lat: 7.8276, lng: 98.3128, hours: { openTime: '08:00', closeTime: '19:30', closedDays: [], varies: false } });
  assert.equal((await post({ action: 'google' })).status, 400, 'nothing to look up');
});

test('Find free photos: near the place and by name, each once, free licences only', async () => {
  const res = await post({ action: 'photos', name: 'Big Buddha', lat: 7.8276, lng: 98.3128 });
  const { photos } = await res.json();
  assert.deepEqual(photos.map((p) => p.title).sort(), ['Big Buddha', 'Night']);
  assert.equal(calls.filter((u) => u.includes('commons.wikimedia.org')).length, 2);
});

test('importing copies only Commons files that are images up to 5 MB into the file store', async () => {
  const res = await post({ action: 'import', urls: [FILE, 'https://example.com/wikipedia/commons/a.jpg'] });
  const { urls } = await res.json();
  assert.match(urls[0], /^\/api\/blog-images\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(urls[1], null);
  assert.ok(!calls.some((u) => u.startsWith('https://example.com')), 'another site is never fetched');
  const stored = await d1.prepare('SELECT content_type FROM stored_file_parts WHERE key=?').bind('blog/' + urls[0].split('/').pop()).first();
  assert.equal(stored.content_type, 'image/jpeg');

  imageType = 'text/html';
  assert.deepEqual((await (await post({ action: 'import', urls: [FILE] })).json()).urls, [null], 'not an image');
  imageType = 'image/jpeg'; imageBytes = new Uint8Array(5 * 1024 * 1024 + 1);
  assert.deepEqual((await (await post({ action: 'import', urls: [FILE] })).json()).urls, [null], 'over 5 MB');
});

test('refused: signed out, another site posting, and a bad request', async () => {
  globalThis.__admin = null;
  assert.equal((await post({ action: 'photos', name: 'Big Buddha' })).status, 401);
  globalThis.__admin = { email: 'owner@example.com' };
  assert.equal((await post({ action: 'photos', name: 'Big Buddha' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ action: 'import', urls: Array(13).fill(FILE) })).status, 400, 'at most 12 at a time');
  assert.equal((await post({ action: 'other' })).status, 400);
  assert.equal(calls.length, 0, 'nothing fetched for refused requests');
});
