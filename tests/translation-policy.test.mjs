import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const policy = await vite.ssrLoadModule('/lib/site-translation-policy.ts');

test('every approved line that holds an entity is also approved as the browser sends it (decoded)', () => {
  const lines = JSON.parse(readFileSync(new URL('../lib/site-translation-sources.json', import.meta.url), 'utf8')).filter((t) => /&(apos|amp|quot|lt|gt|#39|nbsp);/.test(t));
  assert.ok(lines.length > 10);
  for (const line of lines) { assert.equal(policy.approvedTranslationText(line), true); assert.equal(policy.approvedTranslationText(policy.decodeEntities(line)), true, line.slice(0, 60)); }
  assert.equal(policy.approvedTranslationText("If you are running late, contact Waydidi as soon as possible. Waiting times depend on the service (for example, airport pickups wait from your flight's actual landing time), and you are not treated as a no-show the moment the pickup time passes."), true);
});

test('decoding turns the common entities into plain text, and unknown text stays refused', () => {
  assert.equal(policy.decodeEntities('Can&apos;t &amp; won&#39;t &quot;ever&quot; &lt;b&gt;'), 'Can\'t & won\'t "ever" <b>');
  assert.equal(policy.approvedTranslationText('Something a visitor typed that is not in the page source'), false);
  assert.equal(policy.approvedTranslationText(''), false);
});
