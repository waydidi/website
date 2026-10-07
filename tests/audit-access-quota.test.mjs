import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test, {after} from 'node:test';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){
const statements=migrationStatements((await readFile(root+'/drizzle/'+name,'utf8'))).map(s=>s.trim()).filter(Boolean);
if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}

globalThis.__auditEnv={DB:d1,RATE_LIMIT_SALT:'test-only',WAYDIDI_ADMIN_SESSION_SECRET:'0123456789abcdef0123456789abcdef'};
const realFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Unexpected external call');};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'audit-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0audit-env';},load(id){if(id==='\0audit-env')return 'export const env=globalThis.__auditEnv';}}],server:{middlewareMode:true,hmr:false}});
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__auditEnv;});
const {getDb}=await vite.ssrLoadModule('/db/index.ts'),schema=await vite.ssrLoadModule('/db/schema.ts'),db=getDb();
const now=new Date().toISOString(),date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
await db.insert(schema.customers).values([{id:'alice',email:'alice@example.invalid',createdAt:now,updatedAt:now,lastSeenAt:now},{id:'bob',email:'bob@example.invalid',createdAt:now,updatedAt:now,lastSeenAt:now}]);
await db.insert(schema.bookings).values({reference:'ABCD23',customerName:'Alice',customerSurname:'Traveller',customerEmail:'alice@example.invalid',pickup:'Private hotel',dropoff:'Private address',pickupDate:date,pickupTime:'09:00',returnDate:date,returnTime:'18:00',passengers:2,luggage:1,vehicle:'economy_sedan',paymentMethod:'cash',total:2000,status:'confirmed',paymentStatus:'cash_due',accessTokenHash:'fake',createdAt:now,updatedAt:now});
await db.insert(schema.customerBookingLinks).values({bookingReference:'ABCD23',customerId:'bob',createdAt:now});
const chat=await vite.ssrLoadModule('/lib/website-chat.ts'),lookup=await vite.ssrLoadModule('/lib/cee/booking-lookup.ts'),auth=await vite.ssrLoadModule('/lib/customer-auth.ts');
for(const [id,customerId,channel] of [['anonymous',null,'web'],['old-owner','alice','web'],['owner','bob','web'],['external','bob','whatsapp']])await chat.createConversation(id,{customerId,channel,email:'bob@example.invalid'}).then(c=>d1.prepare('UPDATE website_conversations SET id=? WHERE id=?').bind(id,c.id).run());

test('chat lookup requires verified ownership and never issues a bearer tracking key',async()=>{
 for(const id of ['anonymous','old-owner','external'])assert.equal((await lookup.checkBooking(id,'ABCD23','Traveller')).ok,false,id);
 const r=await lookup.checkBooking('owner','ABCD23','Traveller');assert.equal(r.ok,true);assert.equal(r.booking.rideUrl,'https://waydidi.com/account/trips/ABCD23');assert.doesNotMatch(r.booking.rideUrl,/ride=|key=|token=/);
 assert.equal(await auth.customerBooking({id:'alice',email:'alice@example.invalid'},'ABCD23'),null);
 assert.ok(await auth.customerBooking({id:'bob',email:'bob@example.invalid'},'ABCD23'));
});

test('booking lookup claims attempts atomically under concurrent requests',async()=>{
 await Promise.all(Array.from({length:20},()=>lookup.checkBooking('concurrent-guess','ABCD23','wrong')));
 const row=await d1.prepare("SELECT attempts FROM security_rate_windows WHERE fingerprint LIKE 'lookup:%' ORDER BY attempts DESC LIMIT 1").first();assert.equal(row.attempts,5);
});

test('website chat refreshes verified identity on sign-in and removes it on sign-out',async()=>{
 const api=await vite.ssrLoadModule('/app/api/chat/route.ts');const accountToken=await auth.createCustomerSession('bob',null);
 const send=(cookie,message)=>api.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie},body:JSON.stringify({message,email:'bob@example.invalid'})}));
 const r=await send('waydidi_account='+accountToken,'Check my booking');assert.equal(r.status,200);
 const cookie=r.headers.get('set-cookie').split(';')[0];let c=await d1.prepare("SELECT customer_id FROM website_conversations WHERE id NOT IN ('anonymous','old-owner','owner','external') ORDER BY created_at DESC LIMIT 1").first();assert.equal(c.customer_id,'bob');
 assert.equal((await send(cookie,'Another message after sign-out')).status,200);
 c=await d1.prepare("SELECT customer_id FROM website_conversations WHERE id NOT IN ('anonymous','old-owner','owner','external') ORDER BY created_at DESC LIMIT 1").first();assert.equal(c.customer_id,null);
});

test('parallel place searches respect site, account and chat limits before provider calls',async()=>{
 const guard=await vite.ssrLoadModule('/lib/cee/guard.ts');await guard.saveLimits({siteDay:1});
 let r=await Promise.all(Array.from({length:20},(_,i)=>guard.claimPlaceSearch('chat'+i,'actor'+i,'query'+i)));assert.equal(r.filter(x=>x.ok).length,1);assert.equal((await guard.placeSearchStats()).paid,1);
 await d1.prepare('DELETE FROM place_searches').run();await guard.saveLimits({siteDay:100,perChat:2,perCustomerDay:3});
 r=await Promise.all(Array.from({length:20},(_,i)=>guard.claimPlaceSearch('same-chat','same-actor','query'+i)));assert.equal(r.filter(x=>x.ok).length,2);
 r=await Promise.all(Array.from({length:20},(_,i)=>guard.claimPlaceSearch('other-chat'+i,'same-actor','query'+i)));assert.equal(r.filter(x=>x.ok).length,1);
 await guard.saveLimits({siteDay:0});assert.equal((await guard.claimPlaceSearch('new','new','new')).ok,false);
});

