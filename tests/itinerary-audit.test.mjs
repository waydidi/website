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
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
globalThis.__tripEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'trip-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0trip-env'; }, load(id) { if (id === '\0trip-env') return 'export const env=globalThis.__tripEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); });
const api = await vite.ssrLoadModule('/lib/trip-api.ts');
const trips = await vite.ssrLoadModule('/lib/smart-trips.ts');
const customerRoute = await vite.ssrLoadModule('/app/api/itinerary/[token]/pdf/route.ts');


const admin = { kind: 'admin', name: 'Audit tester' };
const draft = (extra = {}) => trips.tripSchema.parse({ title: 'Audit itinerary', tripDate: '2027-02-28', startTime: '08:00', pickupText: 'Test hotel', pickupLat: 13.75, pickupLng: 100.5, durationHours: 8, adults: 2, children: 0, bags: 0, vehicle: 'economy_sedan', stops: [], transportPrice: 2500, ...extra });
const request = (body, origin = 'https://example.invalid') => new Request('https://example.invalid/api/admin/trips', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });

test('create, edit, reorder, remove and reload preserve itinerary data', async () => {
  const stops = ['Temple', 'Lunch'].map((name, i) => ({ id: `stop-${i}`, kind: 'custom', name, lat: 13.76 + i / 100, lng: 100.5, durationMin: 60, priority: 'must' }));
  const created = await api.handleSave(request(draft({ stops })), admin);
  assert.equal(created.status, 200);
  const { id } = await created.json();
  const before = await trips.getTrip(id);
  const saved = await api.handleSave(request({ ...trips.inputFromRow(before), expectedUpdatedAt: before.updatedAt, stops: [...stops].reverse(), title: 'Changed itinerary' }), admin);
  assert.equal(saved.status, 200);
  const after = await trips.getTrip(id);
  assert.equal(after.title, 'Changed itinerary');
  assert.deepEqual(trips.inputFromRow(after).stops.map((s) => s.id), ['stop-1', 'stop-0']);
  assert.equal((await api.handleSave(request({ ...trips.inputFromRow(after), expectedUpdatedAt: after.updatedAt, stops: stops.slice(1) }), admin)).status, 200);
  assert.equal(trips.inputFromRow(await trips.getTrip(id)).stops.length, 1);
});

test('stale and simultaneous saves cannot silently overwrite an itinerary', async () => {
  const { id } = await trips.saveTrip(draft(), { name: 'Tester' });
  const row = await trips.getTrip(id);
  const body = { ...trips.inputFromRow(row), expectedUpdatedAt: row.updatedAt };
  const responses = await Promise.all([api.handleSave(request({ ...body, title: 'Editor A' }), admin), api.handleSave(request({ ...body, title: 'Editor B' }), admin)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await api.handleSave(request({ ...body, title: 'Stale overwrite' }), admin)).status, 409);
  assert.notEqual((await trips.getTrip(id)).title, 'Stale overwrite');
});

test('save is refused for a paid trip, another agency, signed-out user and cross-origin request', async () => {
  const { id } = await trips.saveTrip(draft(), { name: 'Tester', agencyId: 'agency-a' });
  const body = trips.inputFromRow(await trips.getTrip(id));
  assert.equal((await api.handleSave(request(body), null)).status, 401);
  assert.equal((await api.handleSave(request(body, 'https://elsewhere.invalid'), admin)).status, 403);
  assert.equal((await api.handleSave(request(body), { kind: 'agency', name: 'B', agencyId: 'agency-b' })).status, 404);
  await d1.prepare("UPDATE smart_trips SET status='accepted' WHERE id=?").bind(id).run();
  assert.equal((await api.handleSave(request(body), admin)).status, 409);
});

test('invalid dates, times, coordinates, duplicate stop IDs and reversed windows are rejected', async () => {
  const valid = draft();
  const stop = { id: 'same', kind: 'meal', name: 'Lunch', durationMin: 30, priority: 'must' };
  for (const extra of [{ tripDate: '2027-02-29' }, { tripDate: '2026-13-01' }, { startTime: '24:00' }, { startTime: '12:60' }, { pickupLat: 91 }, { endLat: 1, endLng: null }, { stops: [stop, stop] }, { stops: [{ ...stop, windowStart: '14:00', windowEnd: '13:00' }] }]) {
    assert.equal((await api.handleSave(request({ ...valid, ...extra }), admin)).status, 400, JSON.stringify(extra));
  }
  assert.equal(trips.tripSchema.safeParse({ ...valid, tripDate: '2028-02-29' }).success, true);
});

test('malformed action bodies produce a validation error', async () => {
  assert.equal((await api.handleAction(request(null), 'unused', admin)).status, 400);
  assert.equal((await api.handleAction(request({ action: 'send', note: {} }), 'unused', admin)).status, 400);
});

test('sending freezes the customer version; editing a draft preserves the published PDF', async () => {
  const { id } = await trips.saveTrip(draft({ customerName: 'Test guest' }), { name: 'Tester' });
  const sent = await api.handleAction(request({ action: 'send', notify: false }), id, admin);
  assert.equal(sent.status, 200);
  const trip = await trips.getTrip(id);
  assert.equal(trip.status, 'sent');
  assert.equal(trip.version, 1);
  const before = new Uint8Array(await (await customerRoute.GET(request({}), { params: Promise.resolve({ token: trip.token }) })).arrayBuffer());
  await trips.saveTrip({ ...trips.inputFromRow(trip), title: 'Unpublished edits', expectedUpdatedAt: trip.updatedAt }, { name: 'Tester' });
  const after = new Uint8Array(await (await customerRoute.GET(request({}), { params: Promise.resolve({ token: trip.token }) })).arrayBuffer());
  assert.deepEqual(before, after);
  assert.equal(trips.tripSnapshot(await trips.getTrip(id)).title, 'Audit itinerary');
});

