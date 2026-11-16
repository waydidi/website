import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// A place's fixed area, its one category and its tags, from what staff type or what Google Maps says (lib/place-words.ts),
// and the attraction schema that only saves areas from the fixed list (lib/attractions.ts).
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent', resolve: { alias: { '@': root } }, server: { middlewareMode: true },
  plugins: [{ name: 'pw-env', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers') return '\0pw-env'; }, load(id) { if (id === '\0pw-env') return 'export const env={}'; } }] });
after(() => vite.close());
const w = await vite.ssrLoadModule('/lib/place-words.ts');
const tax = await vite.ssrLoadModule('/lib/place-taxonomy.ts');
const { attractionSchema } = await vite.ssrLoadModule('/lib/attractions.ts');

test('the three new categories exist, each with a label', () => {
  for (const t of ['spa', 'nightlife', 'theme-park']) { assert.ok(tax.PLACE_TYPES.includes(t), t); assert.ok(tax.PLACE_TYPE_LABEL[t], t); }
  assert.equal(tax.PLACE_TYPE_LABEL['theme-park'], 'Theme / water park');
  assert.ok(tax.PLACE_TYPES.every((t) => tax.PLACE_TYPE_LABEL[t]), 'every category has a label');
});

test('a typed area, or a beach or district in it, gives the fixed area', () => {
  for (const [typed, area] of [['phuket', 'Phuket'], ['Patong', 'Phuket'], ['ป่าตอง', 'Phuket'], ['Ao Nang', 'Krabi'], ['Chaweng', 'Koh Samui'], ['koh samui', 'Koh Samui'],
    ['Khao Lak', 'Phang Nga'], ['jomtien', 'Pattaya'], ['Hua Hin', 'Hua Hin'], ['เชียงใหม่', 'Chiang Mai'], ['Sukhumvit', 'Bangkok'], ['Khao Yai', 'Khao Yai']])
    assert.equal(w.areaOf(typed), area, typed);
  for (const none of ['', 'Old Town', 'Tokyo', null]) assert.equal(w.areaOf(none), null, String(none));
  assert.equal(w.areaOf('Kata Beach, Karon, Phuket 83100, Thailand'), 'Phuket', 'a Google address');
  assert.ok(tax.PLACE_AREAS.every((a) => w.areaOf(a) === a), 'each fixed area reads as itself');
});

test('category words in English and Thai; longest phrase wins', () => {
  for (const [word, type] of [['temple', 'temple'], ['วัด', 'temple'], ['Water Park', 'theme-park'], ['theme-park', 'theme-park'], ['massage', 'spa'], ['นวด', 'spa'],
    ['nightlife', 'nightlife'], ['bar', 'nightlife'], ['rooftop bar', 'rooftop'], ['park', 'nature'], ['night market', 'market'], ['ตลาดน้ำ', 'market'], ['zoo', 'animal']])
    assert.equal(w.categoryOfWord(word), type, word);
  for (const none of ['Phuket', 'big', '']) assert.equal(w.categoryOfWord(none), null, none);
});

test("Google Maps' place type gives the category, the primary type first", () => {
  assert.equal(w.categoryFromGoogle('buddhist_temple', ['tourist_attraction']), 'temple');
  assert.equal(w.categoryFromGoogle(null, ['tourist_attraction', 'spa']), 'spa');
  assert.equal(w.categoryFromGoogle('water_park', []), 'theme-park');
  assert.equal(w.categoryFromGoogle('night_club', []), 'nightlife');
  assert.equal(w.categoryFromGoogle('observation_deck', ['tourist_attraction']), 'viewpoint');
  assert.equal(w.categoryFromGoogle('tourist_attraction', []), 'sight');
  assert.equal(w.categoryFromGoogle('lodging', ['hotel']), null, 'nothing fits: no category from Google');
});

test('#tags become the best time and vibes; other words are returned so staff are told', () => {
  assert.deepEqual(w.readTags('#sunset #instagram #family #ig'), { bestTime: 'sunset', vibes: ['instagram', 'family'], unknown: [] });
  assert.deepEqual(w.readTags('#morning #local-favourite #banana'), { bestTime: 'morning', vibes: ['local-favourite'], unknown: ['banana'] });
  assert.deepEqual(w.readTags(''), { bestTime: null, vibes: [], unknown: [] });
});

test('the attraction schema saves only fixed areas: typed ones are put right, unknown ones are refused', () => {
  const base = { name: 'Big Buddha', durationMin: 60 };
  assert.equal(attractionSchema.parse({ ...base, area: 'phuket' }).area, 'Phuket');
  assert.equal(attractionSchema.parse({ ...base, area: 'Patong' }).area, 'Phuket');
  assert.equal(attractionSchema.parse({ ...base, area: '' }).area, '', 'not known yet is allowed');
  assert.equal(attractionSchema.parse(base).area, '');
  const bad = attractionSchema.safeParse({ ...base, area: 'Old Town' });
  assert.equal(bad.success, false);
  assert.match(bad.error.issues[0].message, /Choose an area from the list: Bangkok, Pattaya, Phuket/);
});
