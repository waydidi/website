import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// A booking that already has a driver was edited: the Admin group chooses the current driver or a new driver.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
const env={DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100111',TELEGRAM_DRIVER_CHAT_ID:'-100222',TELEGRAM_DRIVER_CHAT_ID_SOUTH:'-100333',TELEGRAM_DRIVER_JOBS:'1'};
globalThis.__editChoice={env};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__editChoice.env';}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[], members=new Map();
let nextId=500;
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 const method=String(url).split('/').pop();
 const body=typeof init.body==='string'?JSON.parse(init.body):init.body;
 sent.push({method,body});
 if(method==='getMe')return Response.json({ok:true,result:{username:'waydidi_bot'}});
 if(method==='getChatMember')return Response.json({ok:true,result:{status:members.get(body.chat_id+':'+body.user_id)??'left'}});
 return Response.json({ok:true,result:{message_id:nextId++,chat:{id:-1}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__editChoice;});

const changes=await vite.ssrLoadModule('/lib/telegram/booking-changes.ts');
const at='2026-10-13T00:00:00Z';
const msgs=()=>sent.filter(s=>s.method==='sendMessage');
// A booking that has a driver: the job was taken from the driver group, assigned, and the ใบงาน sent.
async function jobWithDriver(ref,{pickup='Phuket International Airport (HKT)'}={}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,amount_paid,flight_number,status,created_at,access_token_hash,updated_at) VALUES(?,'Jessica','Moore','jess@example.com','+66811112222',?,'Patong',?,'09:30',4,3,'premium_minivan','cash',2500,0,'TG101','confirmed',?,?,?)").bind(ref,pickup,`2099-01-${String(10+Number(ref.slice(-1))).padStart(2,'0')}`,at,'tok-'+ref,at).run();
 await d1.prepare("INSERT INTO booking_costs(booking_reference,agreed_driver_cost,additional_costs,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,1800,0,1800,'unpaid','test',?,?)").bind(ref,at,at).run();
 await d1.prepare("INSERT OR IGNORE INTO drivers(id,full_name,phone,vehicle,car_plate,driver_type,status,created_at,updated_at) VALUES('drv-1','Somchai Jaidee','0812345678','Toyota Commuter','กข 1234','outsource','active',?,?)").bind(at,at).run();
 await d1.prepare("INSERT OR IGNORE INTO telegram_driver_links(telegram_user_id,driver_id,linked_at) VALUES('5001','drv-1',?)").bind(at).run();
 const form={name:'Somchai Jaidee',phone:'0812345678',plate:'กข 1234',model:'Toyota Commuter',driverId:'drv-1'};
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,acknowledged_by,cost_done,driver_done,assignment_posted,driver_form_json,created_at) VALUES(?,9000,'Admin',1,1,1,?,?)").bind(ref,JSON.stringify(form),at).run();
 await d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES(?,?,'outbound','drv-1',?,'assigned','telegram:test',?,'2099-01-20T00:00:00Z',?)").bind('as-'+ref,ref,'h-'+ref,at,at).run();
 await d1.prepare("INSERT INTO telegram_driver_jobs(booking_reference,telegram_message_id,status,driver_id,created_at,updated_at) VALUES(?,7000,'taken','drv-1',?,?)").bind(ref,at,at).run();
}
const live=(ref)=>d1.prepare("SELECT COUNT(*) n FROM booking_assignments WHERE booking_reference=? AND leg='outbound' AND revoked_at IS NULL").bind(ref).first('n');

test('a booking with no driver is only redrawn when edited: no edit card, nobody is told',async()=>{
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,access_token_hash,created_at,updated_at) VALUES('ED0001','Jess','j@x.co','A','B','2099-01-15','09:30',2,1,'economy_sedan','cash',900,'confirmed','h',?,?)").bind(at,at).run();
 sent.length=0;
 await changes.notifyBookingEdited('ED0001','Admin','แก้ไขโดยแอดมิน');
 assert.equal(sent.filter(s=>(s.body.text??'').includes('แก้ไขการจอง')).length,0);
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM telegram_request_cards WHERE booking_reference='ED0001'").first('n'),0);
});

test('editing a booking that has a driver posts an edit card to the Admin group; the driver is not told yet',async()=>{
 await jobWithDriver('ED0002');
 sent.length=0;
 await changes.notifyBookingEdited('ED0002','Owner','แก้ไขโดยแอดมิน');
 const card=msgs().find(m=>m.body.text.includes('แก้ไขการจอง ED0002'));
 assert.ok(card);assert.equal(card.body.chat_id,'-100111');
 assert.match(card.body.text,/คนขับปัจจุบัน: Somchai Jaidee · กข 1234 · 0812345678/);
 assert.deepEqual(card.body.reply_markup.inline_keyboard,[[{text:'Assign to me',callback_data:card.body.reply_markup.inline_keyboard[0][0].callback_data}]]);
 assert.match(card.body.reply_markup.inline_keyboard[0][0].callback_data,/^edit_ack:ED0002-/);
 assert.ok(!msgs().some(m=>m.body.text.includes('แก้ไขงาน ED0002')));
 assert.equal(await live('ED0002'),1); // still assigned, the old link still works
 // A second edit before anyone answers replaces the first card.
 sent.length=0;
 await changes.notifyBookingEdited('ED0002','Owner','แก้ไขการชำระเงิน');
 assert.ok(sent.some(s=>s.method==='editMessageText'&&String(s.body.text).includes('ถูกแทนที่ด้วยการแก้ไขล่าสุด')));
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM telegram_request_cards WHERE booking_reference='ED0002' AND kind='edit' AND status IN ('open','ack')").first('n'),1);
});

