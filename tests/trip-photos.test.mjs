import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// The customer itinerary page: the photo strip built from the trip's attractions, highlights and what the price includes.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const p = await vite.ssrLoadModule('/lib/trip-photos.ts');
const stop = (id, cover, gallery = [], extra = {}) => ({ id, name: `Stop ${id}`, cover, gallery, ...extra });

test('every stop cover comes first in visiting order, then gallery photos one stop at a time', () => {
  const photos = p.tripPhotos([stop('a', 'https://img/a.jpg', ['https://img/a1.jpg', 'https://img/a2.jpg']), stop('b', 'https://img/b.jpg', ['https://img/b1.jpg'])]);
  assert.deepEqual(photos.map((x) => x.src), ['https://img/a.jpg', 'https://img/b.jpg', 'https://img/a1.jpg', 'https://img/b1.jpg', 'https://img/a2.jpg']);
  assert.deepEqual(photos.map((x) => x.stop), ['Stop a', 'Stop b', 'Stop a', 'Stop b', 'Stop a'], 'each photo is labelled with its stop');
});

test('a stop without a cover uses its first gallery photo; a stop without photos adds nothing', () => {
  const photos = p.tripPhotos([stop('a', null, ['https://img/a1.jpg', 'https://img/a2.jpg']), stop('b', null, []), stop('c', 'https://img/c.jpg')]);
  assert.deepEqual(photos.map((x) => x.src), ['https://img/a1.jpg', 'https://img/c.jpg', 'https://img/a2.jpg']);
  assert.deepEqual(p.tripPhotos([stop('x', null, [])]), [], 'no photos: the page shows no gallery');
});

test('the same picture used by two stops appears once; unsafe links are left out; at most 40', () => {
  const photos = p.tripPhotos([stop('a', 'https://img/same.jpg'), stop('b', 'https://img/same.jpg', ['javascript:alert(1)', 'http://plain/x.jpg', '/uploads/b.webp'])]);
  assert.deepEqual(photos.map((x) => x.src), ['https://img/same.jpg', '/uploads/b.webp']);
  const many = Array.from({ length: 6 }, (_, i) => stop(String(i), `https://img/${i}.jpg`, Array.from({ length: 12 }, (_, j) => `https://img/${i}-${j}.jpg`)));
  assert.equal(p.tripPhotos(many).length, 40);
});

test('highlights are grouped by stop; tickets split into included and paid on the day', () => {
  const stops = [stop('a', null, [], { highlights: ['Bathe the elephants'], fee: { included: true } }), stop('b', null, [], { highlights: [], fee: { included: false } }), stop('c', null, [], { fee: null })];
  assert.deepEqual(p.tripHighlights(stops), [{ stop: 'Stop a', items: ['Bathe the elephants'] }]);
  assert.deepEqual(p.ticketStops(stops), { included: ['Stop a'], onSite: ['Stop b'] });
  assert.deepEqual(p.ticketStops([stop('a', null, [], { fee: { included: true } }), stop('a', null, [], { fee: { included: true } })]).included, ['Stop a'], 'a stop visited twice is named once');
});

test("a sent trip shows the attraction's photos as they are now; without any it keeps the photos it was sent with", () => {
  const stops = [stop('a', null), stop('b', '/old-b.jpg', ['/old-b1.jpg']), stop('c', '/old-c.jpg'), stop('d', null)];
  const now = { 'att-a': { coverImage: '/a.jpg', gallery: ['/a1.jpg'] }, 'att-b': { coverImage: null, gallery: [] }, 'att-d': { coverImage: null, gallery: ['/d1.jpg', '/d2.jpg'] } };
  const out = p.withCurrentPhotos(stops, { a: 'att-a', b: 'att-b', c: 'att-gone', d: 'att-d' }, now);
  assert.deepEqual(out.map((s) => [s.cover, s.gallery]), [['/a.jpg', ['/a1.jpg']], ['/old-b.jpg', ['/old-b1.jpg']], ['/old-c.jpg', []], ['/d1.jpg', ['/d2.jpg']]]);
  assert.equal(out[0].name, 'Stop a', 'everything else as sent');
});