test('zero flight budget blocks calls and every retry consumes budget',async()=>{
 const flights=await vite.ssrLoadModule('/lib/aerodatabox.ts');globalThis.__auditEnv.AERODATABOX_KEY='mock';let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:429});};
 await d1.prepare('INSERT INTO flight_settings(id,daily_cap) VALUES(1,0)').run();
 await assert.rejects(()=>flights.flightStatus('TG101',date),/FLIGHT_API_LIMIT/);assert.equal(calls,0);
 await d1.prepare('UPDATE flight_settings SET daily_cap=1 WHERE id=1').run();
 await assert.rejects(()=>flights.flightStatus('TG102',date),/FLIGHT_API_LIMIT/);assert.equal(calls,1);assert.equal((await d1.prepare('SELECT calls FROM flight_api_usage').first()).calls,1);
 await d1.prepare('DELETE FROM flight_api_usage').run();await d1.prepare('UPDATE flight_settings SET daily_cap=2 WHERE id=1').run();calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:calls===1?429:204});};
 await assert.rejects(()=>flights.flightStatus('TG103',date),/FLIGHT_NOT_FOUND/);assert.equal(calls,2);assert.equal((await d1.prepare('SELECT calls FROM flight_api_usage').first()).calls,2);
 delete globalThis.__auditEnv.AERODATABOX_KEY;globalThis.fetch=async()=>{throw new Error('Unexpected external call');};
});

test('reschedules clear only the corresponding journey overrides atomically',async()=>{
 const journeys=await vite.ssrLoadModule('/lib/journey-legs.ts');
 for(const leg of ['outbound','return'])await db.insert(schema.journeyLegs).values({id:'ABCD23:'+leg,bookingReference:'ABCD23',leg,status:'confirmed',pickupDate:date,pickupTime:leg==='outbound'?'08:00':'19:00',createdAt:now,updatedAt:now});
 await d1.prepare("UPDATE bookings SET pickup_time='10:00' WHERE reference='ABCD23'").run();
 let b=await auth.customerBooking({id:'bob',email:'bob@example.invalid'},'ABCD23');assert.equal((await journeys.journeyFor(b,'outbound')).pickupTime,'10:00');assert.equal((await journeys.journeyFor(b,'return')).pickupTime,'19:00');
 await d1.prepare("UPDATE bookings SET return_time='20:00' WHERE reference='ABCD23'").run();b=await auth.customerBooking({id:'bob',email:'bob@example.invalid'},'ABCD23');assert.equal((await journeys.journeyFor(b,'return')).pickupTime,'20:00');
 await d1.prepare("CREATE TRIGGER fail_schedule BEFORE UPDATE ON journey_legs BEGIN SELECT RAISE(FAIL,'schedule update failed'); END").run();
 await assert.rejects(()=>d1.prepare("UPDATE bookings SET pickup_time='11:00' WHERE reference='ABCD23'").run());await d1.prepare('DROP TRIGGER fail_schedule').run();assert.equal((await d1.prepare("SELECT pickup_time FROM bookings WHERE reference='ABCD23'").first()).pickup_time,'10:00');
});

test('alert worker permissions match support and operations access without widening other sections',async()=>{
 const security=await vite.ssrLoadModule('/lib/staff-security.ts');
 for(const role of ['owner','support','operations'])for(const method of ['GET','POST'])assert.equal(security.allowedStaffRoute(role,'/api/admin/cee/alerts',method),true);
 for(const role of ['finance','editor'])assert.equal(security.allowedStaffRoute(role,'/api/admin/cee/alerts','GET'),false);
 assert.equal(security.allowedStaffRoute('support','/api/admin/cee/knowledge','POST'),false);
});

test('migration retires previously disclosed owner keys; authenticated pages can issue fresh links',async()=>{
 const trip=await vite.ssrLoadModule('/lib/trip-access.ts');const before=await trip.rideUrl('https://example.invalid',{reference:'ABCD23',createdAt:now});assert.ok(await trip.resolveTripAccess(new Request(before),'ABCD23'));
 await d1.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,is_bot,body,card_json,created_at) VALUES('old-lookup','anonymous','staff',1,?,?,?)").bind('Ride status: '+before,JSON.stringify({type:'booking',reference:'ABCD23',rideUrl:before}),now).run();
 const statements=migrationStatements(await readFile(root+'/drizzle/0094_revoke_chat_lookup_keys.sql','utf8'));await d1.batch(statements.map(s=>d1.prepare(s)));
 assert.equal(await trip.resolveTripAccess(new Request(before),'ABCD23'),null);
 const fresh=await trip.rideUrl('https://example.invalid',{reference:'ABCD23',createdAt:now});assert.notEqual(fresh,before);assert.equal((await trip.resolveTripAccess(new Request(fresh),'ABCD23')).access,'owner');
 const old=await d1.prepare("SELECT body,card_json FROM website_chat_messages WHERE id='old-lookup'").first();assert.equal(old.card_json,null);assert.doesNotMatch(old.body,/ride=/);
 await d1.batch(statements.map(s=>d1.prepare(s)));assert.equal((await d1.prepare("SELECT COUNT(*) n FROM booking_events WHERE provider_event_id='chat-lookup-revoked:ABCD23'").first()).n,1);
});
