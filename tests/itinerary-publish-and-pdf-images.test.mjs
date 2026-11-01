import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// Itinerary audit P0s: publishing every day of a trip is one guarded write, and the PDF only downloads approved photos
// within byte and pixel limits.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
globalThis.__publishEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'publish-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0publish-env'; }, load(id) { if (id === '\0publish-env') return 'export const env=globalThis.__publishEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__publishEnv; });
const trips = await vite.ssrLoadModule('/lib/smart-trips.ts');
const api = await vite.ssrLoadModule('/lib/trip-api.ts');
const live = await vite.ssrLoadModule('/lib/trip-live-data.ts');
const policy = await vite.ssrLoadModule('/lib/pdf-image-policy.ts');
const { createTripPdf } = await vite.ssrLoadModule('/lib/trip-pdf.ts');

const by = { name: 'Publish tester' };
const admin = { kind: 'admin', name: 'Publish tester' };
const draft = (extra = {}) => trips.tripSchema.parse({ title: 'Publish itinerary', tripDate: '2027-03-01', startTime: '08:00', pickupText: 'Test hotel', pickupLat: 13.75, pickupLng: 100.5, durationHours: 8, adults: 2, children: 0, bags: 0, vehicle: 'economy_sedan', stops: [], transportPrice: 2500, ...extra });
const request = (body) => new Request('https://example.invalid/api/admin/trips', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.invalid' }, body: JSON.stringify(body) });
const state = async (ids) => Promise.all(ids.map(async (id) => ({
  ...(await d1.prepare('SELECT status, version FROM smart_trips WHERE id=?').bind(id).first()),
  versions: (await d1.prepare('SELECT COUNT(*) n FROM smart_trip_versions WHERE trip_id=?').bind(id).first()).n,
})));

async function twoDayTrip() {
  const { id } = await trips.saveTrip(draft(), by);
  await trips.addDay(await trips.getTrip(id), by);
  const days = await trips.groupDays(await trips.getTrip(id));
  // addDay leaves the new day unpriced; give it a price so it can be sent.
  await trips.saveTrip({ ...trips.inputFromRow(days[1]), id: days[1].id, transportPrice: 1800 }, by);
  return trips.groupDays(await trips.getTrip(id));
}

test('two sends at once publish every day exactly once, never a mix', async () => {
  const days = await twoDayTrip(), ids = days.map((d) => d.id);
  const results = await Promise.allSettled([trips.sendTripDays(days, 'A'), trips.sendTripDays(days, 'B')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.message, 'CONFLICT');
  assert.deepEqual(await state(ids), [{ status: 'sent', version: 1, versions: 1 }, { status: 'sent', version: 1, versions: 1 }]);
  const winner = (await d1.prepare('SELECT DISTINCT created_by FROM smart_trip_versions WHERE trip_id IN (?, ?)').bind(...ids).all()).results;
  assert.equal(winner.length, 1, 'both days come from the same send');
});

test('a retried send with the rows it already published writes nothing new', async () => {
  const days = await twoDayTrip(), ids = days.map((d) => d.id);
  await trips.sendTripDays(days, 'A');
  await assert.rejects(trips.sendTripDays(days, 'A'), /CONFLICT/);
  assert.deepEqual(await state(ids), [{ status: 'sent', version: 1, versions: 1 }, { status: 'sent', version: 1, versions: 1 }]);
  // Read again, a deliberate update is version 2 on every day.
  await trips.sendTripDays(await trips.groupDays(await trips.getTrip(ids[0])), 'A', 'Updated');
  assert.deepEqual(await state(ids), [{ status: 'sent', version: 2, versions: 2 }, { status: 'sent', version: 2, versions: 2 }]);
});

test('an edit after the rows were read stops the whole send', async () => {
  const days = await twoDayTrip(), ids = days.map((d) => d.id);
  await trips.saveTrip({ ...trips.inputFromRow(days[1]), id: days[1].id, notes: 'Changed by another editor' }, by);
  await assert.rejects(trips.sendTripDays(days, 'A'), /CONFLICT/);
  assert.deepEqual(await state(ids), [{ status: 'draft', version: 0, versions: 0 }, { status: 'draft', version: 0, versions: 0 }], 'day 1 is not sent on its own');
});

test('a paid or cancelled day is never re-sent, and the first day is rolled back with it', async () => {
  for (const status of ['accepted', 'cancelled']) {
    const days = await twoDayTrip(), ids = days.map((d) => d.id);
    await d1.prepare('UPDATE smart_trips SET status=? WHERE id=?').bind(status, ids[1]).run();
    const fresh = await trips.groupDays(await trips.getTrip(ids[0]));
    await assert.rejects(trips.sendTripDays(fresh, 'A'), /CONFLICT/);
    assert.deepEqual(await state(ids), [{ status: 'draft', version: 0, versions: 0 }, { status, version: 0, versions: 0 }]);
  }
});

test('Admin send answers 409 and sends nothing when a later day is already paid', async () => {
  const days = await twoDayTrip(), ids = days.map((d) => d.id);
  await d1.prepare("UPDATE smart_trips SET status='accepted' WHERE id=?").bind(ids[1]).run();
  const response = await api.handleAction(request({ action: 'send', notify: false }), ids[0], admin);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Nothing was sent/);
  assert.deepEqual(await state(ids), [{ status: 'draft', version: 0, versions: 0 }, { status: 'accepted', version: 0, versions: 0 }]);
});

test('two changes on the day from the same view: one wins, the other is told to reload', async () => {
  const { id } = await trips.saveTrip(draft({ stops: [{ id: 's1', kind: 'custom', name: 'Market', durationMin: 60, priority: 'must', lat: 13.76, lng: 100.51 }] }), by);
  await trips.sendTripDays([await trips.getTrip(id)], 'A');
  await d1.prepare("UPDATE smart_trips SET status='accepted' WHERE id=?").bind(id).run();
  const trip = await trips.getTrip(id);
  const results = await Promise.allSettled([live.adjustLive(trip, { kind: 'skip', stopId: 's1' }, 'A'), live.adjustLive(trip, { kind: 'shorten', stopId: 's1', minutes: 15 }, 'B')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(await state([id]), [{ status: 'accepted', version: 2, versions: 2 }], 'a paid trip still takes changes on the day');
  const response = await api.handleAction(request({ action: 'live_adjust', change: { kind: 'restore', stopId: 's1' } }), id, admin);
  assert.equal(response.status, 200, 'a fresh read is accepted');
});

// ---- PDF photos ---------------------------------------------------------------------

const origin = 'https://waydidi.example';
const jpeg = (w = 16, h = 16) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
const png = (w, h) => { const b = new Uint8Array(33); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]); new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h); return b; };

test('photo links: our own site and approved photo hosts only', () => {
  const ok = (raw) => policy.pdfImageUrl(raw, origin)?.href ?? null;
  assert.equal(ok('/api/blog-images/abc.jpg'), 'https://waydidi.example/api/blog-images/abc.jpg');
  assert.equal(ok('https://waydidi.example/photo.jpg'), 'https://waydidi.example/photo.jpg');
  assert.equal(ok('https://lh3.googleusercontent.com/p/abc'), 'https://lh3.googleusercontent.com/p/abc');
  assert.equal(ok('https://upload.wikimedia.org/a.jpg'), 'https://upload.wikimedia.org/a.jpg');
  for (const bad of ['//evil.example/a.jpg', 'http://upload.wikimedia.org/a.jpg', 'https://evil.example/a.jpg', 'https://googleusercontent.com.evil.example/a',
    'https://user:pass@upload.wikimedia.org/a.jpg', 'https://upload.wikimedia.org:8443/a.jpg', 'https://127.0.0.1/a.jpg', 'https://169.254.169.254/latest', 'https://[::1]/a.jpg',
    'https://0x7f000001/a.jpg', 'file:///etc/passwd', 'data:image/png;base64,AAAA', '/\\evil.example', ' ', null, `/${'a'.repeat(2001)}`]) assert.equal(ok(bad), null, String(bad));
});

test('image headers: size is read before anything is decoded', () => {
  assert.deepEqual(policy.imageHeader(jpeg(640, 480)), { type: 'jpg', width: 640, height: 480 });
  assert.deepEqual(policy.imageHeader(png(800, 600)), { type: 'png', width: 800, height: 600 });
  assert.equal(policy.imageHeader(new TextEncoder().encode('RIFF....WEBP')), null);
  assert.equal(policy.imageHeader(new Uint8Array([0xff, 0xd8, 0x00])), null);
  assert.equal(policy.imageWithinLimits({ width: 100_000, height: 100_000 }), false);
  assert.equal(policy.imageWithinLimits({ width: 4000, height: 3000 }), true);
});

test('bodies are read only up to the byte limit', async () => {
  let cancelled = false, pulls = 0;
  const endless = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(1024)); }, cancel() { cancelled = true; } });
  assert.equal(await policy.readCapped(endless, 4096), null);
  assert.ok(cancelled); assert.ok(pulls <= 6);
  assert.equal((await policy.readCapped(new Response(new Uint8Array(10)).body, 4096)).byteLength, 10);
});

