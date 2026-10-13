import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// An admin link tapped outside the site (Telegram "Open booking"): one hop through the site, then sign-in.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const gate = await vite.ssrLoadModule('/lib/admin-gate.ts');
const g = (o) => gate.adminGate({ method: 'GET', accept: 'text/html,application/xhtml+xml', secFetchSite: 'cross-site', hopped: false, ...o });

test('a page visit from outside the site without the cookie takes one hop; after the hop, or from inside the site, it goes to sign-in', () => {
  assert.equal(g({}), 'hop');
  assert.equal(g({ secFetchSite: null }), 'hop'); // a browser that sends no Sec-Fetch headers
  assert.equal(g({ secFetchSite: 'none' }), 'hop'); // typed or opened from another app
  assert.equal(g({ hopped: true }), 'sign-in'); // still no session after the hop: really signed out
  assert.equal(g({ secFetchSite: 'same-origin' }), 'sign-in'); // the cookie would have been sent: signed out
  assert.equal(g({ secFetchSite: 'same-site' }), 'sign-in');
  assert.equal(g({ method: 'HEAD' }), 'hop');
});

test('APIs, fetches and changes keep the plain 401, so nothing is ever hopped or redirected for them', () => {
  assert.equal(g({ accept: 'application/json' }), 'json401');
  assert.equal(g({ accept: '*/*' }), 'json401');
  assert.equal(g({ accept: null }), 'json401');
  assert.equal(g({ method: 'POST' }), 'json401');
  assert.equal(g({ method: 'DELETE', hopped: true }), 'json401');
});

test('the hop page reloads the same address, escaped for HTML and script', () => {
  const page = gate.adminHopPage('/admin/journeys/ABC?x=1&__hop=1');
  assert.match(page, /location\.replace\("\/admin\/journeys\/ABC\?x=1&__hop=1"\)/);
  assert.match(page, /<meta http-equiv="refresh" content="0;url=\/admin\/journeys\/ABC\?x=1&amp;__hop=1">/);
  const evil = gate.adminHopPage('/admin/x"></script><script>alert(1)</script>');
  assert.ok(!evil.includes('<script>alert(1)'));
  assert.ok(!/<\/script><script>/.test(evil.replace(/<script>location[^<]*<\/script>/, '')));
});
