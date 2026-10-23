import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// Admin → "Split into days" end to end on an in-memory D1: a one-day trip whose places do not fit becomes a
// multi-day trip; the transport price and discount are shared so the total stays the same, and only staff can do it.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
globalThis.__splitEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'split-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0split-env'; }, load(id) { if (id === '\0split-env') return 'export const env=globalThis.__splitEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__splitEnv; });
const api = await vite.ssrLoadModule('/lib/trip-api.ts');
const trips = await vite.ssrLoadModule('/lib/smart-trips.ts');

const now = new Date().toISOString();
// Five 3-hour places a few minutes apart in Phuket: too much for one 8-hour day, three days are enough.
const places = ['Big Buddha', 'Wat Chalong', 'Old Town', 'Karon Viewpoint', 'Promthep Cape'];
for (const [i, name] of places.entries())
  await d1.prepare("INSERT INTO attractions(id,name,area,latitude,longitude,duration_min,open_time,close_time,status,created_at,updated_at) VALUES(?,?,'Phuket',?,?,180,'08:00','20:00','active',?,?)")
    .bind(`p${i}`, name, 7.85 + i * 0.01, 98.33, now, now).run();
const stops = (n = 5) => places.slice(0, n).map((name, i) => ({ id: `s${i}`, kind: 'attraction', name, attractionId: `p${i}`, lat: 7.85 + i * 0.01, lng: 98.33, durationMin: 180, priority: 'must' }));
async function newTrip(extra = {}) {
  const input = trips.tripSchema.parse({ title: 'Phuket highlights', tripDate: '2026-12-01', startTime: '08:00', pickupText: 'Hilton Phuket', pickupLat: 7.84, pickupLng: 98.33,
    durationHours: 8, adults: 2, children: 0, bags: 2, vehicle: 'economy_sedan', stops: stops(), transportPrice: 12000, discount: 500, ...extra });
  return (await trips.saveTrip(input, { name: 'Owner', agencyId: extra.agencyId ?? null })).id;
}
const admin = { kind: 'admin', name: 'Owner' };
const post = (id, actor, action = 'split_days') => api.handleAction(new Request('https://example.invalid/api/admin/trips/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }), id, actor);
const group = async (id) => (await d1.prepare('SELECT * FROM smart_trips WHERE group_id=? ORDER BY day_number').bind(id).all()).results;

test('a trip that does not fit one day becomes three days: same link, every place once, price and discount add up exactly', async () => {
  const id = await newTrip();
  const lead = await d1.prepare('SELECT token, ref FROM smart_trips WHERE id=?').bind(id).first();
  const res = await post(id, admin);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id, days: 3, fits: true });
  const days = await group(id);
  assert.deepEqual(days.map((d) => [d.day_number, d.trip_date]), [[1, '2026-12-01'], [2, '2026-12-02'], [3, '2026-12-03']]);
  assert.equal(days[0].id, id);
  assert.deepEqual([days[0].token, days[0].ref], [lead.token, lead.ref], 'day 1 keeps the link the customer may already have');
  const placed = days.flatMap((d) => JSON.parse(d.stops_json).map((s) => s.name)).sort();
  assert.deepEqual(placed, [...places].sort());
  assert.equal(days.reduce((n, d) => n + d.transport_price, 0), 12000);
  assert.equal(days.reduce((n, d) => n + d.discount, 0), 500);
  for (const d of days) {
    assert.ok(d.duration_hours >= 1 && d.duration_hours <= 8);
    assert.deepEqual([d.vehicle, d.adults, d.pickup_text], ['economy_sedan', 2, 'Hilton Phuket'], 'same guests, car and pickup every day');
  }
  // Again on the same trip: refused, nothing changes.
  const again = await post(id, admin);
  assert.equal(again.status, 409);
  assert.equal((await group(id)).length, 3);
});

test('two clicks at the same moment make one set of days, not two', async () => {
  const id = await newTrip();
  const results = await Promise.all([post(id, admin), post(id, admin)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await group(id)).length, 3);
  assert.equal((await d1.prepare("SELECT COUNT(*) n FROM smart_trips WHERE title='Phuket highlights' AND group_id IS NULL AND created_at >= ?").bind(now).first()).n, 0, 'no stray days');
});

test('refused: places that fit one day, a paid trip, a template, another agency, and no sign-in', async () => {
  const fits = await newTrip({ stops: stops(2) });
  const r1 = await post(fits, admin);
  assert.equal(r1.status, 409);
  assert.match((await r1.json()).error, /already fit one day/);
  assert.equal((await d1.prepare('SELECT group_id FROM smart_trips WHERE id=?').bind(fits).first()).group_id, null, 'still a single day');

  const paid = await newTrip();
  await d1.prepare("UPDATE smart_trips SET status='accepted' WHERE id=?").bind(paid).run();
  assert.equal((await post(paid, admin)).status, 409);

  const template = await newTrip({ isTemplate: true });
  assert.equal((await post(template, admin)).status, 400);

  await d1.prepare("INSERT INTO agency_applications(id,agency_name,contact_name,email,phone,status,created_at,updated_at) VALUES('ag1','Sea Tours','A','a@example.com','1','approved',?,?)").bind(now, now).run().catch(() => undefined);
  const theirs = await newTrip({ agencyId: 'ag1' });
  assert.equal((await post(theirs, { kind: 'agency', name: 'Other', agencyId: 'ag2' })).status, 404, 'another agency cannot see it');
  assert.equal((await post(theirs, null)).status, 401);
  assert.equal((await group(theirs)).length, 0);
});
