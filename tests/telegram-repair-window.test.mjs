import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// The repair routines only repair recent events: old history is never posted again (no flood of old photos).
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__repairWindow={env:{DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__repairWindow.env';}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[];
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 sent.push({method:String(url).split('/').pop(),form:init.body});
 return Response.json({ok:true,result:{message_id:77,chat:{id:-100}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__repairWindow;});

const NOW=Date.parse('2026-10-14T12:00:00Z');
const ago=(ms)=>new Date(NOW-ms).toISOString();
const DAY=24*3600_000;
async function journey(ref,{statusAt,legAt,legStatus='completed'}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,access_token_hash,created_at,updated_at) VALUES(?,'Jess','j@x.co','A','B','2026-10-10','09:00',2,1,'economy_sedan','cash',900,'confirmed','h',?,?)").bind(ref,ago(9*DAY),ago(9*DAY)).run();
 await d1.prepare("INSERT OR IGNORE INTO drivers(id,full_name,phone,vehicle,car_plate,driver_type,status,created_at,updated_at) VALUES('d1','Somchai','0812345678','Van','กข 1','outsource','active',?,?)").bind(ago(9*DAY),ago(9*DAY)).run();
 await d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES(?,?,'outbound','d1',?,'completed','t',?,'2099-01-01T00:00:00Z',?)").bind('as-'+ref,ref,'h-'+ref,ago(9*DAY),ago(9*DAY)).run();
 await d1.prepare("INSERT INTO driver_status_events(id,assignment_id,booking_reference,status,previous_status,verification_status,created_at,confirmed_at) VALUES(?,?,?,'completed','trip_started','verified',?,?)").bind('ev-'+ref,'as-'+ref,ref,statusAt,statusAt).run();
 await d1.prepare("INSERT OR IGNORE INTO journey_legs(id,booking_reference,leg,status,created_at,updated_at) VALUES(?,?,'outbound',?,?,?)").bind(ref+':outbound',ref,legStatus,legAt,legAt).run();
 await d1.prepare("UPDATE journey_legs SET status=?,updated_at=? WHERE booking_reference=? AND leg='outbound'").bind(legStatus,legAt,ref).run();
}
const jobs=async()=>(await d1.prepare("SELECT id FROM telegram_delivery_jobs ORDER BY id").all()).results.map(r=>r.id);

test('a driver step with no delivery record is repaired only when it is recent, never when it is old history',async()=>{
 const {recoverTripNotifications}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 await journey('OLD001',{statusAt:ago(3*DAY),legAt:ago(3*DAY),legStatus:'confirmed'}); // an old Drop with no record
 await journey('NEW001',{statusAt:ago(10*60_000),legAt:ago(10*60_000),legStatus:'confirmed'}); // a recent one
 await journey('OLD002',{statusAt:ago(3*DAY),legAt:ago(3*DAY)}); // completed long ago
 await journey('NEW002',{statusAt:ago(10*60_000),legAt:ago(5*60_000)}); // completed a few minutes ago
 sent.length=0;
 await recoverTripNotifications(20,NOW);
 const ids=await jobs();
 assert.ok(ids.some(id=>id==='step:ev-NEW001:team'),'the recent step is repaired');
 assert.ok(!ids.some(id=>id.includes('OLD001')),'the old step is not posted');
 assert.equal(sent.length,1);
 // Running it again changes nothing.
 sent.length=0;
 await recoverTripNotifications(20,NOW);
 assert.equal(sent.length,0);
});

test('"Completed job" is re-posted only for recently completed journeys, never for old ones',async()=>{
 const {completeFilledJourneys}=await vite.ssrLoadModule('/lib/evidence-auto-complete.ts');
 sent.length=0;
 await completeFilledJourneys(NOW);
 const ids=await jobs();
 assert.ok(ids.includes('completed:NEW002:outbound:team'),'the recent journey is covered');
 assert.ok(!ids.some(id=>id.startsWith('completed:OLD002')),'the old journey is not posted again');
});

test('the repair window is one day',async()=>{
 const {REPAIR_WINDOW_MS}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 assert.equal(REPAIR_WINDOW_MS,24*3600_000);
});
