import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

// Packages of a place that needs booking (Admin → Attractions): several packages, each with its own price per person
// and an optional child price, always included in the trip total.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).map((s) => s.trim()).filter(Boolean);
  if (statements.length) await d1.batch(statements.map((s) => d1.prepare(s)));
}
globalThis.__pkgEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{ name: 'pkg-env', enforce: 'pre',
  resolveId(id) { if (id === 'cloudflare:workers') return '\0pkg-env'; }, load(id) { if (id === '\0pkg-env') return 'export const env=globalThis.__pkgEnv'; } }] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__pkgEnv; });
const { attractionSchema } = await vite.ssrLoadModule('/lib/attractions.ts');
const { tripFees } = await vite.ssrLoadModule('/lib/trip-plan.ts');

const pkg = (id, feeAdult, feeChild, extra = {}) => ({ id, name: id, durationMin: 240, feeAdult, feeChild, feeIncluded: false, bookingRequired: false, sessions: [], ...extra });
const place = (bookingRequired, programs) => ({ name: 'Phuket Elephant Sanctuary', durationMin: 240, bookingRequired, programs });

test('a place that needs booking keeps several packages, each always included in the trip total', () => {
  const saved = attractionSchema.parse(place(true, [pkg('half-day-morning', 3000, 1500, { sessions: [{ time: '09:00' }] }), pkg('half-day-afternoon', 3000, 3000, { sessions: [{ time: '13:30' }] }), pkg('full-day', 5000, 2500)]));
  assert.equal(saved.programs.length, 3);
  assert.ok(saved.programs.every((p) => p.feeIncluded && p.bookingRequired), 'included and needing a reservation, whatever was sent');
  assert.deepEqual(saved.programs.map((p) => [p.feeAdult, p.feeChild]), [[3000, 1500], [3000, 3000], [5000, 2500]]);
  // 2 adults and 1 child on the morning package: 2 × 3,000 + 1,500 in the total, nothing to pay on the day.
  const fees = tripFees([{ id: 's1', kind: 'attraction', name: 'Sanctuary', attractionId: 'pes', programId: 'half-day-morning', durationMin: 240, priority: 'must' }],
    { pes: { ...saved, id: 'pes', latitude: null, longitude: null, openTime: null, closeTime: null, lastEntry: null, closedDays: [], arrivalBufferMin: 0, exceptions: [], tags: [] } }, 2, 1);
  assert.deepEqual(fees, { included: 7500, onSite: 0 });
});

test('a place without booking keeps its programs as they were saved', () => {
  const saved = attractionSchema.parse(place(false, [pkg('walk', 200, 100)]));
  assert.deepEqual([saved.programs[0].feeIncluded, saved.programs[0].bookingRequired], [false, false]);
});

test('extra start times saved before stay; the limit is 20 packages', () => {
  const sessions = [{ time: '09:00' }, { time: '11:00', days: [1, 2, 3, 4, 5] }];
  assert.deepEqual(attractionSchema.parse(place(true, [pkg('canopy', 1000, 500, { sessions })])).programs[0].sessions, sessions);
  assert.equal(attractionSchema.safeParse(place(true, Array.from({ length: 21 }, (_, i) => pkg(`p${i}`, 100, 100)))).success, false);
});
