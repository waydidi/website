import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());
const load = () => vite.ssrLoadModule('/lib/mcp/protocol.ts');
const request = (body, method = 'POST') => new Request('https://waydidi.com/mcp', { method, headers: { 'content-type': 'application/json', origin: 'https://assistant.example' }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const rpc = (method, params = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const dependencies = { enabled: true, allow: async () => true, callTool: async () => ({ ok: true }), resources: [] };
test('stateless MCP initialize, ping, notifications and tool discovery', async () => {
  const { handleMcp } = await load();
  const init = await handleMcp(request(rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })), dependencies);
  assert.equal(init.status, 200);
  assert.equal(init.headers.get('access-control-allow-origin'), '*');
  assert.equal(init.headers.has('set-cookie'), false);
  const body = await init.json();
  assert.equal(body.result.protocolVersion, '2025-03-26');
  assert.equal(body.result.serverInfo.name, 'Waydidi');
  assert.deepEqual((await (await handleMcp(request(rpc('ping')), dependencies)).json()).result, {});
  assert.equal((await handleMcp(request({ jsonrpc: '2.0', method: 'notifications/initialized' }), dependencies)).status, 202);
  const tools = (await (await handleMcp(request(rpc('tools/list')), dependencies)).json()).result.tools;
  assert.deepEqual(tools.map(t => t.name), ['search_places', 'get_quote', 'get_booking_link']);
  assert.ok(tools.every(t => t.annotations.readOnlyHint === true && t.inputSchema.type === 'object'));
});
test('protocol errors, flag, CORS and fail-closed rate limit', async () => {
  const { handleMcp } = await load();
  for (const [body, code] of [['{', -32700], [[], -32600], [{ jsonrpc: '1.0', method: 'ping', id: 1 }, -32600], [rpc('missing'), -32601], [rpc('initialize'), -32602], [rpc('tools/call', { name: 'missing' }), -32602]]) {
    assert.equal((await (await handleMcp(request(body), dependencies)).json()).error.code, code);
  }
  assert.equal((await handleMcp(request(rpc('ping')), { ...dependencies, enabled: false })).status, 404);
  assert.equal((await handleMcp(request(null, 'GET'), dependencies)).status, 405);
  const preflight = await handleMcp(request(null, 'OPTIONS'), dependencies);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.has('access-control-allow-credentials'), false);
  assert.equal((await handleMcp(request(rpc('ping')), { ...dependencies, allow: async () => false })).status, 429);
  assert.equal((await handleMcp(request(rpc('ping')), { ...dependencies, allow: async () => { throw Error('D1 down'); } })).status, 503);
});
const trip = { pickup: 'Suvarnabhumi Airport (BKK)', dropoff: 'Pattaya', date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), time: '12:30', passengers: 2, bags: 0 };
test('each tool rejects invalid input before any execution or paid lookup', async () => {
  const { handleMcp } = await load();
  let calls = 0;
  for (const [name, args] of [['search_places', { query: '' }], ['get_quote', { ...trip, passengers: 0 }], ['get_quote', { ...trip, date: '2099-02-30' }], ['get_quote', { ...trip, service: 'hourly' }], ['get_booking_link', { ...trip, vehicle: 'bus' }], ['get_booking_link', { ...trip, vehicle: 'comfort_suv', customerEmail: 'private@example.invalid' }]]) {
    const response = await handleMcp(request(rpc('tools/call', { name, arguments: args })), { ...dependencies, callTool: async () => { calls++; } });
    assert.equal((await response.json()).error.code, -32602);
  }
  assert.equal(calls, 0);
});
test('public search, resources and booking link round-trip are entirely local', async () => {
  const { callPublicTool, resources } = await vite.ssrLoadModule('/lib/mcp/tools.ts');
  const { parseMcpPrefill } = await vite.ssrLoadModule('/lib/mcp/booking-link.ts');
  const places = await callPublicTool('search_places', { query: 'BKK' });
  assert.ok(places.places.some(p => p.name.includes('Suvarnabhumi')));
  const city = await callPublicTool('search_places', { query: 'Pattaya' });
  assert.ok(city.places.some(p => p.name === 'Pattaya'));
  for (const service of ['transfer', 'hourly']) {
    const args = { ...trip, service, hours: 5, currency: 'THB', vehicle: 'comfort_suv' };
    const link = await callPublicTool('get_booking_link', args);
    assert.equal(new URL(link.url).origin, 'https://waydidi.com');
    assert.deepEqual(parseMcpPrefill(new URL(link.url).searchParams), args);
  }
  assert.equal(parseMcpPrefill(new URLSearchParams('rebook=mcp&pickup=bad')), null);
  const { handleMcp } = await load();
  const deps = { ...dependencies, callTool: callPublicTool, resources };
  for (const resource of resources) {
    const data = await (await handleMcp(request(rpc('resources/read', { uri: resource.uri })), deps)).json();
    assert.ok(data.result.contents[0].text.length > 20);
  }
  assert.equal(resources.length, 4);
  const data = await (await handleMcp(request(rpc('tools/call', { name: 'search_places', arguments: { query: 'Bangkok' } })), deps)).json();
  assert.ok(data.result.structuredContent.places.length);
});

test('quote prices reject fractional satang rather than silently rounding', async () => {
  const { quoteWith } = await vite.ssrLoadModule('/lib/mcp/quote.ts');
  await assert.rejects(() => quoteWith({ ...trip, service: 'transfer', currency: 'THB' }, {
    resolve: async text => ({ id: text, text }),
    transfer: async () => Response.json({ prices: { economy_sedan: { total: 1250.001 } } }),
    hourly: async () => { throw Error('Unexpected hourly quote'); },
  }, 'money-test'), /INVALID_MONEY_PRECISION/);
});

test('booking flow consumes validated MCP prefill, including zero bags and hourly destination', async()=>{
  const source = await readFile(root+'/components/home/booking-flow.tsx','utf8');
  assert.match(source, /parseMcpPrefill\(params\)/);
  assert.match(source, /luggage: mcp.bags/);
  assert.match(source, /dropoff: mcp.dropoff/);
});
test('discovery is public only when enabled, and advertises the implemented tools',async()=>{
  const { discoveryResponse } = await vite.ssrLoadModule('/lib/mcp/discovery.ts');
  for(const path of ['/llms.txt','/.well-known/mcp.json']) {
    assert.equal(discoveryResponse(path,false).status,404);
    const response=discoveryResponse(path,true); assert.equal(response.status,200);
    assert.match(await response.text(),/https:\/\/waydidi.com\/mcp/);
  }
  const card=await discoveryResponse('/.well-known/mcp.json',true).json();
  assert.deepEqual(card.tools,['search_places','get_quote','get_booking_link']);
});
test('worker gates MCP and discovery on MCP_PUBLIC and reports maintenance before the app handler', async () => {
  const source = await readFile(root + '/worker/index.ts', 'utf8');
  const start = source.indexOf('["/mcp", "/llms.txt", "/.well-known/mcp.json"]');
  assert.ok(start > 0);
  const hunk = source.slice(start, source.indexOf('// Maintenance mode', start));
  assert.ok(hunk.indexOf('MCP_PUBLIC !== "1"') < hunk.indexOf('maintenanceOn(env)'));
  assert.ok(hunk.indexOf('maintenanceOn(env)') < hunk.indexOf('handler.fetch'));
  assert.match(hunk, /status: 503/);
  assert.doesNotMatch(hunk, /readCookie|staffForToken/);
});
