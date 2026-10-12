import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ appType: 'custom', configFile: false, root, resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const liff = await vite.ssrLoadModule('/lib/liff.ts');
const LIFF_ID = '2001234567-AbCdEf12';
const token = 'header.payload.signature-long-enough';
const lineAnswer = (status, claims) => async (url, init) => {
  assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
  const body = new URLSearchParams(init.body);
  assert.equal(body.get('client_id'), '2001234567');
  assert.equal(body.get('id_token'), token);
  return new Response(JSON.stringify(claims), { status });
};
const claims = { iss: 'https://access.line.me', aud: '2001234567', sub: 'U123', exp: Math.floor(Date.now() / 1000) + 600, name: 'Somchai Jaidee', email: 'Somchai@Example.com' };

test('the LIFF channel comes from the LIFF ID', () => {
  assert.equal(liff.liffChannelId(LIFF_ID), '2001234567');
  assert.equal(liff.liffChannelId('nonsense'), null);
  assert.equal(liff.liffChannelId(undefined), null);
});

test('LIFF only continues to Waydidi LIFF and account pages', () => {
  assert.equal(liff.safeLiffNext('/account/trips/ABC123'), '/account/trips/ABC123');
  assert.equal(liff.safeLiffNext('/liff/trips'), '/liff/trips');
  assert.equal(liff.safeLiffNext('//evil.com'), '/liff/trips');
  assert.equal(liff.safeLiffNext('https://evil.com'), '/liff/trips');
  assert.equal(liff.safeLiffNext('/admin'), '/liff/trips');
  assert.equal(liff.safeLiffNext('/account//evil.com'), '/liff/trips');
});

test('a LIFF ID token is verified with LINE for this channel', async () => {
  const profile = await liff.verifyLiffIdToken(token, LIFF_ID, lineAnswer(200, claims));
  assert.deepEqual(profile, { providerUserId: 'U123', email: 'somchai@example.com', emailVerified: true, firstName: 'Somchai', lastName: 'Jaidee' });
  const noEmail = await liff.verifyLiffIdToken(token, LIFF_ID, lineAnswer(200, { ...claims, email: undefined }));
  assert.equal(noEmail.emailVerified, false);
});

test('rejected, foreign or expired tokens never sign anyone in', async () => {
  await assert.rejects(liff.verifyLiffIdToken(token, LIFF_ID, lineAnswer(400, { error: 'invalid_request' })), /rejected/);
  await assert.rejects(liff.verifyLiffIdToken(token, LIFF_ID, lineAnswer(200, { ...claims, aud: '999999999' })), /not issued/);
  await assert.rejects(liff.verifyLiffIdToken(token, LIFF_ID, lineAnswer(200, { ...claims, iss: 'https://evil.example' })), /not issued/);
  await assert.rejects(liff.verifyLiffIdToken(token, LIFF_ID, lineAnswer(200, { ...claims, exp: 1 })), /expired/);
  await assert.rejects(liff.verifyLiffIdToken('not-a-jwt', LIFF_ID, lineAnswer(200, claims)), /Malformed/);
  await assert.rejects(liff.verifyLiffIdToken(token, 'bad', lineAnswer(200, claims)), /not configured/);
});

test('the LIFF session route verifies with LINE and links only proven accounts', async () => {
  const route = await readFile(new URL('../app/api/liff/session/route.ts', import.meta.url), 'utf8');
  assert.match(route, /!sameOrigin\(request\) \|\| !isJsonRequest\(request\)/);
  assert.match(route, /verifyLiffIdToken\(input\.idToken, liffId\)/);
  assert.match(route, /customerFor\("line", profile\)/);
  assert.match(route, /customerFromRequest\(request\)/);
  const worker = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
  assert.match(worker, /const liff = \/\^\\\/liff\(\\\/\|\$\)\/\.test\(url\.pathname\)/);
});
