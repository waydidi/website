import { migrationStatements } from './helpers/migrations.mjs';
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
 const statements=migrationStatements((await readFile(root+'/drizzle/'+name,'utf8'))).map(s=>s.trim()).filter(Boolean);
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
const chat=await vite.ssrLoadModule('/lib/website-chat.ts');
const telegram=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
const quotes=await vite.ssrLoadModule('/lib/cee/quotes.ts');
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

test('multi-day tour payment validates the sum of all frozen days',async()=>{
 await seed('WXYZ23',{serviceType:'tour',total:5000,checkoutSessionId:'cs_test_multi'});
 for(const [id,day,total] of [['day-one',1,2000],['day-two',2,3000]]){
  await db.insert(schema.smartTrips).values({id,ref:'TP-'+day,token:'tour-token-'+day,title:'Multi-day itinerary',status:'sent',groupId:'day-one',dayNumber:day,bookingReference:'WXYZ23',snapshotJson:JSON.stringify({total,tripDate:date,startTime:'09:00'}),createdAt:now,updatedAt:now});
 }
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({id:'cs_test_multi',status:'open',client_secret:'multi-secret',amount_total:500000,currency:'thb',metadata:{booking_reference:'WXYZ23'}});
 const load=()=>pay.GET(new Request('https://example.invalid/api/pay/WXYZ23?token=test-owner-token&session_id=cs_test_multi'),{params:Promise.resolve({reference:'WXYZ23'})});
 try{
  assert.equal((await load()).status,200);
  await d1.prepare("UPDATE smart_trips SET snapshot_json=? WHERE id='day-two'").bind(JSON.stringify({total:3500,tripDate:date,startTime:'09:00'})).run();assert.equal((await load()).status,409);
 }finally{globalThis.fetch=original;}
});
async function supportConversation(id,card){
 await d1.prepare('INSERT INTO website_conversations(id,public_id,token_hash,expires_at,created_at,updated_at,telegram_message_id) VALUES(?,?,?,?,?,?,?)').bind(id,'WD-'+id,id,new Date(Date.now()+86400000).toISOString(),now,now,card).run();
}
async function telegramReply(updateId,card,body){
 return telegram.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify({update_id:updateId,message:{message_id:updateId,chat:{id:-100},from:{id:777},text:body,reply_to_message:{message_id:card,chat:{id:-100}}}})}));
}
test('failed Telegram delivery retries and a partial-write retry never duplicates the reply',async()=>{
 Object.assign(globalThis.__auditEnv,{TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24),TELEGRAM_CHAT_ID:'-100'});
 await supportConversation('retry',901);
 await d1.prepare("INSERT INTO telegram_admins(id,telegram_user_id,display_name,enabled,created_at,updated_at) VALUES('bob','777','Bob',1,?,?)").bind(now,now).run();
 await d1.exec("CREATE TRIGGER fail_message BEFORE INSERT ON website_chat_messages WHEN NEW.body='Retry reply' BEGIN SELECT RAISE(ABORT,'transient error'); END;");
 assert.equal((await telegramReply(1001,901,'Retry reply')).status,503);
 await d1.exec('DROP TRIGGER fail_message;');
 assert.equal((await telegramReply(1001,901,'Retry reply')).status,200);
 assert.equal((await telegramReply(1001,901,'Retry reply')).status,200);
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE body='Retry reply'").first()).n,1);
 await d1.exec("CREATE TRIGGER fail_chat_update BEFORE UPDATE ON website_conversations WHEN NEW.last_message_at IS NOT NULL AND OLD.id='retry' BEGIN SELECT RAISE(ABORT,'update error'); END;");
 assert.equal((await telegramReply(1002,901,'Partially saved reply')).status,503);
 await d1.exec('DROP TRIGGER fail_chat_update;');
 assert.equal((await telegramReply(1002,901,'Partially saved reply')).status,200);
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE body='Partially saved reply'").first()).n,1);
 assert.equal((await d1.prepare('SELECT processing_status FROM telegram_events WHERE update_id=1002').first()).processing_status,'done');
});
test('staff replies enforce ownership for Telegram and concurrent dashboard requests',async()=>{
 await d1.prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,active,created_at) VALUES('alice','alice','alice@example.invalid','Alice','test-only','support',1,?),('bob','bob','bob@example.invalid','Bob','test-only','support',1,?)").bind(now,now).run();
 await supportConversation('owned',902);await chat.assign('owned',{name:'Alice',staffId:'alice'},false);
 const denied=await chat.addStaffMessage('owned','Bob without takeover',{name:'Bob',telegramUserId:'777'},'telegram',2001);assert.ok(denied.error);
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id='owned'").first()).n,0);
 await chat.assign('owned',{name:'Bob',telegramUserId:'777'},true);
 assert.ok((await chat.addStaffMessage('owned','Bob after takeover',{name:'Bob',telegramUserId:'777'},'telegram',2002)).id);
 await supportConversation('race',903);
 const results=await Promise.all([chat.addStaffMessage('race','Alice reply',{name:'Alice',staffId:'alice'},'dashboard'),chat.addStaffMessage('race','Bob reply',{name:'Bob',staffId:'bob'},'dashboard')]);
 assert.equal(results.filter(r=>r.id).length,1);assert.equal(results.filter(r=>r.error).length,1);
});
test('incremental chat polling reads all pages without skipping while initial history remains bounded',async()=>{
 await supportConversation('history',904);
 await d1.batch(Array.from({length:251},(_,i)=>d1.prepare('INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES(?,?,?,?,?)').bind('history-'+i,'history','visitor','Message '+i,now)));
 const first=(await chat.messagesFor('history',0,300))[0];
 const page=await chat.messagesFor('history',first.seq,200);assert.equal(page[0].body,'Message 1');assert.equal(page.at(-1).body,'Message 200');
 const next=await chat.messagesFor('history',page.at(-1).seq,200);assert.equal(next.length,50);assert.equal(next.at(-1).body,'Message 250');
 const initial=await chat.messagesFor('history');assert.equal(initial.length,200);assert.equal(initial[0].body,'Message 51');
});
test('Non rejects past, short-notice and invalid-slot pickups that checkout cannot accept',async()=>{
 for(const minutes of [-60,60,121]){
  const stamp=new Date(Date.now()+minutes*60000+7*3600000).toISOString();
  const result=await quotes.quoteHourly({city:'bangkok',pickup:'Bangkok hotel',hours:3,date:stamp.slice(0,10),time:stamp.slice(11,16),passengers:2,bags:1});assert.equal(result.ok,false);
 }
 const invalidSlot=await quotes.quoteHourly({city:'bangkok',pickup:'Bangkok hotel',hours:3,date,time:'09:07',passengers:2,bags:1});assert.equal(invalidSlot.ok,false);
 const valid=await quotes.quoteHourly({city:'bangkok',pickup:'Bangkok hotel',hours:3,date,time:'09:00',passengers:2,bags:1});assert.equal(valid.ok,true);
});
