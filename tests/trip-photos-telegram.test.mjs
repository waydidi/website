import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// A driver's step photo is posted to the Telegram group as a reply under the booking card.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__tripPhotos={env:{DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__tripPhotos.env';}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[];
let places=null;const placeCalls=[];
globalThis.fetch=async(url,init)=>{
 if(String(url).startsWith('https://places.googleapis.com/')){placeCalls.push({url:String(url),body:JSON.parse(init.body),key:init.headers['X-Goog-Api-Key']});return places?places():new Response('no',{status:403});}
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 sent.push({method:String(url).split('/').pop(),form:init.body});
 return Response.json({ok:true,result:{message_id:77,chat:{id:-100}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__tripPhotos;});

test('the step photo goes to the group under the booking card as "✅Stand by (REF)" with its date and time',async()=>{
 const {putFile}=await vite.ssrLoadModule('/lib/file-store.ts');
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 await putFile('driver-private-evidence/a1/x.jpg',new Uint8Array([0xff,0xd8,0xff,0xd9]),'image/jpeg');
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES('52LLDS',4321,'2026-10-10T00:00:00Z')").run();
 await postTripPhoto({reference:'52LLDS',status:'standby',eventId:'ev-1',driverName:'Thanakorn <B>',evidence:{id:'e1',assignment_id:'a1',booking_reference:'52LLDS',leg:'outbound',driver_id:'d1',event_type:'pickup',status_event_id:null,device_captured_at:'2026-10-10T14:24:53.000Z',received_at:'2026-10-10T14:24:55.000Z',confirmed_at:null,latitude:13.7399,longitude:100.5,accuracy_metres:6.2,original_key:'driver-private-evidence/a1/x.jpg',stamped_key:'x.svg',expires_at:'2099-01-01',deleted_at:null}});
 assert.equal(sent.length,1);
 assert.equal(sent[0].method,'sendPhoto');
 const form=sent[0].form;
 assert.equal(form.get('chat_id'),'-100');
 assert.deepEqual(JSON.parse(form.get('reply_parameters')),{message_id:4321,allow_sending_without_reply:true});
 const caption=form.get('caption');
 // Taken 14:24 UTC = 9:24 PM in Thailand.
 // No Google key in this test: the Admin group still gets where it was taken, as a Google Maps link.
 assert.equal(caption,'✅<b>Stand by</b> (52LLDS)\n10/10/2026 — 9:24 PM\n📍 Location\nhttps://www.google.com/maps?q=13.739900,100.500000');
 const photo=form.get('photo');
 assert.equal(photo.type,'image/jpeg');
 assert.deepEqual([...new Uint8Array(await photo.arrayBuffer())],[0xff,0xd8,0xff,0xd9]);
 assert.equal(form.get('reply_markup'),null); // only the Drop has a button
});

test('the Drop photo carries a Completed job button for that status event',async()=>{
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 sent.length=0;
 await postTripPhoto({reference:'52LLDS',status:'completed',eventId:'0f1e2d3c-0000-4000-8000-000000000001',driverName:'Thanakorn',evidence:{id:'e2',assignment_id:'a1',booking_reference:'52LLDS',leg:'outbound',driver_id:'d1',event_type:'dropoff',status_event_id:null,device_captured_at:'2026-10-10T15:00:00.000Z',received_at:'2026-10-10T15:00:02.000Z',confirmed_at:null,latitude:null,longitude:null,accuracy_metres:null,original_key:'driver-private-evidence/a1/x.jpg',stamped_key:'x.svg',expires_at:'2099-01-01',deleted_at:null}});
 const form=sent[0].form;
 assert.equal(form.get('caption'),'✅<b>Drop</b> (52LLDS)\n10/10/2026 — 10:00 PM\n\nCheck the photo, then tap Completed job.');
 assert.deepEqual(JSON.parse(form.get('reply_markup')),{inline_keyboard:[[{text:'✅ Completed job',callback_data:'trip_done:0f1e2d3c-0000-4000-8000-000000000001'}]]});
});

test('a Drop that completed the job (all three photos in) is posted without the button',async()=>{
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 sent.length=0;
 await postTripPhoto({reference:'52LLDS',status:'completed',eventId:'ev-3',driverName:'Thanakorn',done:true,evidence:{id:'e3',assignment_id:'a1',booking_reference:'52LLDS',leg:'outbound',driver_id:'d1',event_type:'dropoff',status_event_id:null,device_captured_at:'2026-10-10T15:00:00.000Z',received_at:'2026-10-10T15:00:02.000Z',confirmed_at:null,latitude:null,longitude:null,accuracy_metres:null,original_key:'driver-private-evidence/a1/x.jpg',stamped_key:'x.svg',expires_at:'2099-01-01',deleted_at:null}});
 assert.equal(sent[0].form.get('caption'),'✅<b>Drop</b> (52LLDS)\n10/10/2026 — 10:00 PM');
 assert.equal(sent[0].form.get('reply_markup'),null);
});

test('Completed job: route, date and time only (no driver details), under the booking card quoting its reference',async()=>{
 const {postJobCompleted}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 const now='2026-10-11T00:00:00Z';
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,return_date,return_time,passengers,luggage,vehicle,payment_method,total,amount_paid,flight_number,status,created_at,access_token_hash,updated_at) VALUES('FMB123','Jess','M','j@x.co','','Bkk train station','Koh Chang','2026-10-11','06:00','2026-10-18','13:30',2,2,'premium_minivan','cash',5000,0,'','confirmed',?,'tok',?)").bind(now,now).run();
 await d1.prepare("INSERT INTO drivers(id,full_name,phone,vehicle,car_plate,driver_type,status,created_at,updated_at) VALUES('d-aey','Aey','0639299689','Toyota Commuter','1นฌ 1183','staff','active',?,?)").bind(now,now).run();
 await d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES('as-1','FMB123','outbound','d-aey','h1','completed','admin',?,?,?),('as-2','FMB123','return','d-aey','h2','assigned','admin',?,?,?)").bind(now,now,now,now,now,now).run();
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES('FMB123',149,?)").bind(now).run();
 sent.length=0;
 await postJobCompleted('FMB123','outbound');
 const body=JSON.parse(sent[0].form);
 assert.equal(sent[0].method,'sendMessage'); // no photos stored for this one
 assert.equal(body.text,'✅ <b>Completed job</b>\nReference ID: FMB123\nRoute: Bkk train station – Koh Chang\nDate: 11/10/2026\nTime: 6:00 AM\n\nNext: the second trip.');
 assert.doesNotMatch(body.text,/Driver|Tel:|Car plate|Vehicle|Aey|0639299689|1นฌ/);
 assert.deepEqual(body.reply_parameters,{message_id:149,allow_sending_without_reply:true,quote:'Reference: FMB123'});
 sent.length=0;
 await postJobCompleted('FMB123','return');
 const back=JSON.parse(sent[0].form);
 assert.match(back.text,/Route: Koh Chang – Bkk train station\nDate: 18\/10\/2026\nTime: 1:30 PM/);
 assert.doesNotMatch(back.text,/Next: the second trip|Driver|Tel:|Car plate|Vehicle/);
});

const evidence=(over={})=>({id:'ep',assignment_id:'a1',booking_reference:'52LLDS',leg:'outbound',driver_id:'d1',event_type:'pickup',status_event_id:null,device_captured_at:'2026-10-14T06:17:41.000Z',received_at:'2026-10-14T06:17:50.000Z',confirmed_at:null,latitude:12.932185,longitude:100.890614,accuracy_metres:9,original_key:'driver-private-evidence/a1/x.jpg',stamped_key:'',expires_at:'2099-01-01T00:00:00Z',deleted_at:null,...over});

test('with a Google key the Admin group gets the nearest place name and a Maps link; the driver group gets neither',async()=>{
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 globalThis.__tripPhotos.env.GOOGLE_MAPS_SERVER_KEY='server-key';
 places=()=>Response.json({places:[{displayName:{text:'ร้านอาหารตามสั่ง Pattaya <Corner>'},formattedAddress:'Pattaya City, Chon Buri 20150, Thailand'}]});
 sent.length=0;placeCalls.length=0;
 try{
  await d1.prepare("INSERT OR REPLACE INTO telegram_driver_jobs(booking_reference,telegram_message_id,status,created_at,updated_at) VALUES('52LLDS',8000,'taken','2026-10-10T00:00:00Z','2026-10-10T00:00:00Z')").run();
  await d1.prepare("INSERT OR REPLACE INTO telegram_driver_job_chats(booking_reference,chat_id) VALUES('52LLDS','-200200')").run();
  globalThis.__tripPhotos.env.TELEGRAM_DRIVER_CHAT_ID='-200200';globalThis.__tripPhotos.env.TELEGRAM_DRIVER_JOBS='1';
  await postTripPhoto({reference:'52LLDS',status:'standby',eventId:'ev-place',driverName:'T',evidence:evidence()});
 }finally{globalThis.__tripPhotos.env.GOOGLE_MAPS_SERVER_KEY=undefined;delete globalThis.__tripPhotos.env.TELEGRAM_DRIVER_CHAT_ID;delete globalThis.__tripPhotos.env.TELEGRAM_DRIVER_JOBS;}
 assert.equal(placeCalls.length,1);
 assert.equal(placeCalls[0].url,'https://places.googleapis.com/v1/places:searchNearby');
 assert.equal(placeCalls[0].key,'server-key');
 assert.deepEqual(placeCalls[0].body.locationRestriction.circle,{center:{latitude:12.932185,longitude:100.890614},radius:150});
 const team=sent.find(s=>s.form.get('chat_id')==='-100').form.get('caption');
 assert.equal(team,'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM\n📍 <b>ร้านอาหารตามสั่ง Pattaya &lt;Corner&gt;</b> — Pattaya City, Chon Buri 20150, Thailand\nhttps://www.google.com/maps?q=12.932185,100.890614');
 const driverGroup=sent.find(s=>s.form.get('chat_id')==='-200200');
 assert.equal(driverGroup.form.get('caption'),'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM');
});

test('Google refusing, finding nothing, or switched off with TELEGRAM_PHOTO_PLACE_NAME=0 still posts the Maps link; no GPS adds no location',async()=>{
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 const env=globalThis.__tripPhotos.env,link='https://www.google.com/maps?q=12.932185,100.890614';
 const run=async(id,ev)=>{sent.length=0;await postTripPhoto({reference:'52LLDS',status:'standby',eventId:id,driverName:'T',evidence:ev});return sent[0].form.get('caption');};
 env.GOOGLE_MAPS_SERVER_KEY='server-key';
 try{
  places=null; // 403: API not enabled for the key
  assert.equal(await run('ev-403',evidence()),'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM\n📍 Location\n'+link);
  places=()=>Response.json({}); // nothing named within 150 m
  assert.equal(await run('ev-none',evidence()),'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM\n📍 Location\n'+link);
  places=()=>{throw new Error('timeout');};
  assert.equal(await run('ev-err',evidence()),'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM\n📍 Location\n'+link);
  places=()=>Response.json({places:[{displayName:{text:'Somewhere'}}]});
  env.TELEGRAM_PHOTO_PLACE_NAME='0';placeCalls.length=0;
  assert.equal(await run('ev-off',evidence()),'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM\n📍 Location\n'+link);
  assert.equal(placeCalls.length,0); // off: Google is not called at all
  delete env.TELEGRAM_PHOTO_PLACE_NAME;
  assert.equal(await run('ev-nogps',evidence({latitude:null,longitude:null})),'✅<b>Stand by</b> (52LLDS)\n14/10/2026 — 1:17 PM');
 }finally{env.GOOGLE_MAPS_SERVER_KEY=undefined;places=null;}
});