function snapshot(covers) {
  return { version: 1, createdAt: '2027-01-01T00:00:00.000Z', ref: 'TP-PDF', title: 'Photo policy', tripDate: '2027-03-01', startTime: '08:00', pickupText: 'Hotel', pickup: null, endText: 'Hotel', end: null,
    durationHours: 8, adults: 2, children: 0, vehicle: 'economy_sedan', vehicleName: 'Sedan', customerName: 'Guest', language: 'en', notes: null, returnAt: 1020, returnTravel: 30, totalDrive: 90,
    transportPrice: 2500, feesIncluded: 0, feesOnSite: 0, discount: 0, total: 2500, packing: [],
    stops: covers.map((cover, i) => ({ id: `s${i}`, kind: 'attraction', name: `Place ${i}`, arrival: 540, start: 540, end: 600, travelMin: 20, program: null, sessionTime: null, checkIn: null, lat: null, lng: null, note: null,
      description: 'A place', highlights: [], cover, gallery: [], dressCode: null, openHours: null, fee: null })) };
}
async function pdfWith(covers, respond) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), redirect: init?.redirect }); return respond(String(url)); };
  try { return { text: Buffer.from(await createTripPdf(snapshot(covers), origin, null)).toString('latin1'), calls }; }
  finally { globalThis.fetch = original; }
}
// The logo (and its transparency mask) are images too; count only the photos added on top of a PDF without any.
const imageObjects = (text) => (text.match(/\/Subtype \/Image/g) ?? []).length;
const logoImages = imageObjects((await pdfWith([], () => { throw new Error('no fetch expected'); })).text);
const images = (text) => imageObjects(text) - logoImages;

