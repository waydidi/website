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
const customerRoute = await vite.ssrLoadModule('/app/api/itinerary/[token]/pdf/route.ts');

const stop = { id: 's1', kind: 'attraction', name: 'Big Buddha', arrival: 540, start: 540, end: 600, travelMin: 30, program: null, sessionTime: null, checkIn: null, lat: 7.8, lng: 98.3, note: null, description: 'A big white Buddha.', highlights: ['View'], cover: null, gallery: [], dressCode: null, openHours: '08:00–18:00', fee: null };
const snap = (ref, version = 2) => ({ version, createdAt: '2026-10-20T00:00:00.000Z', ref, title: 'Phuket day', tripDate: '2026-11-03', startTime: '08:00', pickupText: 'Hilton Phuket', pickup: null, endText: 'Hilton Phuket', end: null, durationHours: 8, adults: 2, children: 0, vehicle: 'comfort_suv', vehicleName: 'Comfort SUV', customerName: 'Mei', language: 'en', notes: null, stops: [stop], returnAt: 900, returnTravel: 30, totalDrive: 60, transportPrice: 3000, feesIncluded: 0, feesOnSite: 0, discount: 0, total: 3000, packing: ['Sunscreen'] });
const now = '2026-10-20T00:00:00.000Z';
let n = 0;
async function addTrip({ ref, token, snapshot = null, agencyId = null, groupId = null, day = 1, template = 0, status = 'sent' }) {
  await d1.prepare('INSERT INTO smart_trips(id,ref,status,title,token,is_template,agency_id,snapshot_json,version,sent_at,group_id,day_number,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('id' + (++n), ref, status, 'Phuket day', token, template, agencyId, snapshot ? JSON.stringify(snapshot) : null, snapshot ? 2 : 0, snapshot ? now : null, groupId, day, now, now).run();
  return 'id' + n;
}
const admin = { kind: 'admin', name: 'Owner' };
const get = (id, actor, path = '/api/admin/trips/x/pdf') => api.handleItineraryPdf(new Request('https://example.invalid' + path), id, actor);
const bytes = async (res) => new Uint8Array(await res.arrayBuffer());
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('Admin gets the same PDF file the customer gets, as a download', async () => {
  const id = await addTrip({ ref: 'TP-1000A', token: 'ABCDEFGHJKLMNPQRSTUV', snapshot: snap('TP-1000A') });
  const mine = await get(id, admin);
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get('content-type'), 'application/pdf');
  assert.match(mine.headers.get('content-disposition'), /^attachment; filename="Waydidi-TP-1000A-itinerary\.pdf"$/);
  const theirs = await customerRoute.GET(new Request('https://example.invalid/api/itinerary/t/pdf'), { params: Promise.resolve({ token: 'ABCDEFGHJKLMNPQRSTUV' }) });
  assert.equal(theirs.status, 200);
  assert.match(theirs.headers.get('content-disposition'), /^inline;/);
  const a = await bytes(mine), b = await bytes(theirs);
  assert.equal(String.fromCharCode(...a.slice(0, 4)), '%PDF');
  assert.ok(same(a, b), 'the very same bytes');
});

test('a trip that was never sent has no PDF yet; templates and unknown trips are not found; signed-out is refused', async () => {
  const draft = await addTrip({ ref: 'TP-2000B', token: 'BCDEFGHJKLMNPQRSTUVW', status: 'draft' });
  const res = await get(draft, admin);
  assert.equal(res.status, 409);assert.match((await res.json()).error, /Send the trip to the customer first/);
  const tpl = await addTrip({ ref: 'TP-3000C', token: 'CDEFGHJKLMNPQRSTUVWX', snapshot: snap('TP-3000C'), template: 1 });
  assert.equal((await get(tpl, admin)).status, 404);
  assert.equal((await get('missing', admin)).status, 404);
  assert.equal((await get(draft, null)).status, 401);
});

test('an agency downloads only its own trips', async () => {
  const mine = await addTrip({ ref: 'TP-4000D', token: 'DEFGHJKLMNPQRSTUVWXY', snapshot: snap('TP-4000D'), agencyId: 'ag1' });
  const theirs = await addTrip({ ref: 'TP-5000E', token: 'EFGHJKLMNPQRSTUVWXYZ', snapshot: snap('TP-5000E'), agencyId: 'ag2' });
  const agency = { kind: 'agency', name: 'Pat', agencyId: 'ag1', agencyName: 'Pat Travel' };
  assert.equal((await get(mine, agency)).status, 200);
  assert.equal((await get(theirs, agency)).status, 404);
  assert.equal((await get(mine, null)).status, 401);
});

test('a multi-day trip is one file with every day, the same as the customer\'s', async () => {
  const d1id = await addTrip({ ref: 'TP-6000F', token: 'FGHJKLMNPQRSTUVWXYZ2', snapshot: snap('TP-6000F'), groupId: 'g1', day: 1 });
  await addTrip({ ref: 'TP-6001F', token: 'GHJKLMNPQRSTUVWXYZ23', snapshot: snap('TP-6001F'), groupId: 'g1', day: 2 });
  const mine = await bytes(await get(d1id, admin));
  const theirs = await bytes(await customerRoute.GET(new Request('https://example.invalid/x'), { params: Promise.resolve({ token: 'FGHJKLMNPQRSTUVWXYZ2' }) }));
  assert.ok(same(mine, theirs));
  const single = await bytes(await get(await addTrip({ ref: 'TP-7000G', token: 'HJKLMNPQRSTUVWXYZ234', snapshot: snap('TP-7000G') }), admin));
  assert.ok(mine.length > single.length, 'two days are larger than one');
});
