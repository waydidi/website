import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {readdir,readFile} from 'node:fs/promises';
import {migrationStatements} from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));}
globalThis.__stopsEnv={DB:d1,RATE_LIMIT_SALT:'isolated-route-stops-test-secret',ROUTE_STOPS:'1',CANCELLATION_OPTIONS:'1'};
const vite=await createServer({root,configFile:false,appType:'custom',optimizeDeps:{noDiscovery:true},resolve:{alias:{'@':root}},plugins:[{name:'stops-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0stops-env';if(id.endsWith('/lib/booking-fulfillment'))return '\0stops-fulfillment';},load(id){if(id==='\0stops-env')return 'export const env=globalThis.__stopsEnv';if(id==='\0stops-fulfillment')return 'export async function fulfillBooking(){}';}}],server:{middlewareMode:true,hmr:false}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__stopsEnv;});
const store=await vite.ssrLoadModule('/lib/route-stops-db.ts');
const {getDb}=await vite.ssrLoadModule('/db/index.ts');
const schema=await vite.ssrLoadModule('/db/schema.ts');
const checkout=await vite.ssrLoadModule('/app/api/checkout/route.ts');
const summary=await vite.ssrLoadModule('/app/api/booking/quote-summary/route.ts');
const now=new Date().toISOString(),date=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
await getDb().insert(schema.attractions).values({id:'stop-place',name:'Purchased place',createdAt:now,updatedAt:now});
const box=(s,n,w,e)=>JSON.stringify([[{lat:s,lng:w},{lat:s,lng:e},{lat:n,lng:e},{lat:n,lng:w}]]);
const offer={id:'paid-stop',attractionId:'stop-place',originZoneJson:box(13.45,14.05,100.25,100.97),destinationZoneJson:box(12.62,13.02,100.82,101),bidirectional:true,active:true,priceMinor:12345,durationMinutes:45,sort:0};
await store.saveRouteStopOffer(offer);
await d1.prepare('UPDATE price_seasons SET active=0').run();
const quoteId=crypto.randomUUID();
await getDb().insert(schema.fareQuotes).values({id:quoteId,pickupPlaceId:'bkk',dropoffPlaceId:'pattaya',pickupText:'Suvarnabhumi Airport',dropoffText:'Pattaya',areaId:'sample-pattaya',areaName:'Pattaya',distanceMeters:125000,durationSeconds:6000,pickupLatitude:13.69,pickupLongitude:100.75,dropoffLatitude:12.93,dropoffLongitude:100.88,vehiclePricesJson:JSON.stringify({economy_sedan:{total:1400,basePrice:1400,distanceSurcharge:0}}),pricingVersion:1,departureDate:date,departureTime:'10:00',timezone:'Asia/Bangkok',expiresAt:new Date(Date.now()+1800000).toISOString(),createdAt:now});
let seq=0;
function request(path,body){return new Request('https://example.invalid'+path,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','cf-connecting-ip':'stop-test-'+ ++seq},body:JSON.stringify(body)});}
function input(overrides={}){return {checkoutAttemptId:crypto.randomUUID(),customerName:'Test',customerSurname:'Passenger',customerEmail:'test@example.invalid',customerPhone:'+66123456789',pickup:'Suvarnabhumi Airport',dropoff:'Pattaya',pickupDate:date,pickupTime:'10:00',timezone:'Asia/Bangkok',passengers:2,luggage:1,vehicle:'economy_sedan',childSeats:1,oversizedLuggage:false,termsAccepted:true,paymentMethod:'cash',fareQuoteId:quoteId,routeStopIds:['paid-stop'],cancellationOption:'flexible',...overrides};}
test('snapshot migration and first-use bootstrap are safe to repeat',async()=>{
 const sql=await readFile(root+'/drizzle/0117_booking_route_stops.sql','utf8');for(let i=0;i<2;i++)await d1.batch(migrationStatements(sql).map(s=>d1.prepare(s)));
 await store.ensureBookingRouteStops();await store.ensureBookingRouteStops();assert.deepEqual(await store.loadBookingRouteStops('legacy-without-stops'),[]);
});
test('real percent promo discounts only the cancellation-adjusted fare, not stops or add-ons',async()=>{
 await getDb().insert(schema.promoCodes).values({id:'stop-promo',code:'STOPFARE10',title:'Test fare discount',discountType:'percent',discountValue:10,perCustomerLimit:100,status:'active',createdAt:now,updatedAt:now});
 const r=await checkout.POST(request('/api/checkout',input({promoCode:'STOPFARE10'})));const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
 const b=await d1.prepare('SELECT total FROM bookings WHERE reference=?').bind(body.reference).first();assert.equal(b.total,1872.45);
 const redemption=await d1.prepare('SELECT original_total,discount FROM promo_redemptions WHERE booking_reference=?').bind(body.reference).first();assert.deepEqual(redemption,{original_total:1610,discount:161});
});
test('summary adds face-value stop price after cancellation adjustment and extends only outbound duration',async()=>{
 const r=await summary.POST(request('/api/booking/quote-summary',{outboundQuoteId:quoteId,routeStopIds:['paid-stop'],cancellationOption:'flexible'}));const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.prices.economy_sedan.total,1733.45);assert.equal(body.routeStopsTotalMinor,12345);assert.equal(body.routeStops[0].name,'Purchased place');assert.equal(body.outbound.durationSeconds,8700);
});
test('checkout charges stop at face value after discounted fare and add-ons; retry freezes snapshots',async()=>{
 const payload=input();const r=await checkout.POST(request('/api/checkout',payload));const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
 const b=await d1.prepare('SELECT * FROM bookings WHERE reference=?').bind(body.reference).first();assert.equal(b.total,2033.45);assert.equal(b.route_duration_seconds,8700);assert.equal(b.outbound_total,1400);
 // Refund the entire paid booking, not just the fare: the purchased policy includes stops.
 const {acceptedPolicy}=await vite.ssrLoadModule('/lib/accepted-policy.ts');
 const {refundPercent,customerRefundMinor}=await vite.ssrLoadModule('/lib/refund-policy.ts');
 const policy=await acceptedPolicy(body.reference);assert.equal(policy.option,'flexible');
 assert.equal(customerRefundMinor(Math.round(b.total*100),refundPercent('customer_cancellation',12,policy.tiers)),203345);
 assert.equal(customerRefundMinor(Math.round(b.total*100),refundPercent('customer_cancellation',11,policy.tiers)),0);
 assert.equal(customerRefundMinor(Math.round(b.total*100),refundPercent('waydidi_cancellation',0,policy.tiers)),203345);
 const snapshots=await store.loadBookingRouteStops(body.reference);assert.deepEqual(snapshots,[{offerId:'paid-stop',attractionId:'stop-place',name:'Purchased place',durationMinutes:45,priceMinor:12345}]);
 await store.saveRouteStopOffer({...offer,priceMinor:99999,active:false});await d1.prepare("UPDATE attractions SET name='Changed place' WHERE id='stop-place'").run();globalThis.__stopsEnv.ROUTE_STOPS='0';
 const retry=await checkout.POST(request('/api/checkout',payload));assert.equal(retry.status,200,JSON.stringify(await retry.json()));assert.deepEqual(await store.loadBookingRouteStops(body.reference),snapshots);
 globalThis.__stopsEnv.ROUTE_STOPS='1';await store.saveRouteStopOffer(offer);
});
test('disabled checkout and summary refuse selection and create no booking; empty selection preserves fare',async()=>{
 globalThis.__stopsEnv.ROUTE_STOPS='0';
 try {const r=await checkout.POST(request('/api/checkout',input()));assert.equal(r.status,409);const s=await summary.POST(request('/api/booking/quote-summary',{outboundQuoteId:quoteId,routeStopIds:['paid-stop']}));assert.equal(s.status,409);
 const r2=await checkout.POST(request('/api/checkout',input({routeStopIds:[],childSeats:0,cancellationOption:'standard'})));const b2=await r2.json();assert.equal(r2.status,200,JSON.stringify(b2));assert.equal((await d1.prepare('SELECT total FROM bookings WHERE reference=?').bind(b2.reference).first()).total,1400);assert.deepEqual(await store.loadBookingRouteStops(b2.reference),[]);
 } finally {globalThis.__stopsEnv.ROUTE_STOPS='1';}
});
test('booking snapshots persist in the atomic checkout transaction and online changes fail closed',async()=>{
 const {onlineBookingChangeAllowed}=await vite.ssrLoadModule('/lib/booking-change.ts');
 const r=await checkout.POST(request('/api/checkout',input({cancellationOption:'standard'})));const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
 const b=await d1.prepare('SELECT route_stops_json FROM booking_route_stops WHERE booking_reference=?').bind(body.reference).first();
 assert.equal(JSON.parse(b.route_stops_json)[0].priceMinor,12345);
 assert.equal(await onlineBookingChangeAllowed(body.reference),false);
 await d1.prepare("UPDATE booking_route_stops SET route_stops_json='[{}]' WHERE booking_reference=?").bind(body.reference).run();
 assert.equal(await onlineBookingChangeAllowed(body.reference),false);
});
test('ineligible and inactive offers are refused without inserting a booking',async()=>{
 for(const routeStopIds of [['missing'],['paid-stop','paid-stop']]) {
 const payload=input({routeStopIds});const before=await d1.prepare('SELECT COUNT(*) n FROM bookings').first();
 const r=await checkout.POST(request('/api/checkout',payload));assert.ok([400,409].includes(r.status));
 assert.equal((await d1.prepare('SELECT COUNT(*) n FROM bookings').first()).n,before.n);
 }
 await store.saveRouteStopOffer({...offer,active:false});
 try {const r=await checkout.POST(request('/api/checkout',input()));assert.equal(r.status,409);}finally{await store.saveRouteStopOffer(offer);}
});

test('concurrent checkout retries freeze exactly one booking and one stop snapshot',async()=>{
 const payload=input({cancellationOption:'standard',childSeats:0});const responses=await Promise.all([checkout.POST(request('/api/checkout',payload)),checkout.POST(request('/api/checkout',payload))]);
 const bodies=await Promise.all(responses.map(r=>r.json()));assert.ok(responses.every(r=>r.status===200),JSON.stringify(bodies));assert.equal(bodies[0].reference,bodies[1].reference);
 assert.equal((await d1.prepare('SELECT COUNT(*) n FROM booking_route_stops WHERE booking_reference=?').bind(bodies[0].reference).first()).n,1);
});
test('round trip charges outbound stops once and keeps return duration unchanged',async()=>{
 const {eq}=await import('drizzle-orm');const [out]=await getDb().select().from(schema.fareQuotes).where(eq(schema.fareQuotes.id,quoteId));
 const backId=crypto.randomUUID();await getDb().insert(schema.fareQuotes).values({...out,id:backId,pickupPlaceId:out.dropoffPlaceId,dropoffPlaceId:out.pickupPlaceId,pickupText:out.dropoffText,dropoffText:out.pickupText,departureTime:'18:00',pickupLatitude:out.dropoffLatitude,pickupLongitude:out.dropoffLongitude,dropoffLatitude:out.pickupLatitude,dropoffLongitude:out.pickupLongitude});
 const preview=await summary.POST(request('/api/booking/quote-summary',{outboundQuoteId:quoteId,returnQuoteId:backId,routeStopIds:['paid-stop'],cancellationOption:'flexible'}));const detail=await preview.json();assert.equal(preview.status,200,JSON.stringify(detail));assert.equal(detail.prices.economy_sedan.total,3343.45);assert.equal(detail.outbound.durationSeconds,8700);assert.equal(detail.return.durationSeconds,6000);
 const r=await checkout.POST(request('/api/checkout',input({returnFareQuoteId:backId,returnDate:date,returnTime:'18:00',childSeats:0})));const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));
 const b=await d1.prepare('SELECT total,route_duration_seconds,return_duration_seconds FROM bookings WHERE reference=?').bind(body.reference).first();assert.deepEqual(b,{total:3343.45,route_duration_seconds:8700,return_duration_seconds:6000});
});
test('snapshot failure rolls back the booking insert in the same D1 transaction',async()=>{
 await store.ensureBookingRouteStops();
 await d1.prepare("CREATE TRIGGER reject_stop_snapshot BEFORE INSERT ON booking_route_stops WHEN NEW.booking_reference='ATOMICSTOP' BEGIN SELECT RAISE(ABORT,'snapshot failed'); END").run();
 const reference='ATOMICSTOP';const query=getDb().insert(schema.bookings).values({reference,customerName:'Test',customerEmail:'test@example.invalid',pickup:'BKK',dropoff:'Pattaya',pickupDate:date,pickupTime:'10:00',passengers:1,luggage:0,vehicle:'economy_sedan',paymentMethod:'cash',total:1400,accessTokenHash:'test',createdAt:now,updatedAt:now}).toSQL();
 try {await assert.rejects(store.insertBookingWithRouteStops(query,reference,[{offerId:'paid-stop',attractionId:'stop-place',name:'Place',priceMinor:12345,durationMinutes:45}]));assert.equal(await d1.prepare('SELECT reference FROM bookings WHERE reference=?').bind(reference).first(),null);}finally{await d1.prepare('DROP TRIGGER reject_stop_snapshot').run();}
});
