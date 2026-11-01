import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
  const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8')).filter(s => s.trim());
  if (statements.length) await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__mcpEnv = { DB: d1, MCP_PUBLIC: '1', GOOGLE_MAPS_SERVER_KEY: 'mock', RATE_LIMIT_SALT: 'test-private-salt' };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'mcp-env', enforce: 'pre', resolveId(id) { if(id === 'cloudflare:workers') return '\0mcp-env'; }, load(id) { if(id === '\0mcp-env') return 'export const env=globalThis.__mcpEnv'; } }], server: { middlewareMode: true } });
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await vite.close(); await mf.dispose(); delete globalThis.__mcpEnv; });
globalThis.fetch = async (url) => {
  if(String(url).startsWith('https://places.googleapis.com/v1/places/')) {
    const id = String(url).split('/').at(-1);
    return Response.json({ id, formattedAddress: id, location: id === 'bangkok' ? {latitude:13.7563,longitude:100.5018} : {latitude:13.69,longitude:100.7501} });
  }
  if(String(url).startsWith('https://routes.googleapis.com/')) return Response.json({routes:[{distanceMeters:90000,duration:'7200s'}]});
  throw Error('Unexpected network: '+url);
};
const trip = { pickup:'place_id:bangkok',dropoff:'place_id:airport',date:new Date(Date.now()+30*86400000).toISOString().slice(0,10),time:'12:30',passengers:2,bags:0 };
const request = (path, body, ip='mcp-test') => new Request('https://waydidi.com'+path,{method:'POST',headers:{origin:'https://waydidi.com','content-type':'application/json','cf-connecting-ip':ip},body:JSON.stringify(body)});
test('MCP transfer and hourly prices equal the website handlers, with no booking or customer writes', async()=>{
  const { publicQuote } = await vite.ssrLoadModule('/lib/mcp/runtime.ts');
  const geometry=JSON.stringify([[{lat:13,lng:100},{lat:14,lng:100},{lat:14,lng:101},{lat:13,lng:101}]]);
  await d1.prepare("INSERT INTO pricing_areas(id,name,code,status,published_geometry_json,created_at,updated_at) VALUES('mcp-test','Test Bangkok','MCP','published',?,'x','x')").bind(geometry).run();
  for(const vehicle of ['economy_sedan','comfort_bmw','comfort_suv','premium_minivan']) await d1.prepare("INSERT INTO pricing_rules(id,area_id,vehicle_id,base_price,updated_at) VALUES(?,'mcp-test',?,1550,'x')").bind('mcp-'+vehicle,vehicle).run();
  for(const service of ['transfer','hourly']) {
    const route = await vite.ssrLoadModule('/app/api/'+(service==='transfer'?'fare-quote':'hourly-quote')+'/route.ts');
    const payload = {pickupPlaceId:'bangkok',dropoffPlaceId:'airport',pickupDate:trip.date,pickupTime:trip.time,timezone:'Asia/Bangkok',...(service==='hourly'?{areaSlug:'bangkok',bookedHours:6}:{})};
    const response = await route.POST(request('/api/quote',payload));
    const site = await response.json(); assert.equal(response.status,200,JSON.stringify(site));
    const result = await publicQuote({...trip,service,hours:6,currency:'USD'},'mcp-parity');
    assert.ok(result.vehicles.length);
    for(const v of result.vehicles) {
      assert.equal(v.priceMinor,site.prices[v.vehicle].total*100);
      assert.equal(v.currency,'THB'); assert.match(v.displayPrice,/USD/);
      assert.ok(v.capacity.passengers>=trip.passengers);
    }
    assert.deepEqual(result.inclusions,site.inclusions);
    assert.ok(Date.parse(result.expiresAt)>Date.now()); assert.equal(result.reserved,false);
  }
  for(const table of ['bookings','customers']) assert.equal((await d1.prepare('SELECT count(*) n FROM '+table).first()).n,0);
});
test('MCP public route flag and IP quotas fail closed before paid lookups',async()=>{
  const route = await vite.ssrLoadModule('/app/mcp/route.ts');
  const rpc={jsonrpc:'2.0',id:1,method:'ping'};
  globalThis.__mcpEnv.MCP_PUBLIC='0'; assert.equal((await route.POST(request('/mcp',rpc))).status,404);
  globalThis.__mcpEnv.MCP_PUBLIC='1';
  for(let i=0;i<60;i++) assert.equal((await route.POST(request('/mcp',rpc,'quota-ip'))).status,200);
  assert.equal((await route.POST(request('/mcp',rpc,'quota-ip'))).status,429);
  const { allowMcp } = await vite.ssrLoadModule('/lib/mcp/rate-limit.ts');
  for(let i=0;i<5;i++) assert.equal(await allowMcp(d1,'secret','paid-ip','quote'),true);
  assert.equal(await allowMcp(d1,'secret','paid-ip','quote'),false);
  assert.equal(await allowMcp(d1,'secret','other-ip','quote'),true);
});
