import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// The Telegram driver group: Thai job offers with an Assign link, one driver per job, sign-up in private.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
const env={DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100111',TELEGRAM_DRIVER_CHAT_ID:'-100222',TELEGRAM_DRIVER_JOBS:'1'};
globalThis.__driverGroup={env};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__driverGroup.env';}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[], members=new Map();
let nextId=500;
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 if(String(url).includes('/file/bot'))return new Response(new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,0xd9]));
 const method=String(url).split('/').pop();
 const body=typeof init.body==='string'?JSON.parse(init.body):init.body;
 sent.push({method,body});
 if(method==='getMe')return Response.json({ok:true,result:{username:'waydidi_bot'}});
 if(method==='getFile')return Response.json({ok:true,result:{file_path:'photos/p.jpg',file_size:8}});
 if(method==='getChatMember')return Response.json({ok:true,result:{status:members.get(body.user_id)??'left'}});
 return Response.json({ok:true,result:{message_id:nextId++,chat:{id:-1}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__driverGroup;});

const rules=await vite.ssrLoadModule('/lib/telegram/driver-group-rules.ts');
const group=await vite.ssrLoadModule('/lib/telegram/driver-group.ts');
const at='2026-10-13T00:00:00Z';
async function booking(ref,{status='confirmed',method='cash',date='2099-01-15'}={}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,amount_paid,flight_number,status,created_at,access_token_hash,updated_at) VALUES(?,'Jessica','Moore','jess@example.com','+66811112222','Suvarnabhumi Airport','Pattaya Hilton',?,'09:30',4,3,'premium_minivan',?,2500,0,'TG101',?,?,?,?)").bind(ref,date,method,status,at,'tok-'+ref,at).run();
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,9000,?)").bind(ref,at).run();
}
async function driver(id,name){
 await d1.prepare("INSERT INTO drivers(id,full_name,phone,vehicle,car_plate,driver_type,status,created_at,updated_at) VALUES(?,?,'0812345678','Toyota Commuter','กข 1234','outsource','active',?,?)").bind(id,name,at,at).run();
}
const alice={id:1001,first_name:'Somchai'}, bob={id:1002,first_name:'Anan'}, stranger={id:1003,first_name:'X'};
members.set(1001,'member');members.set(1002,'member');

test('off unless the owner turns it on, and never the team group',()=>{
 assert.equal(rules.driverGroupConfig({TELEGRAM_DRIVER_CHAT_ID:'-100222'}),null);
 assert.equal(rules.driverGroupConfig({TELEGRAM_DRIVER_JOBS:'1',TELEGRAM_DRIVER_CHAT_ID:'-100111',TELEGRAM_CHAT_ID:'-100111'}),null);
 assert.equal(rules.driverGroupConfig({TELEGRAM_DRIVER_JOBS:'1',TELEGRAM_DRIVER_CHAT_ID:'not-an-id'}),null);
 assert.deepEqual(rules.driverGroupConfig({TELEGRAM_DRIVER_JOBS:'1',TELEGRAM_DRIVER_CHAT_ID:'-100222',TELEGRAM_CHAT_ID:'-100111'}),{chatId:'-100222'});
});

test('the Assign link payload, "my jobs" and the sign-up answers are checked',()=>{
 assert.equal(rules.parseJobStart('/start job_fmbnuw'),'FMBNUW');
 assert.equal(rules.parseJobStart('/start job_FMB NUW'),null);
 assert.equal(rules.parseJobStart('/start'),null);
 assert.equal(rules.jobStartLink('waydidi_bot','FMBNUW'),'https://t.me/waydidi_bot?start=job_FMBNUW');
 assert.ok(rules.isMyJobsCommand('งานของฉัน'));assert.ok(rules.isMyJobsCommand('/myjobs@waydidi_bot'));assert.ok(!rules.isMyJobsCommand('งาน'));
 assert.deepEqual(rules.checkTextAnswer('phone','081 234 5678'),{value:'081 234 5678'});
 assert.ok('error' in rules.checkTextAnswer('phone','12'));
 assert.ok('error' in rules.checkTextAnswer('name','A'));
 assert.deepEqual(rules.checkTextAnswer('plate','  กข  1234 '),{value:'กข 1234'});
 assert.ok('error' in rules.checkTextAnswer('id_photo','hello'));
 assert.equal(rules.nextStep('model'),'car_type');assert.equal(rules.nextStep('car_photo'),null);
 assert.ok(rules.isGroupMember({status:'member'}));assert.ok(!rules.isGroupMember({status:'left'}));assert.ok(!rules.isGroupMember({status:'kicked'}));
 assert.ok(rules.isGroupMember({status:'restricted',is_member:true}));assert.ok(!rules.isGroupMember(null));
});

