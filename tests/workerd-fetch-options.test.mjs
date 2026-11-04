import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Server code runs on Cloudflare Workers (workerd), whose fetch refuses some options Node.js accepts.
// redirect: "error" made every Telegram, email and photo request fail in production while Node tests passed.
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], script: `
export default { async fetch(request) {
  const redirect = new URL(request.url).searchParams.get('redirect');
  try { await fetch('https://127.0.0.1:9/', { redirect, signal: AbortSignal.timeout(1500) }); return new Response('sent'); }
  catch (e) { return new Response(e instanceof TypeError && /redirect/i.test(e.message) ? 'refused' : 'sent'); }
} }` });
after(() => mf.dispose());
const attempt = async (redirect) => (await mf.dispatchFetch(`http://worker/?redirect=${redirect}`)).text();

test('workerd refuses redirect "error" and sends with "manual" or "follow"', async () => {
  assert.equal(await attempt('error'), 'refused');
  assert.equal(await attempt('manual'), 'sent');
  assert.equal(await attempt('follow'), 'sent');
});

async function* sources(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* sources(path);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) yield path;
  }
}
test('no server code asks fetch for a redirect mode workerd refuses', async () => {
  const bad = [];
  for (const dir of ['lib', 'app', 'worker', 'components', 'db']) for await (const path of sources(`${root}/${dir}`)) {
    const text = await readFile(path, 'utf8');
    if (/redirect\s*:\s*["'`](?:error)["'`]/.test(text)) bad.push(path.slice(root.length));
  }
  assert.deepEqual(bad, [], 'use redirect: "manual" and check the status code');
});
