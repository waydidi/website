import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const statements=(await readFile(root+'/drizzle/'+name,'utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__auditEnv={DB:d1,RATE_LIMIT_SALT:'test-only-secret',STRIPE_SECRET_KEY:'sk_test_audit',STRIPE_PUBLISHABLE_KEY:'pk_test_audit',LINE_CHANNEL_SECRET:'test-only-line-secret',LINE_ADMIN_TARGET_ID:'approved-admin-chat'};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'audit-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0audit-env';if(id.endsWith('/lib/booking-fulfillment'))return '\0audit-delivery';},load(id){if(id==='\0audit-env')return 'export const env=globalThis.__auditEnv';if(id==='\0audit-delivery')return 'export async function fulfillBooking(){return {emailStatus:"pending"}}';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__auditEnv;});
const {getDb}=await vite.ssrLoadModule('/db/index.ts'),schema=await vite.ssrLoadModule('/db/schema.ts'),db=getDb();
const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
const pay=await vite.ssrLoadModule('/app/api/pay/[reference]/route.ts');
const checkout=await vite.ssrLoadModule('/app/api/checkout/route.ts');
const {bookingExtras}=await vite.ssrLoadModule('/lib/booking-extras.ts');
const webhook=await vite.ssrLoadModule('/app/api/webhooks/line/route.ts');
const {bookingAddonRequests}=await vite.ssrLoadModule('/lib/booking-addon-requests.ts');
const now=new Date().toISOString(),date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
async function seed(reference,overrides={}){
 await db.insert(schema.bookings).values({reference,customerName:'Test Traveller',customerEmail:'test@example.invalid',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:date,pickupTime:'09:00',passengers:2,luggage:1,vehicle:'economy_sedan',paymentMethod:'stripe',total:2000,status:'pending_payment',paymentStatus:'pending',accessTokenHash:await sha256('test-owner-token'),createdAt:now,updatedAt:now,...overrides});
}
async function line(reference,leg,source,invalidSignature=false){
 const assignment=`assignment-${reference}-${leg}`,event=`event-${reference}-${leg}`;
 await db.insert(schema.bookingAssignments).values({id:assignment,bookingReference:reference,leg,driverId:'test-driver',tokenHash:`hash-${reference}-${leg}`,currentStatus:'completed',assignedBy:'test',assignedAt:now,tokenExpiresAt:new Date(Date.now()+86400000).toISOString(),updatedAt:now});
 await db.insert(schema.driverStatusEvents).values({id:event,assignmentId:assignment,bookingReference:reference,status:'completed',previousStatus:'trip_started',verificationStatus:'pending_review',createdAt:now});
 const raw=JSON.stringify({events:[{type:'postback',source,postback:{data:`action=complete_trip&event=${event}`}}]});
 const request=()=>new Request('https://example.invalid/api/webhooks/line',{method:'POST',headers:{'x-line-signature':invalidSignature?'invalid':createHmac('sha256',globalThis.__auditEnv.LINE_CHANNEL_SECRET).update(raw).digest('base64')},body:raw});
 return {response:await webhook.POST(request()),replay:()=>webhook.POST(request()),event};
}
test('tour payment accepts its frozen itinerary and rejects changed prices or cancelled plans',async()=>{
 await seed('ABCD23',{serviceType:'tour',checkoutSessionId:'cs_test_audit'});
 await db.insert(schema.smartTrips).values({id:'tour',ref:'TP-AUDIT',title:'Test itinerary',token:'test-tour-token',status:'sent',bookingReference:'ABCD23',snapshotJson:JSON.stringify({total:2000,tripDate:date,startTime:'09:00'}),createdAt:now,updatedAt:now});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{assert.match(String(url),/^https:\/\/api.stripe.com\/v1\/checkout\/sessions\//);return Response.json({id:'cs_test_audit',status:'open',client_secret:'cs_test_secret',amount_total:200000,currency:'thb',metadata:{booking_reference:'ABCD23'}});};
 const load=()=>pay.GET(new Request('https://example.invalid/api/pay/ABCD23?token=test-owner-token&session_id=cs_test_audit'),{params:Promise.resolve({reference:'ABCD23'})});
 try{
  const response=await load();assert.equal(response.status,200);assert.equal((await response.json()).clientSecret,'cs_test_secret');
  await d1.prepare('UPDATE smart_trips SET snapshot_json=? WHERE id=?').bind(JSON.stringify({total:2500,tripDate:date,startTime:'09:00'}),'tour').run();assert.equal((await load()).status,409);
  await d1.prepare("UPDATE smart_trips SET status='cancelled' WHERE id='tour'").run();assert.equal((await load()).status,409);
 }finally{globalThis.fetch=originalFetch;}
});
test('checkout saves the exchange stop it charges even when the storefront sends no notes',async()=>{
 await d1.prepare('UPDATE price_seasons SET active=0').run();
 const id=crypto.randomUUID();
 await db.insert(schema.fareQuotes).values({id,pickupPlaceId:'test-pickup',dropoffPlaceId:'test-dropoff',pickupText:'Suvarnabhumi Airport',dropoffText:'Pattaya',areaId:'sample-pattaya',areaName:'Pattaya',distanceMeters:125000,durationSeconds:6000,vehiclePricesJson:JSON.stringify({economy_sedan:{total:1400,basePrice:1400,distanceSurcharge:0}}),pricingVersion:1,departureDate:date,departureTime:'09:00',timezone:'Asia/Bangkok',expiresAt:new Date(Date.now()+1800000).toISOString(),createdAt:now});
 const payload={checkoutAttemptId:crypto.randomUUID(),customerName:'Test',customerSurname:'Traveller',customerEmail:'test@example.invalid',customerPhone:'+66812345678',pickup:'Suvarnabhumi Airport',dropoff:'Pattaya',pickupDate:date,pickupTime:'09:00',timezone:'Asia/Bangkok',passengers:2,luggage:1,vehicle:'economy_sedan',childSeats:0,exchangeStop:true,oversizedLuggage:false,termsAccepted:true,paymentMethod:'cash',fareQuoteId:id};
 const response=await checkout.POST(new Request('https://example.invalid/api/checkout',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(payload)}));
 assert.equal(response.status,200);const reference=new URL((await response.json()).checkoutUrl).pathname.split('/').at(-1);
 const row=await d1.prepare('SELECT * FROM bookings WHERE reference=?').bind(reference).first();
 assert.equal(row.total,1600);assert.equal(row.special_requests,'Currency exchange stop requested.');
 assert.deepEqual((await bookingExtras({reference,childSeats:0,specialRequests:row.special_requests,createdAt:now})).addons,[{label:'Currency exchange stop',amount:200}]);
});
test('canonical add-on notes preserve requests without duplicates or unpurchased extras',()=>{
 assert.equal(bookingAddonRequests(true,2,'Currency exchange stop requested. Ferry & hotel transfer requested for 2. Meet at lobby.'),'Currency exchange stop requested. Ferry & hotel transfer requested for 2. Meet at lobby.');
 assert.equal(bookingAddonRequests(false,0,'Currency exchange stop requested. Ferry & hotel transfer requested for 9.'),null);
 assert.ok(bookingAddonRequests(true,2,'x'.repeat(500)).startsWith('Currency exchange stop requested. Ferry & hotel transfer requested for 2.'));
});
test('LINE completion keeps the return active and closes the booking after both legs',async()=>{
 await seed('EFGH23',{status:'confirmed',returnDate:date,returnTime:'18:00'});
 const outbound=await line('EFGH23','outbound',{groupId:'approved-admin-chat',userId:'staff'});assert.equal(outbound.response.status,200);
 assert.equal((await d1.prepare("SELECT status FROM bookings WHERE reference='EFGH23'").first()).status,'confirmed');
 assert.equal((await d1.prepare("SELECT status FROM journey_legs WHERE id='EFGH23:return'").first()).status,'confirmed');
 await outbound.replay();
 const returning=await line('EFGH23','return',{groupId:'approved-admin-chat',userId:'staff'});assert.equal(returning.response.status,200);
 assert.equal((await d1.prepare("SELECT status FROM bookings WHERE reference='EFGH23'").first()).status,'completed');
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM booking_events WHERE booking_reference='EFGH23' AND event_type='trip_completed_verified'").first()).n,2);
});
test('LINE rejects approvals from other chats and invalid webhook signatures',async()=>{
 for(const [reference,source,bad] of [['JKLM23',{userId:'unapproved-user'},false],['NPQR23',{groupId:'wrong-group',userId:'approved-admin-chat'},false],['STUV23',{groupId:'approved-admin-chat'},true]]){
  await seed(reference,{status:'confirmed'});const result=await line(reference,'outbound',source,bad);
  assert.equal(result.response.status,bad?401:200);
  assert.equal((await d1.prepare('SELECT status FROM bookings WHERE reference=?').bind(reference).first()).status,'confirmed');
  assert.equal((await d1.prepare('SELECT verification_status FROM driver_status_events WHERE id=?').bind(result.event).first()).verification_status,'pending_review');
 }
});
