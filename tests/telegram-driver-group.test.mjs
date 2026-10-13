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
const bulkRules=await vite.ssrLoadModule('/lib/telegram/bulk-cost-rules.ts');
const at='2026-10-13T00:00:00Z';
async function booking(ref,{status='confirmed',method='cash',date='2099-01-15',cost=1800}={}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,amount_paid,flight_number,status,created_at,access_token_hash,updated_at) VALUES(?,'Jessica','Moore','jess@example.com','+66811112222','Suvarnabhumi Airport','Pattaya Hilton',?,'09:30',4,3,'premium_minivan',?,2500,0,'TG101',?,?,?,?)").bind(ref,date,method,status,at,'tok-'+ref,at).run();
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,9000,?)").bind(ref,at).run();
 if(cost)await d1.prepare("INSERT INTO booking_costs(booking_reference,agreed_driver_cost,additional_costs,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,?,0,?,'unpaid','test',?,?)").bind(ref,cost,cost,at,at).run();
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

test('the sign-up link, "my jobs" and the sign-up answers are checked',()=>{
 assert.equal(rules.parseSignupStart('/start reg_fmbnuw'),'FMBNUW');
 assert.equal(rules.parseSignupStart('/start reg_FMB NUW'),null);
 assert.equal(rules.parseSignupStart('/start'),null);
 assert.equal(rules.signupLink('waydidi_bot','FMBNUW'),'https://t.me/waydidi_bot?start=reg_FMBNUW');
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

test('a booking is offered to the driver group in Thai, with the Assign button and no customer details',async()=>{
 await booking('DG0001');
 sent.length=0;
 await group.postDriverOffer('DG0001');
 const post=sent.find(s=>s.method==='sendMessage');
 assert.equal(post.body.chat_id,'-100222');
 assert.equal(post.body.text,['ตู้สวย งานใหม่🚗','','วันที่: 15/01/2099','เวลา: 09:30','รับ: Suvarnabhumi Airport','ส่ง: Pattaya Hilton','จำนวน: 4 คน, 3 กระเป๋า','ค่างาน: 1,800 บาท','','คนแรกที่กด «รับงาน» ได้งานนี้'].join('\n'));
 for(const secret of ['Jessica','Moore','+66811112222','jess@example.com','TG101'])assert.ok(!post.body.text.includes(secret),secret);
 assert.deepEqual(post.body.reply_markup.inline_keyboard,[[{text:'✋ รับงาน (Assign)',callback_data:'dj_take:DG0001'}]]);
 assert.match(post.body.text,/คนแรกที่กด «รับงาน» ได้งานนี้/);
 sent.length=0;
 await group.postDriverOffer('DG0001'); // safe to call again
 assert.equal(sent.filter(s=>s.method==='sendMessage').length,0);
});

test('a booking without a driver cost is not offered; setting the cost posts it',async()=>{
 await booking('DG0010',{cost:0});
 sent.length=0;
 assert.equal(await group.postDriverOffer('DG0010'),false);
 assert.equal(sent.length,0);
 const {saveDriverCost}=await vite.ssrLoadModule('/lib/telegram/booking-tasks.ts');
 const {refreshBookingCard}=await vite.ssrLoadModule('/lib/telegram/bookings.ts');
 await saveDriverCost('DG0010',2100,'Admin');
 await refreshBookingCard('DG0010');
 const post=sent.find(s=>s.method==='sendMessage'&&s.body.chat_id==='-100222');
 assert.match(post.body.text,/ค่างาน: 2,100 บาท/);
 assert.deepEqual(post.body.reply_markup.inline_keyboard,[[{text:'✋ รับงาน (Assign)',callback_data:'dj_take:DG0010'}]]);
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
 const r=await group.takeJob(stranger,'DG0001');
 assert.deepEqual(r,{ok:false,reason:'รับงานได้เฉพาะสมาชิกกลุ่มคนขับ Waydidi'});
});

test('two linked drivers tapping Assign at once: the first tap gets the job and the post shows it, no button',async()=>{
 await driver('drv-a','Somchai Jaidee');await driver('drv-b','Anan Suksai');
 await d1.prepare("INSERT INTO telegram_driver_links(telegram_user_id,driver_id,linked_at) VALUES('1001','drv-a',?),('1002','drv-b',?)").bind(at,at).run();
 sent.length=0;
 const [a,b]=await Promise.all([group.takeJob(alice,'DG0001'),group.takeJob(bob,'DG0001')]);
 assert.equal([a,b].filter(r=>r.ok).length,1);
 const winner=a.ok?{user:alice,id:'drv-a',name:'Somchai Jaidee'}:{user:bob,id:'drv-b',name:'Anan Suksai'};
 const loser=a.ok?b:a;
 assert.equal(loser.reason,'มีคนรับงานนี้แล้ว');
 assert.deepEqual(await d1.prepare("SELECT status,driver_id FROM telegram_driver_jobs WHERE booking_reference='DG0001'").first(),{status:'taken',driver_id:winner.id});
 const card=await d1.prepare("SELECT driver_done,driver_form_json,assignment_posted FROM telegram_booking_cards WHERE booking_reference='DG0001'").first();
 assert.equal(card.driver_done,1);assert.equal(JSON.parse(card.driver_form_json).driverId,winner.id);
 assert.equal(card.assignment_posted,1); // the cost is set, so the job was assigned and posted
 // The team group gets the Thai job with the customer's details, headed by who took it.
 const job=sent.find(s=>s.method==='sendMessage'&&s.body.chat_id==='-100111');
 assert.match(job.body.text,new RegExp(`^✋ <b>${winner.name}</b> รับงานจากกลุ่มคนขับ`));
 assert.match(job.body.text,/ชื่อลูกค้า: Jessica Moore/);
 assert.match(job.body.text,/ลิงก์งาน/);
 // The winner gets the same job privately.
 const dm=sent.find(s=>s.method==='sendMessage'&&s.body.chat_id===String(winner.user.id));
 assert.equal(dm.body.text,job.body.text);
 // The driver group post now says who took it, with no button.
 const edit=sent.filter(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222').at(-1);
 assert.match(edit.body.text,new RegExp(`✅ รับงานแล้ว: ${winner.name} · กข 1234`));
 assert.deepEqual(edit.body.reply_markup.inline_keyboard,[]);
 assert.doesNotMatch(edit.body.text,/Jessica|\+66811112222/);
 assert.equal((await group.takeJob(winner.user,'DG0001')).ok,false); // tapping again changes nothing
});

test('when staff already set a driver in the team group, the driver group tap is refused',async()=>{
 await booking('DG0003');
 await group.postDriverOffer('DG0003');
 await d1.prepare("UPDATE telegram_booking_cards SET driver_done=1,driver_form_json='{\"driverId\":\"staff-pick\"}' WHERE booking_reference='DG0003'").run();
 assert.deepEqual(await group.takeJob(alice,'DG0003'),{ok:false,reason:'มีคนรับงานนี้แล้ว'});
 const card=await d1.prepare("SELECT driver_form_json FROM telegram_booking_cards WHERE booking_reference='DG0003'").first();
 assert.equal(JSON.parse(card.driver_form_json).driverId,'staff-pick'); // staff's choice is untouched
});

test('a cancelled booking cannot be taken',async()=>{
 await booking('DG0004');
 await group.postDriverOffer('DG0004');
 await d1.prepare("UPDATE bookings SET status='cancelled' WHERE reference='DG0004'").run();
 assert.deepEqual(await group.takeJob(alice,'DG0004'),{ok:false,reason:'งานนี้ถูกยกเลิกแล้ว'});
});

test('the full job reaches the driver privately once they are linked',async()=>{
 sent.length=0;
 await group.sendJobToLinkedDriver('drv-a','job text');
 assert.deepEqual(sent.map(s=>[s.method,s.body.chat_id,s.body.text]),[['sendMessage','1001','job text']]);
});

test('a first-time driver gets the job on the first tap, then signs up in the private chat',async()=>{
 await booking('DG0006');
 await group.postDriverOffer('DG0006');
 const carol={id:1004,first_name:'Carol'};members.set(1004,'member');
 sent.length=0;
 await group.handleDriverTake({id:'tap1',from:carol,data:'dj_take:DG0006',message:{message_id:1,chat:{id:-100222,type:'supergroup'}}});
 assert.deepEqual(await d1.prepare("SELECT status,holder_telegram_id,holder_name,driver_id FROM telegram_driver_jobs WHERE booking_reference='DG0006'").first(),{status:'signing_up',holder_telegram_id:'1004',holder_name:'Carol',driver_id:null});
 const edit=sent.find(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222');
 assert.match(edit.body.text,/✅ รับงานแล้ว: Carol \(กำลังกรอกข้อมูลคนขับ\)/);
 assert.deepEqual(edit.body.reply_markup.inline_keyboard,[]);
 assert.match(sent.find(s=>s.method==='answerCallbackQuery').body.text,/ได้งาน DG0006 แล้ว กรอกข้อมูลคนขับ/);
 assert.match(sent.filter(s=>s.body.chat_id==='1004').at(-1).body.text,/\(1\/7\): ชื่อ-นามสกุลคนขับ/);
 // Someone else tapping now is told it's taken.
 assert.deepEqual(await group.takeJob(alice,'DG0006'),{ok:false,reason:'มีคนรับงานนี้แล้ว'});
 let n=1;const say=(extra)=>group.handleDriverPrivate({message_id:n++,chat:{id:1004,type:'private'},from:carol,...extra});
 await say({text:'A'}); // too short: asked again
 assert.match(sent.at(-1).body.text,/กรุณาพิมพ์ชื่อ-นามสกุล/);
 for(const text of ['Carol Saetang','089 999 8888','นง 8384','Toyota Commuter สีเงิน'])await say({text});
 assert.deepEqual(sent.at(-1).body.reply_markup.inline_keyboard[0].map(b=>b.callback_data),['dj_car:DG0006:sedan','dj_car:DG0006:suv','dj_car:DG0006:minivan']);
 await group.handleDriverCallback({id:'cb1',from:carol,data:'dj_car:DG0006:minivan',message:{message_id:77,chat:{id:1004,type:'private'}}});
 assert.match(sent.filter(s=>s.method==='sendMessage').at(-1).body.text,/ใบขับขี่หรือบัตรประชาชน/);
 await say({text:'no photo'}); // a photo is needed here
 await say({photo:[{file_id:'small',width:90,height:90},{file_id:'big',width:1280,height:960}]});
 sent.length=0;
 await say({photo:[{file_id:'car',width:1280,height:960}]});
 const link=await d1.prepare("SELECT driver_id FROM telegram_driver_links WHERE telegram_user_id='1004'").first();
 const d=await d1.prepare("SELECT full_name,phone,car_plate,vehicle,vehicle_type,driver_type,id_image_key,car_image_key FROM drivers WHERE id=?").bind(link.driver_id).first();
 assert.deepEqual(d,{full_name:'Carol Saetang',phone:'089 999 8888',car_plate:'นง 8384',vehicle:'Toyota Commuter สีเงิน',vehicle_type:'minivan',driver_type:'outsource',id_image_key:`driver-verification/${link.driver_id}/identity.jpg`,car_image_key:`driver-verification/${link.driver_id}/vehicle.jpg`});
 assert.deepEqual(await d1.prepare("SELECT status,driver_id FROM telegram_driver_jobs WHERE booking_reference='DG0006'").first(),{status:'taken',driver_id:link.driver_id});
 assert.match(sent.find(s=>s.method==='sendMessage'&&s.body.chat_id==='-100111').body.text,/Carol Saetang<\/b> รับงานจากกลุ่มคนขับ[\s\S]*ชื่อลูกค้า: Jessica Moore/);
 assert.match(sent.filter(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222').at(-1).body.text,/✅ รับงานแล้ว: Carol Saetang · นง 8384/);
 assert.match(sent.filter(s=>s.method==='sendMessage'&&s.body.chat_id==='1004').at(-1).body.text,/งาน <b>DG0006<\/b> เป็นของคุณ/);
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM telegram_driver_forms").first('n'),0);
 // Next time: one tap and the job is hers, no questions.
 await booking('DG0007');await group.postDriverOffer('DG0007');
 sent.length=0;
 await group.handleDriverTake({id:'tap2',from:carol,data:'dj_take:DG0007',message:{message_id:2,chat:{id:-100222,type:'supergroup'}}});
 assert.equal(await d1.prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference='DG0007'").first('status'),'taken');
 assert.match(sent.find(s=>s.method==='answerCallbackQuery').body.text,/ได้งาน DG0007 แล้ว ใบงานส่งไปที่แชทส่วนตัว/);
});

test('a first-time driver who never opened the bot is sent to it with the sign-up link',async()=>{
 await booking('DG0008');await group.postDriverOffer('DG0008');
 const erin={id:1005,first_name:'Erin'};members.set(1005,'member');
 const realSend=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{ // Telegram refuses to message someone who never started the bot
  if(String(url).endsWith('/sendMessage')&&JSON.parse(init.body).chat_id==='1005')return Response.json({ok:false,description:"Forbidden: bot can't initiate conversation with a user"},{status:403});
  return realSend(url,init);
 };
 sent.length=0;
 await group.handleDriverTake({id:'tap3',from:erin,data:'dj_take:DG0008',message:{message_id:3,chat:{id:-100222,type:'supergroup'}}});
 globalThis.fetch=realSend;
 assert.equal(sent.find(s=>s.method==='answerCallbackQuery').body.url,'https://t.me/waydidi_bot?start=reg_DG0008');
 sent.length=0;
 assert.equal(await group.handleDriverPrivate({message_id:9,chat:{id:1005,type:'private'},from:erin,text:'/start reg_DG0008'}),true);
 assert.match(sent.filter(s=>s.body.chat_id==='1005').at(-1).body.text,/\(1\/7\)/);
 // Someone else can't use her sign-up link.
 sent.length=0;
 await group.handleDriverPrivate({message_id:10,chat:{id:1001,type:'private'},from:alice,text:'/start reg_DG0008'});
 assert.match(sent.at(-1).body.text,/ไม่ได้รอข้อมูลจากคุณแล้ว/);
});

test('a first-time driver who does not finish in time loses the job and it is offered again',async()=>{
 const dave={id:1006,first_name:'Dave'};members.set(1006,'member');
 await booking('DG0009');await group.postDriverOffer('DG0009');
 assert.deepEqual(await group.takeJob(dave,'DG0009'),{ok:true,driver:null});
 await group.reopenLapsedSignups(new Date()); // still in time: nothing changes
 assert.equal(await d1.prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference='DG0009'").first('status'),'signing_up');
 await d1.prepare("UPDATE telegram_driver_jobs SET hold_until='2020-01-01T00:00:00Z' WHERE booking_reference='DG0009'").run();
 sent.length=0;
 await group.reopenLapsedSignups(new Date());
 assert.deepEqual(await d1.prepare("SELECT status,holder_telegram_id FROM telegram_driver_jobs WHERE booking_reference='DG0009'").first(),{status:'open',holder_telegram_id:null});
 assert.match(sent.find(s=>s.body.chat_id==='1006').body.text,/หมดเวลากรอกข้อมูล/);
 const edit=sent.find(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222');
 assert.deepEqual(edit.body.reply_markup.inline_keyboard,[[{text:'✋ รับงาน (Assign)',callback_data:'dj_take:DG0009'}]]);
 assert.equal((await group.takeJob(alice,'DG0009')).ok,true); // the next tap gets it
});

test('a first-time driver can give the job back before signing up',async()=>{
 const fon={id:1007,first_name:'Fon'};members.set(1007,'member');
 await booking('DG0011');await group.postDriverOffer('DG0011');
 assert.equal((await group.takeJob(fon,'DG0011')).ok,true);
 await group.handleDriverCallback({id:'x1',from:bob,data:'dj_x:DG0011',message:{message_id:5,chat:{id:1002,type:'private'}}}); // not hers to give back
 assert.equal(await d1.prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference='DG0011'").first('status'),'signing_up');
 await group.handleDriverCallback({id:'x2',from:fon,data:'dj_x:DG0011',message:{message_id:6,chat:{id:1007,type:'private'}}});
 assert.equal(await d1.prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference='DG0011'").first('status'),'open');
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

test('the bulk cost message: "ราคา" then one booking and cost per line',()=>{
 const {parseBulkCost}=bulkRules;
 assert.equal(parseBulkCost('FMBNUW 1800'),null); // needs the first word
 assert.equal(parseBulkCost('ราคาเท่าไหร่'),null);
 assert.deepEqual(parseBulkCost('ราคา\nfmbnuw 1800\n52LLDS: 2,200 บาท\nABCD12 - ฿900'),{items:[{reference:'FMBNUW',cost:1800},{reference:'52LLDS',cost:2200},{reference:'ABCD12',cost:900}],invalid:[]});
 assert.deepEqual(parseBulkCost('/cost FMBNUW 1800, 52LLDS 2,200'),{items:[{reference:'FMBNUW',cost:1800},{reference:'52LLDS',cost:2200}],invalid:[]});
 assert.deepEqual(parseBulkCost('cost\nFMBNUW 1800\nFMBNUW 1900'),{items:[{reference:'FMBNUW',cost:1900}],invalid:[]}); // the last one counts
 assert.deepEqual(parseBulkCost('ราคา\nFMBNUW 0\nFMBNUW abc\nXY 100\nGOOD12 600000'),{items:[],invalid:['FMBNUW 0','FMBNUW abc','XY 100','GOOD12 600000']});
 const many=parseBulkCost('ราคา\n'+Array.from({length:22},(_,i)=>`REF${String(i).padStart(3,'0')} 1000`).join('\n'));
 assert.equal(many.items.length,20);assert.deepEqual(many.invalid,['REF020','REF021']);
});

test('setting costs for several bookings in one message posts them all to the driver group, earliest first',async()=>{
 const {setCostsFromMessage}=await vite.ssrLoadModule('/lib/telegram/bulk-cost.ts');
 await booking('BK0003',{cost:0,date:'2099-03-03'});
 await booking('BK0001',{cost:0,date:'2099-03-01'});
 await booking('BK0002',{cost:0,date:'2099-03-02'});
 await booking('BKGONE',{cost:0,status:'cancelled'});
 sent.length=0;
 await setCostsFromMessage(bulkRules.parseBulkCost('ราคา\nBK0003 1500\nBK0001 1200\nBK0002 1300\nBKGONE 900\nNOPE99 800\nbad line'),'Nok',4242);
 const offers=sent.filter(s=>s.method==='sendMessage'&&s.body.chat_id==='-100222');
 assert.deepEqual(offers.map(o=>o.body.reply_markup.inline_keyboard[0][0].callback_data),['dj_take:BK0001','dj_take:BK0002','dj_take:BK0003']);
 assert.match(offers[0].body.text,/ค่างาน: 1,200 บาท/);
 for(const [ref,cost] of [['BK0001',1200],['BK0002',1300],['BK0003',1500]]){
  assert.equal(await d1.prepare("SELECT total_driver_cost FROM booking_costs WHERE booking_reference=?").bind(ref).first('total_driver_cost'),cost);
  assert.deepEqual(await d1.prepare("SELECT cost_done,acknowledged_by FROM telegram_booking_cards WHERE booking_reference=?").bind(ref).first(),{cost_done:1,acknowledged_by:'Nok'});
 }
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM booking_costs WHERE booking_reference='BKGONE'").first('n'),0);
 const summary=sent.filter(s=>s.method==='sendMessage'&&s.body.chat_id==='-100111').at(-1).body;
 assert.equal(summary.reply_parameters.message_id,4242);
 assert.equal(summary.text,['<b>ตั้งราคาค่างาน</b> · Nok','✓ <b>BK0001</b> 1,200 บาท · ส่งเข้ากลุ่มคนขับแล้ว','✓ <b>BK0002</b> 1,300 บาท · ส่งเข้ากลุ่มคนขับแล้ว','✓ <b>BK0003</b> 1,500 บาท · ส่งเข้ากลุ่มคนขับแล้ว','✗ <b>BKGONE</b> ไม่พบการจองที่ยืนยันแล้ว','✗ <b>NOPE99</b> ไม่พบการจองที่ยืนยันแล้ว','✗ อ่านไม่ได้: bad line'].join('\n'));
 // Sending the same costs again doesn't post the jobs twice.
 sent.length=0;
 await setCostsFromMessage(bulkRules.parseBulkCost('ราคา BK0001 1250'),'Nok',4243);
 assert.equal(sent.filter(s=>s.method==='sendMessage'&&s.body.chat_id==='-100222').length,0);
 assert.match(sent.find(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222').body.text,/ค่างาน: 1,250 บาท/);
});

test('a new booking card goes to the team group only; the driver group waits for the cost',async()=>{
 const {notifyBookingTelegram}=await vite.ssrLoadModule('/lib/telegram/bookings.ts');
 await booking('NEW001',{cost:0});
 await d1.prepare("DELETE FROM telegram_booking_cards WHERE booking_reference='NEW001'").run();
 sent.length=0;
 await notifyBookingTelegram('NEW001');
 assert.deepEqual(sent.filter(s=>s.method==='sendMessage').map(s=>s.body.chat_id),['-100111']);
});

test('the Completed job message goes to both groups with the same text',async()=>{
 const {postJobCompleted}=await vite.ssrLoadModule('/lib/telegram/trip-photos.ts');
 sent.length=0;
 await postJobCompleted('DG0001','outbound');
 const posts=sent.filter(s=>s.method==='sendMessage');
 assert.deepEqual(posts.map(p=>p.body.chat_id),['-100222','-100111']);
 assert.equal(posts[0].body.text,posts[1].body.text);
 assert.match(posts[1].body.text,/^✅ <b>Completed job<\/b>\nReference ID: DG0001/);
});
