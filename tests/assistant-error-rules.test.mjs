import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import Anthropic from '@anthropic-ai/sdk';

// /c and /ask say why a Claude call failed (lib/assistant-error-rules.ts), using the SDK's real error classes.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const { assistantFailure } = await vite.ssrLoadModule('/lib/assistant-error-rules.ts');
const api = (status, type, message) => Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, message, new Headers());

test('each Anthropic failure gets a reason the team can act on', () => {
  const cases = [
    [api(401, 'authentication_error', 'invalid x-api-key'), 'auth'],
    [api(403, 'permission_error', 'not allowed'), 'permission'],
    [api(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'), 'credit'],
    [api(404, 'not_found_error', 'model: claude-x'), 'model'],
    [api(429, 'rate_limit_error', 'slow down'), 'rate_limited'],
    [api(529, 'overloaded_error', 'Overloaded'), 'busy'],
    [api(500, 'api_error', 'oops'), 'busy'],
    [api(400, 'invalid_request_error', 'tools.0: bad'), 'invalid_request'],
    [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    [new Anthropic.APIConnectionError({ message: 'fetch failed' }), 'connection'],
    [new Error('UNREADABLE'), 'unreadable'],
    [new Error('Telegram: request rejected'), 'telegram'],
    [new Error('D1_ERROR: something'), 'unknown'],
    [null, 'unknown'],
  ];
  for (const [error, code] of cases) assert.equal(assistantFailure(error).code, code, String(error?.message ?? error));
});

test('the reason never repeats the key, the post or a raw provider message', () => {
  const r = assistantFailure(api(401, 'authentication_error', 'invalid x-api-key sk-ant-SECRET'));
  assert.equal(r.reason.includes('sk-ant'), false);
  assert.match(r.reason, /ANTHROPIC_API_KEY/);
  assert.match(assistantFailure(api(400, 'invalid_request_error', 'Your credit balance is too low')).reason, /out of credit/);
});