test('Assign to me shows the two choices, and two people tapping at once: one wins',async()=>{
 await jobWithDriver('ED0003');
 await changes.notifyBookingEdited('ED0003','Owner','');
 const id=(await d1.prepare("SELECT id FROM telegram_request_cards WHERE booking_reference='ED0003' AND kind='edit' AND status='open'").first('id'));
 sent.length=0;
 const [a,b]=await Promise.all([changes.acknowledgeEdit(id,'Admin A'),changes.acknowledgeEdit(id,'Admin B')]);
 assert.equal([a,b].filter(r=>/It's yours/.test(r)).length,1);
 const shown=sent.filter(s=>s.method==='editMessageText').at(-1);
 assert.deepEqual(shown.body.reply_markup.inline_keyboard[0].map(x=>x.text),['คนขับปัจจุบัน','คนขับใหม่']);
 assert.match(shown.body.text,/รับเรื่องโดย: Admin [AB]/);
 // The choices only work after someone took it, and once.
 await d1.prepare("INSERT INTO telegram_request_cards(id,booking_reference,kind,telegram_message_id,status,created_at) VALUES('ED0003-open','ED0003','edit',1,'open',?)").bind(at).run();
 assert.equal(await changes.editKeepDriver('ED0003-open','Admin A'),'Already handled.');
 assert.equal(await changes.editNewDriver('ED0003-open','Admin A',{id:1,first_name:'A'}),'Already handled.');
});

test('คนขับปัจจุบัน: the driver who has the job gets the updated ใบงาน with a new link',async()=>{
 await jobWithDriver('ED0004');
 await changes.notifyBookingEdited('ED0004','Owner','');
 const id=await d1.prepare("SELECT id FROM telegram_request_cards WHERE booking_reference='ED0004' AND kind='edit'").first('id');
 await changes.acknowledgeEdit(id,'Admin');
 sent.length=0;
 const [r1,r2]=await Promise.all([changes.editKeepDriver(id,'Admin'),changes.editKeepDriver(id,'Admin')]);
 assert.equal([r1,r2].filter(r=>/Updated job sent/.test(r)).length,1);
 assert.ok(msgs().some(m=>m.body.text.includes('แก้ไขงาน ED0004')&&m.body.text.includes('Somchai Jaidee'))); // the new ใบงาน, once
 assert.equal(msgs().filter(m=>m.body.text.includes('แก้ไขงาน ED0004')).length,1);
 assert.equal(await live('ED0004'),1);
 assert.notEqual(await d1.prepare("SELECT token_hash FROM booking_assignments WHERE booking_reference='ED0004' AND revoked_at IS NULL").first('token_hash'),'h-ED0004'); // a new link
 assert.equal(await d1.prepare("SELECT status FROM telegram_request_cards WHERE id=?").bind(id).first('status'),'done');
});

test('คนขับใหม่: the old driver loses the job, the driver group post is withdrawn, the Admin group is asked for a new cost, and the job is offered again',async()=>{
 await jobWithDriver('ED0005');
 await changes.notifyBookingEdited('ED0005','Owner','');
 const id=await d1.prepare("SELECT id FROM telegram_request_cards WHERE booking_reference='ED0005' AND kind='edit'").first('id');
 await changes.acknowledgeEdit(id,'Admin');
 sent.length=0;
 assert.match(await changes.editNewDriver(id,'Admin',{id:42,first_name:'Admin'}),/new driver cost/);
 assert.equal(await live('ED0005'),0); // the old link stops working
 const card=await d1.prepare("SELECT driver_done,cost_done,assignment_posted,driver_form_json FROM telegram_booking_cards WHERE booking_reference='ED0005'").first();
 assert.deepEqual([card.driver_done,card.cost_done,card.assignment_posted,card.driver_form_json],[0,0,0,null]);
 assert.equal(await d1.prepare("SELECT total_driver_cost FROM booking_costs WHERE booking_reference='ED0005'").first('total_driver_cost'),0); // the old cost is cleared: it must be set again
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM telegram_driver_jobs WHERE booking_reference='ED0005'").first('n'),0);
 // The old offer in the driver group says so, the old driver is told privately, and the cost question goes to the Admin group.
 const old=sent.find(s=>s.method==='editMessageText'&&s.body.chat_id==='-100222'&&s.body.message_id===7000);
 assert.match(old.body.text,/กำลังหาคนขับใหม่/);assert.deepEqual(old.body.reply_markup.inline_keyboard,[]);
 assert.ok(msgs().some(m=>m.body.chat_id==='5001'&&/เปลี่ยนคนขับ/.test(m.body.text)));
 const ask=msgs().find(m=>m.body.chat_id==='-100111'&&/Driver cost/i.test(m.body.text)&&m.body.text.includes('ED0005'));
 assert.ok(ask);
 // Setting the new cost offers the job to the driver group again (south pickup: the south group).
 const {saveDriverCost}=await vite.ssrLoadModule('/lib/telegram/booking-tasks.ts');
 const {refreshBookingCard}=await vite.ssrLoadModule('/lib/telegram/bookings.ts');
 sent.length=0;
 await saveDriverCost('ED0005',2200,'Admin');await refreshBookingCard('ED0005');
 const offer=msgs().find(m=>m.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data==='dj_take:ED0005');
 assert.ok(offer);assert.equal(offer.body.chat_id,'-100333');assert.match(offer.body.text,/ค่างาน: 2,200 บาท/);
});