test('Google matrix failures and partial responses fall back without crashing', async () => {
  const { travelMatrix } = await vite.ssrLoadModule('/lib/trip-travel.ts');
  const originalFetch = globalThis.fetch;
  globalThis.__tripEnv.GOOGLE_MAPS_SERVER_KEY = 'test-only';
  const points = [{ lat: 13.75, lng: 100.5 }, { lat: 14, lng: 100.6 }];
  try {
    globalThis.fetch = async () => new Response('quota exceeded', { status: 429 });
    const failed = await travelMatrix(points, null);
    assert.equal(failed.source, 'estimate');
    assert.ok(failed.travel(...points) > 0);
    globalThis.fetch = async () => Response.json([{ originIndex: 0, destinationIndex: 1, condition: 'ROUTE_EXISTS', duration: '61s' }, { originIndex: 50, destinationIndex: 0, condition: 'ROUTE_EXISTS', duration: '60s' }]);
    const partial = await travelMatrix(points, null);
    assert.equal(partial.source, 'estimate');
    assert.equal(partial.travel(...points), 2);
    assert.ok(partial.travel(points[1], points[0]) > 0);
    let posted;
    globalThis.fetch = async (_url, options) => { posted = JSON.parse(options.body); return Response.json([]); };
    await travelMatrix(Array.from({ length: 11 }, (_, i) => ({ lat: 13 + i / 100, lng: 100 })), new Date('2028-01-01T00:00:00Z'));
    assert.equal(posted.routingPreference, 'TRAFFIC_UNAWARE');
    assert.equal(posted.departureTime, undefined);
  } finally { globalThis.fetch = originalFetch; delete globalThis.__tripEnv.GOOGLE_MAPS_SERVER_KEY; }
});

test('long PDF content paginates and the export remains readable', async () => {
  const { createTripPdf } = await vite.ssrLoadModule('/lib/trip-pdf.ts');
  const { PDFDocument } = await import('pdf-lib');
  const { writeFile } = await import('node:fs/promises');
  const stop = { id: 'long', kind: 'attraction', name: 'A detailed private attraction experience with beautiful countryside and a very long descriptive title', start: 540, end: 660, arrival: 530, travelMin: 50, program: null, sessionTime: null, checkIn: null, lat: 14, lng: 100, note: 'Please bring water.', description: 'Enjoy the countryside with your private driver. '.repeat(35), highlights: Array(10).fill('A memorable private experience in Thailand with plenty of time for photos and a relaxing break.'), cover: null, gallery: [], dressCode: 'Comfortable shoes and clothes.', fee: null };
  const snap = { version: 1, ref: 'TP-AUDIT', title: 'A private journey through Thailand with beautiful scenery and memorable local experiences for the whole family', tripDate: '2027-02-28', startTime: '08:00', pickupText: 'Test hotel', endText: 'Test hotel', adults: 2, children: 0, vehicleName: 'Economy sedan', durationHours: 8, returnAt: 960, totalDrive: 100, transportPrice: 2500, feesIncluded: 100, feesOnSite: 100, discount: 50, total: 2550, stops: [stop], packing: ['Water', 'Comfortable shoes'], notes: null };
  const bytes = await createTripPdf(snap, 'https://example.invalid', null);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 3);
  await writeFile('/tmp/itinerary-audit-layout.pdf', bytes);
});

test('operations can upload attraction photos without gaining blog access', async () => {
  const { allowedStaffRoute } = await vite.ssrLoadModule('/lib/staff-security.ts');
  assert.equal(allowedStaffRoute('operations', '/api/admin/attractions/images', 'POST'), true);
  assert.equal(allowedStaffRoute('operations', '/api/admin/blog/images', 'POST'), false);
  for (const role of ['support', 'finance', 'editor']) assert.equal(allowedStaffRoute(role, '/api/admin/attractions/images', 'POST'), false);
});

test('invalid live adjustments cannot corrupt or lengthen a short visit', async () => {
  const { id } = await trips.saveTrip(draft({ stops: [{ id: 'short', kind: 'custom', name: 'Short stop', lat: 13.75, lng: 100.5, durationMin: 5, priority: 'must' }] }), { name: 'Tester' });
  await api.handleAction(request({ action: 'send', notify: false }), id, admin);
  for (const minutes of [-1, 'five', null, 1.5]) assert.equal((await api.handleAction(request({ action: 'live_adjust', change: { kind: 'shorten', stopId: 'short', minutes } }), id, admin)).status, 400);
  assert.equal((await api.handleAction(request({ action: 'live_adjust', change: { kind: 'shorten', stopId: 'short', minutes: 15 } }), id, admin)).status, 409);
  const snap = trips.tripSnapshot(await trips.getTrip(id));
  assert.equal(snap.stops[0].end - snap.stops[0].start, 5);
});

test('draft and withdrawn itinerary PDF links do not expose a previously sent snapshot', async () => {
  const { id } = await trips.saveTrip(draft(), { name: 'Tester' });
  await api.handleAction(request({ action: 'send', notify: false }), id, admin);
  const row = await trips.getTrip(id);
  for (const status of ['draft', 'pricing', 'cancelled']) {
    await d1.prepare('UPDATE smart_trips SET status=? WHERE id=?').bind(status, id).run();
    assert.equal((await customerRoute.GET(request({}), { params: Promise.resolve({ token: row.token }) })).status, 404);
  }
});
