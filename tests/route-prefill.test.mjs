import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const result = await build({entryPoints:['lib/route-prefill.ts'],bundle:true,write:false,format:'esm',platform:'neutral'});
const { routePrefillKey } = await import('data:text/javascript,'+encodeURIComponent(result.outputFiles[0].text));

test('a route page prefill key is stable across prop object identities', () => {
 // The server page builds a new {pickup,dropoff} object on every render.
 assert.equal(routePrefillKey({pickup:'Suvarnabhumi Airport (BKK)',dropoff:'Bangkok'}), routePrefillKey({pickup:'Suvarnabhumi Airport (BKK)',dropoff:'Bangkok'}));
});
test('a different route gets a different prefill key, and no route has an empty key', () => {
 assert.notEqual(routePrefillKey({pickup:'A',dropoff:'B'}), routePrefillKey({pickup:'B',dropoff:'A'}));
 // Separator cannot be faked by joining strings differently.
 assert.notEqual(routePrefillKey({pickup:'A|B',dropoff:'C'}), routePrefillKey({pickup:'A',dropoff:'B|C'}));
 assert.equal(routePrefillKey(undefined), '');
});
test('the booking form prefill effect reruns only when the route key changes, not the prop identity', async () => {
 const source = await readFile(new URL('../components/home/booking-flow.tsx', import.meta.url), 'utf8');
 assert.match(source, /const initialRouteKey = routePrefillKey\(initialRoute\);/);
 assert.match(source, /\}, \[initialRouteKey\]\);/);
 assert.doesNotMatch(source, /\}, \[initialRoute\]\);/);
});