test('a new booking is offered to the driver group in Thai, with the Assign link and no customer details',async()=>{
 await booking('DG0001');
 sent.length=0;
 await group.postDriverOffer('DG0001');
 const post=sent.find(s=>s.method==='sendMessage');
 assert.equal(post.body.chat_id,'-100222');
 assert.match(post.body.text,/งานใหม่ · <b>DG0001<\/b>/);
 assert.match(post.body.text,/รถ: ตู้ VIP\nวันที่\/เวลา: 15\/01\/2099 09:30\nรับ: Suvarnabhumi Airport\nส่ง: Pattaya Hilton\nจำนวน: 4 คน, 3 กระเป๋า/);
 assert.match(post.body.text,/ค่างาน: รอแจ้งราคา\nการชำระ: เก็บเงินสด 2,500 บาท/);
 for(const secret of ['Jessica','Moore','+66811112222','jess@example.com','TG101'])assert.ok(!post.body.text.includes(secret),secret);
 assert.deepEqual(post.body.reply_markup.inline_keyboard,[[{text:'✋ รับงาน (Assign)',url:'https://t.me/waydidi_bot?start=job_DG0001'}]]);
 sent.length=0;
 await group.postDriverOffer('DG0001'); // safe to call again
 assert.equal(sent.filter(s=>s.method==='sendMessage').length,0);
});

test('nothing goes to the driver group while the feature is off',async()=>{
 await booking('DG0002');
 delete env.TELEGRAM_DRIVER_JOBS;
 sent.length=0;
 await group.postDriverOffer('DG0002');
 assert.equal(sent.length,0);
 env.TELEGRAM_DRIVER_JOBS='1';
});

test('only members of the driver group can take a job',async()=>{
 const r=await group.holdJob(stranger,'DG0001');
 assert.deepEqual(r,{ok:false,reason:'รับงานได้เฉพาะสมาชิกกลุ่มคนขับ Waydidi'});
});

