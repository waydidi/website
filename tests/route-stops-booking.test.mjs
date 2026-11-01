import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.__stopBooking = { env: {}, quote: null, calls: [] };
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{
 name:'stop-booking-boundaries', enforce:'pre',
 resolveId(id) {
  if(id==='cloudflare:workers') return '\0stop-env';
  if(id.endsWith('/db')) return '\0stop-db';
  if(id.endsWith('/lib/route-stops-db')) return '\0stop-offers';
  if(id.endsWith('/lib/route-stops')) return '\0stop-rules';
 },
 load(id) {
  if(id==='\0stop-env') return 'export const env=globalThis.__stopBooking.env';
  if(id==='\0stop-db') return 'export function getDb(){return {query:{fareQuotes:{findFirst:async()=>{globalThis.__stopBooking.calls.push("quote");return globalThis.__stopBooking.quote}}}}}';
  if(id==='\0stop-offers') return 'export async function listRouteStopOffers(){globalThis.__stopBooking.calls.push("offers");return [{id:"one",name:"Temple",photo:null,durationMinutes:45,priceMinor:60000,active:true,originZoneJson:"private"},{id:"other",name:"Other",active:true}]}';
  if(id==='\0stop-rules') return 'export function selectRouteStops(enabled,ids,offers,pickup,dropoff){globalThis.__stopBooking.calls.push({ids,pickup,dropoff,enabled});if(ids[0]!=="one")throw Error("ineligible");return [offers[0]]}';
 }
}] });
after(async()=>{await vite.close();delete globalThis.__stopBooking;});
const request=(body,origin='https://example.invalid')=>new Request('https://example.invalid/api/booking/route-stops',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const route=()=>vite.ssrLoadModule('/app/api/booking/route-stops/route.ts');
test('stop choices and purchased snapshots have translated customer text',async()=>{
 const keys=['choose','description','duration','comfort','checking','error','total','snapshotHeading','snapshotMinutes','snapshotTotal'];
 for(const locale of ['en','th','zh']){const entries=JSON.parse(await readFile(root+'/messages/'+locale+'.json','utf8'));for(const key of keys)assert.ok(entries['routeStops.'+key],locale+':'+key);}
});
test('public help includes the free break without requiring separately arranged sightseeing',async()=>{
 const source=await readFile(root+'/lib/public-content.ts','utf8');
 assert.match(source,/A short comfort break is always included at no extra charge/);
 assert.doesNotMatch(source,/unless booked separately/);
});
test('offers stay off by default without reading storage',async()=>{
 const api=await route();globalThis.__stopBooking.calls=[];
 const response=await api.POST(request({quoteId:'test'}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{offers:[]});assert.deepEqual(globalThis.__stopBooking.calls,[]);
});
test('offers reject cross origin, invalid, missing and expired quotes',async()=>{
 const api=await route();globalThis.__stopBooking.env.ROUTE_STOPS='1';
 assert.equal((await api.POST(request({quoteId:'test'},'https://attacker.invalid'))).status,403);
 assert.equal((await api.POST(request({pickup:{lat:1,lng:2}}))).status,400);
 globalThis.__stopBooking.quote=null;assert.equal((await api.POST(request({quoteId:'test'}))).status,404);
 globalThis.__stopBooking.quote={expiresAt:'2000-01-01',departureDate:'2099-01-01',departureTime:'09:00'};assert.equal((await api.POST(request({quoteId:'test'}))).status,409);
});
test('offers use stored coordinates and expose only public card fields',async()=>{
 const api=await route();globalThis.__stopBooking.env.ROUTE_STOPS='1';globalThis.__stopBooking.calls=[];
 globalThis.__stopBooking.quote={createdAt:new Date().toISOString(),expiresAt:'2099-01-01',departureDate:'2099-01-01',departureTime:'09:00',pickupLatitude:13,pickupLongitude:100,dropoffLatitude:12,dropoffLongitude:99};
 const response=await api.POST(request({quoteId:'test',pickup:{lat:0,lng:0},priceMinor:1}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{offers:[{id:'one',name:'Temple',photo:null,durationMinutes:45,priceMinor:60000}]});
 assert.deepEqual(globalThis.__stopBooking.calls.find(c=>typeof c==='object').pickup,{lat:13,lng:100});
});
test('selection is quote-bound, toggles off, and cannot exceed three stops',async()=>{
 const {toggleRouteStop,selectedRouteStopIds}=await vite.ssrLoadModule('/lib/route-stop-selection.ts');
 let state={key:'old',ids:['old']};assert.deepEqual(selectedRouteStopIds(state,'new'),[]);
 for(const id of ['a','b','c','d']) state=toggleRouteStop(state,'new',id);
 assert.deepEqual(state,{key:'new',ids:['a','b','c']});
 state=toggleRouteStop(state,'new','b');assert.deepEqual(state.ids,['a','c']);
});
test('base vehicle summary never includes stops or policy adjustments a second time',async()=>{
 const source=await readFile(root+'/components/home/booking-flow.tsx','utf8');
 const helper=source.slice(source.indexOf('async function requestQuoteSummary('),source.indexOf('async function calculateTransferQuotes('));
 assert.match(helper,/JSON\.stringify\(\{ outboundQuoteId, returnQuoteId \}\)/);
});
test('booking wires selector after vehicle and sends IDs to summary and checkout, adding stops after discounts',async()=>{
 const source=await readFile(root+'/components/home/booking-flow.tsx','utf8');
 assert.match(source,/stage === "details"[^\n]*RouteStopChoice/);
 assert.ok([...source.matchAll(/routeStopIds[,\s}]/g)].length>=3);
 assert.match(source,/Math\.max\(0, optionFare - discount - memberDiscount\) \+ addons \+ routeStopsTotalMinor \/ 100/);
 assert.match(source,/quoteSummary\?\.routeStopsTotalMinor/);
});