test('PDF embeds an approved photo and follows an approved redirect', async () => {
  const { text, calls } = await pdfWith(['/api/blog-images/one.jpg', 'https://lh3.googleusercontent.com/start'], (url) =>
    url.endsWith('/start') ? new Response(null, { status: 302, headers: { location: '/final' } }) : new Response(jpeg(), { headers: { 'content-type': 'image/jpeg' } }));
  assert.equal(images(text), 2);
  assert.deepEqual(calls.map((c) => c.url), ['https://waydidi.example/api/blog-images/one.jpg', 'https://lh3.googleusercontent.com/start', 'https://lh3.googleusercontent.com/final']);
  assert.ok(calls.every((c) => c.redirect === 'manual'), 'redirects are never followed automatically');
});

test('PDF never fetches private or unapproved targets, and stops at redirects to them', async () => {
  const { text, calls } = await pdfWith(['https://169.254.169.254/latest/meta-data', 'https://evil.example/a.jpg', 'https://upload.wikimedia.org/hop'], () =>
    new Response(null, { status: 301, headers: { location: 'http://127.0.0.1:8080/admin' } }));
  assert.equal(images(text), 0);
  assert.deepEqual(calls.map((c) => c.url), ['https://upload.wikimedia.org/hop']);
});

test('PDF skips redirect loops, oversized bodies and pixel bombs, and still renders', async () => {
  const loop = await pdfWith(['https://upload.wikimedia.org/loop'], () => new Response(null, { status: 302, headers: { location: '/loop' } }));
  assert.equal(loop.calls.length, policy.PDF_IMAGE_MAX_REDIRECTS + 1);
  assert.equal(images(loop.text), 0);
  const declared = await pdfWith(['/big.jpg'], () => new Response(jpeg(), { headers: { 'content-length': String(policy.PDF_IMAGE_MAX_BYTES + 1) } }));
  assert.equal(images(declared.text), 0);
  const streamed = await pdfWith(['/big.jpg'], () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); } })));
  assert.equal(images(streamed.text), 0);
  const bomb = await pdfWith(['/bomb.png', '/bomb.jpg'], (url) => new Response(url.endsWith('.png') ? png(100_000, 100_000) : jpeg(65_000, 65_000)));
  assert.equal(images(bomb.text), 0);
  assert.match(bomb.text, /%PDF-/);
});