test('two drivers tapping Assign at once: exactly one holds the job, the other is told to wait',async()=>{
 const [a,b]=await Promise.all([group.holdJob(alice,'DG0001'),group.holdJob(bob,'DG0001')]);
 assert.equal([a,b].filter(r=>r.ok).length,1);
 const winner=a.ok?alice:bob, loser=a.ok?bob:alice;
 assert.ok((await group.holdJob(winner,'DG0001')).ok); // tapping again is fine
 assert.match((await group.holdJob(loser,'DG0001')).reason,/กำลังรับงานนี้อยู่/);
 // The loser can't claim it either, even with a driver record.
 await driver('drv-loser','Loser');
 assert.equal((await group.claimJob(loser,'DG0001','drv-loser')).ok,false);
 await driver('drv-win','Somchai Jaidee');
 sent.length=0;
 assert.deepEqual(await group.claimJob(winner,'DG0001','drv-win'),{ok:true});
 const job=await d1.prepare("SELECT status,driver_id FROM telegram_driver_jobs WHERE booking_reference='DG0001'").first();
 assert.deepEqual(job,{status:'taken',driver_id:'drv-win'});
 const card=await d1.prepare("SELECT driver_done,driver_form_json FROM telegram_booking_cards WHERE booking_reference='DG0001'").first();
 assert.equal(card.driver_done,1);
 assert.equal(JSON.parse(card.driver_form_json).driverId,'drv-win');
 // The team group is told who took it (cost not set yet), and the offer shows it as taken with no button.
 const note=sent.find(s=>s.method==='sendMessage'&&s.body.chat_id==='-100111');
 assert.match(note.body.text,/Somchai Jaidee<\/b> รับงาน <b>DG0001<\/b> จากกลุ่มคนขับ/);
 const edit=sent.find(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222');
 assert.match(edit.body.text,/✅ รับงานแล้ว: Somchai Jaidee · กข 1234/);
 assert.deepEqual(edit.body.reply_markup.inline_keyboard,[]);
 // Taken: nobody else can hold it now.
 assert.match((await group.holdJob(loser,'DG0001')).reason,/มีคนขับรับงานนี้แล้ว/);
});

test('when staff already set a driver in the team group, the driver group claim is refused',async()=>{
 await booking('DG0003');
 await group.postDriverOffer('DG0003');
 assert.ok((await group.holdJob(alice,'DG0003')).ok);
 await d1.prepare("UPDATE telegram_booking_cards SET driver_done=1,driver_form_json='{\"driverId\":\"staff-pick\"}' WHERE booking_reference='DG0003'").run();
 assert.deepEqual(await group.claimJob(alice,'DG0003','drv-win'),{ok:false,reason:'งานนี้มีคนขับแล้ว'});
 const card=await d1.prepare("SELECT driver_form_json FROM telegram_booking_cards WHERE booking_reference='DG0003'").first();
 assert.equal(JSON.parse(card.driver_form_json).driverId,'staff-pick'); // staff's choice is untouched
});

test('a cancelled booking cannot be taken',async()=>{
 await booking('DG0004');
 await group.postDriverOffer('DG0004');
 await d1.prepare("UPDATE bookings SET status='cancelled' WHERE reference='DG0004'").run();
 assert.deepEqual(await group.holdJob(alice,'DG0004'),{ok:false,reason:'งานนี้ถูกยกเลิกแล้ว'});
});

test('a held job that ran out of time cannot be claimed by its old holder',async()=>{
 await booking('DG0005');
 await group.postDriverOffer('DG0005');
 assert.ok((await group.holdJob(bob,'DG0005')).ok);
 await d1.prepare("UPDATE telegram_driver_jobs SET hold_until='2020-01-01T00:00:00Z' WHERE booking_reference='DG0005'").run();
 assert.equal((await group.claimJob(bob,'DG0005','drv-loser')).ok,false);
 assert.ok((await group.holdJob(alice,'DG0005')).ok); // and someone else can now take it
});

test('the full job reaches the driver privately once they are linked',async()=>{
 await d1.prepare("INSERT INTO telegram_driver_links(telegram_user_id,driver_id,linked_at) VALUES('1001','drv-win',?)").bind(at).run();
 sent.length=0;
 await group.sendJobToLinkedDriver('drv-win','job text');
 assert.deepEqual(sent.map(s=>[s.method,s.body.chat_id,s.body.text]),[['sendMessage','1001','job text']]);
});

test('a first-time driver signs up in the private chat and gets the job',async()=>{
 await booking('DG0006');
 await group.postDriverOffer('DG0006');
 const carol={id:1004,first_name:'Carol'};members.set(1004,'member');
 let n=1;const say=(extra)=>group.handleDriverPrivate({message_id:n++,chat:{id:1004,type:'private'},from:carol,...extra});
 sent.length=0;
 assert.equal(await say({text:'/start job_DG0006'}),true);
 assert.match(sent.at(-1).body.text,/\(1\/7\): ชื่อ-นามสกุลคนขับ/);
 await say({text:'A'}); // too short: asked again
 assert.match(sent.at(-1).body.text,/กรุณาพิมพ์ชื่อ-นามสกุล/);
 for(const text of ['Carol Saetang','089 999 8888','นง 8384','Toyota Commuter สีเงิน'])await say({text});
 assert.deepEqual(sent.at(-1).body.reply_markup.inline_keyboard[0].map(b=>b.callback_data),['dj_car:DG0006:sedan','dj_car:DG0006:suv','dj_car:DG0006:minivan']);
 await group.handleDriverCallback({id:'cb1',from:carol,data:'dj_car:DG0006:minivan',message:{message_id:77,chat:{id:1004,type:'private'}}});
 assert.match(sent.filter(s=>s.method==='sendMessage').at(-1).body.text,/ใบขับขี่หรือบัตรประชาชน/);
 await say({text:'no photo'}); // a photo is needed here
 await say({photo:[{file_id:'small',width:90,height:90},{file_id:'big',width:1280,height:960}]});
 await say({photo:[{file_id:'car',width:1280,height:960}]});
 const link=await d1.prepare("SELECT driver_id FROM telegram_driver_links WHERE telegram_user_id='1004'").first();
 const d=await d1.prepare("SELECT full_name,phone,car_plate,vehicle,vehicle_type,driver_type,id_image_key,car_image_key FROM drivers WHERE id=?").bind(link.driver_id).first();
 assert.deepEqual(d,{full_name:'Carol Saetang',phone:'089 999 8888',car_plate:'นง 8384',vehicle:'Toyota Commuter สีเงิน',vehicle_type:'minivan',driver_type:'outsource',id_image_key:`driver-verification/${link.driver_id}/identity.jpg`,car_image_key:`driver-verification/${link.driver_id}/vehicle.jpg`});
 assert.deepEqual(await d1.prepare("SELECT status,driver_id FROM telegram_driver_jobs WHERE booking_reference='DG0006'").first(),{status:'taken',driver_id:link.driver_id});
 assert.match(sent.filter(s=>s.method==='sendMessage'&&s.body.chat_id==='1004').at(-1).body.text,/รับงาน <b>DG0006<\/b> เรียบร้อย/);
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM telegram_driver_forms").first('n'),0);
 // Next time: the saved details are shown with a confirm button, no questions.
 await booking('DG0007');await group.postDriverOffer('DG0007');
 sent.length=0;
 await say({text:'/start job_DG0007'});
 assert.match(sent.at(-1).body.text,/ยืนยันรับงานด้วยข้อมูลนี้\?\nคนขับ: Carol Saetang · 089 999 8888/);
 assert.equal(sent.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data,'dj_ok:DG0007');
 await group.handleDriverCallback({id:'cb2',from:carol,data:'dj_ok:DG0007',message:{message_id:78,chat:{id:1004,type:'private'}}});
 assert.equal(await d1.prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference='DG0007'").first('status'),'taken');
});

test("a driver's trip photo is also posted to the driver group under the job's offer, without the staff button",async()=>{
 const {putFile}=await vite.ssrLoadModule('/lib/file-store.ts');
 const {postTripPhoto}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 await putFile('driver-private-evidence/dg/x.jpg',new Uint8Array([0xff,0xd8,0xff,0xd9]),'image/jpeg');
 const offer=await d1.prepare("SELECT telegram_message_id FROM telegram_driver_jobs WHERE booking_reference='DG0001'").first('telegram_message_id');
 sent.length=0;
 await postTripPhoto({reference:'DG0001',status:'completed',eventId:'ev-dg',driverName:'Somchai',evidence:{id:'e9',assignment_id:'a9',booking_reference:'DG0001',leg:'outbound',driver_id:'drv-win',event_type:'dropoff',status_event_id:null,device_captured_at:'2026-10-10T15:00:00.000Z',received_at:'2026-10-10T15:00:02.000Z',confirmed_at:null,latitude:null,longitude:null,accuracy_metres:null,original_key:'driver-private-evidence/dg/x.jpg',stamped_key:'x.svg',expires_at:'2099-01-01',deleted_at:null}});
 const photos=sent.filter(s=>s.method==='sendPhoto');
 assert.deepEqual(photos.map(p=>p.body.get('chat_id')),['-100222','-100111']);
 assert.equal(photos[0].body.get('caption'),'✅<b>Drop</b> (DG0001)\n10/10/2026 — 10:00 PM');
 assert.equal(JSON.parse(photos[0].body.get('reply_parameters')).message_id,offer);
 assert.equal(photos[0].body.get('reply_markup'),null);
 assert.ok(photos[1].body.get('reply_markup')); // the team group keeps the Completed job button
});
