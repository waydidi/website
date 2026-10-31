import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true}});
after(()=>vite.close());
const {TRANSFER_ROUTES, quoteTransferRoute, transferBookingUrl}=await vite.ssrLoadModule('/lib/transfer-routes.ts');
test('curated routes have unique reversible slugs and real Thai coordinates',()=>{
 assert.ok(TRANSFER_ROUTES.length>=30);
 assert.equal(new Set(TRANSFER_ROUTES.map(r=>r.slug)).size,TRANSFER_ROUTES.length);
 for(const r of TRANSFER_ROUTES){
  assert.equal(r.slug,`${r.from.slug}-to-${r.to.slug}`);
  assert.ok(TRANSFER_ROUTES.some(x=>x.from.slug===r.to.slug && x.to.slug===r.from.slug));
  for(const p of [r.from,r.to]){assert.ok(p.lat>5&&p.lat<21);assert.ok(p.lng>97&&p.lng<106);}
  const url=new URL(transferBookingUrl(r),'https://waydidi.com');
  assert.equal(url.searchParams.get('pickup'),r.from.name);assert.equal(url.searchParams.get('dropoff'),r.to.name);
 }
});
test('published prices use destination area, real calculator and vehicle restrictions in satang',async()=>{
 const r=TRANSFER_ROUTES.find(r=>r.slug==='bkk-airport-to-pattaya');
 let distance;
 const result=await quoteTransferRoute(r,{matchArea:async p=>{assert.deepEqual(p,{lat:r.to.lat,lng:r.to.lng});return {id:'pattaya',pricingType:'fixed'};},prices:async(id,meters)=>{assert.equal(id,'pattaya');distance=meters;return {economy_sedan:{total:1500},comfort_bmw:{total:2500}};}});
 assert.equal(distance,r.distanceMeters);assert.deepEqual(result.pricesMinor,{economy_sedan:150000});
});
test('manual, empty, invalid and unavailable prices are never published',async()=>{
 const r=TRANSFER_ROUTES[0];
 for(const deps of [
  {matchArea:async()=>null,prices:async()=>{throw Error('must not price');}},
  {matchArea:async()=>({id:'x',pricingType:'manual'}),prices:async()=>{throw Error('must not price');}},
  ...[{}, {economy_sedan:{total:NaN}},{economy_sedan:{total:-1}}].map(p=>({matchArea:async()=>({id:'x',pricingType:'fixed'}),prices:async()=>p})),
  {matchArea:async()=>{throw Error('db down');},prices:async()=>({})}
 ])assert.equal(await quoteTransferRoute(r,deps),null);
});
