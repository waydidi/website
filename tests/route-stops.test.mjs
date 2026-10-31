import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',optimizeDeps:{noDiscovery:true},resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const rules=await vite.ssrLoadModule('/lib/route-stops.ts');
const validation=await vite.ssrLoadModule('/lib/booking-validation.ts');
const box=(a,b)=>JSON.stringify([[{lat:a,lng:a},{lat:a,lng:b},{lat:b,lng:b},{lat:b,lng:a}]]);
const pickup={lat:1,lng:1},dropoff={lat:11,lng:11};
const offer={id:'offer',attractionId:'place',name:'Test place',photo:null,originZoneJson:box(0,2),destinationZoneJson:box(10,12),bidirectional:true,active:true,priceMinor:12345,durationMinutes:45,sort:0};
test('only active zone-matched offers are eligible, with explicit reverse direction',()=>{
 assert.deepEqual(rules.eligibleRouteStopOffers([offer,{...offer,id:'off',active:false}],pickup,dropoff),[offer]);
 assert.equal(rules.eligibleRouteStopOffers([offer],dropoff,pickup).length,1);
 assert.equal(rules.eligibleRouteStopOffers([{...offer,bidirectional:false}],dropoff,pickup).length,0);
 for(const point of [null,{lat:NaN,lng:1},{lat:99,lng:1},{lat:3,lng:3}]) assert.equal(rules.eligibleRouteStopOffers([offer],point,dropoff).length,0);
 assert.equal(rules.eligibleRouteStopOffers([{...offer,originZoneJson:'broken'}],pickup,dropoff).length,0);
});
test('selection reprices IDs from offers, snapshots only purchased fields, preserves order',()=>{
 const second={...offer,id:'second',priceMinor:1};
 assert.deepEqual(rules.selectRouteStops(true,['second','offer'],[offer,second],pickup,dropoff),[
 {offerId:'second',attractionId:'place',name:'Test place',durationMinutes:45,priceMinor:1},
 {offerId:'offer',attractionId:'place',name:'Test place',durationMinutes:45,priceMinor:12345}]);
});
test('disabled flag rejects paid selections, empty selection remains unchanged',()=>{
 assert.deepEqual(rules.selectRouteStops(false,[],[offer],pickup,dropoff),[]);
 assert.throws(()=>rules.selectRouteStops(false,['offer'],[offer],pickup,dropoff),/ROUTE_STOPS_DISABLED/);
});
test('duplicates, over three, unavailable and invalid persisted prices fail closed',()=>{
 for(const ids of [['offer','offer'],['a','b','c','d'],['missing']]) assert.throws(()=>rules.selectRouteStops(true,ids,[offer],pickup,dropoff));
 for(const priceMinor of [-1,1.2,NaN]) assert.throws(()=>rules.selectRouteStops(true,['offer'],[{...offer,priceMinor}],pickup,dropoff));
});
test('quote summary boundary accepts only at most three distinct offer IDs, never client snapshots',()=>{
 const input={outboundQuoteId:crypto.randomUUID(),routeStopIds:['offer']};
 assert.equal(validation.quoteSummaryInputSchema.safeParse(input).success,true);
 for(const extra of [{routeStopIds:['offer','offer']},{routeStopIds:['a','b','c','d']},{routeStops:[{priceMinor:1}]}]) assert.equal(validation.quoteSummaryInputSchema.safeParse({...input,...extra}).success,false);
});
test('checkout accepts IDs but rejects prices and hourly sightseeing selection',()=>{
 const input={checkoutAttemptId:crypto.randomUUID(),customerName:'Test',customerSurname:'Passenger',customerEmail:'test@example.invalid',customerPhone:'+66123456789',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:new Date(Date.now()+30*86400000).toISOString().slice(0,10),pickupTime:'10:00',timezone:'Asia/Bangkok',passengers:2,luggage:1,vehicle:'economy_sedan',childSeats:0,oversizedLuggage:false,termsAccepted:true,paymentMethod:'card',fareQuoteId:crypto.randomUUID(),routeStopIds:['offer']};
 assert.equal(validation.checkoutInputSchema.safeParse(input).success,true);
 assert.equal(validation.checkoutInputSchema.safeParse({...input,routeStopsTotalMinor:1}).success,false);
 assert.equal(validation.checkoutInputSchema.safeParse({...input,serviceType:'hourly',hourlyQuoteId:crypto.randomUUID(),bookedHours:4}).success,false);
});

test('persisted snapshots are frozen validated values and totals stay in integer satang',()=>{
 const snapshot={offerId:'offer',attractionId:'place',name:'Purchased place',durationMinutes:45,priceMinor:12345};
 assert.deepEqual(rules.parseRouteStopSnapshots(JSON.stringify([snapshot])),[snapshot]);
 for(const legacy of [null,undefined,'','[]']) assert.deepEqual(rules.parseRouteStopSnapshots(legacy),[]);
 for(const bad of ['broken','{}',JSON.stringify([{...snapshot,priceMinor:-1}]),JSON.stringify([{...snapshot,durationMinutes:1.5}])]) assert.throws(()=>rules.parseRouteStopSnapshots(bad));
 assert.equal(rules.stopTotalMinor([snapshot,{...snapshot,priceMinor:1}]),12346);
 assert.equal(rules.stopDurationMinutes([snapshot,snapshot]),90);
});
