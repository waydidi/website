import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// The second driver group for the south of Thailand: a pickup in the south is offered only there.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
const env={DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100111',TELEGRAM_DRIVER_CHAT_ID:'-100222',TELEGRAM_DRIVER_CHAT_ID_SOUTH:'-100333',TELEGRAM_DRIVER_JOBS:'1'};
globalThis.__southGroup={env};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__southGroup.env';}}],server:{middlewareMode:true}});
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
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__southGroup;});

const rules=await vite.ssrLoadModule('/lib/telegram/driver-group-rules.ts');
const group=await vite.ssrLoadModule('/lib/telegram/driver-group.ts');
const at='2026-10-13T00:00:00Z';
async function booking(ref,pickup){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,amount_paid,flight_number,status,created_at,access_token_hash,updated_at) VALUES(?,'Jessica','Moore','jess@example.com','+66811112222',?,'Hotel','2099-01-15','09:30',4,3,'premium_minivan','cash',2500,0,'TG101','confirmed',?,?,?)").bind(ref,pickup,at,'tok-'+ref,at).run();
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,9000,?)").bind(ref,at).run();
 await d1.prepare("INSERT INTO booking_costs(booking_reference,agreed_driver_cost,additional_costs,total_driver_cost,payment_status,updated_by,created_at,updated_at) VALUES(?,1800,0,1800,'unpaid','test',?,?)").bind(ref,at,at).run();
}

test('the south group is optional, never the same as another group, and found by its chat id',()=>{
 const on={TELEGRAM_DRIVER_JOBS:'1',TELEGRAM_CHAT_ID:'-100111',TELEGRAM_DRIVER_CHAT_ID:'-100222'};
 assert.deepEqual(rules.driverGroupConfig(on),{chatId:'-100222',southChatId:null});
 assert.deepEqual(rules.driverGroupConfig({...on,TELEGRAM_DRIVER_CHAT_ID_SOUTH:'-100333'}),{chatId:'-100222',southChatId:'-100333'});
 for(const bad of ['-100222','-100111','nope',''])assert.equal(rules.driverGroupConfig({...on,TELEGRAM_DRIVER_CHAT_ID_SOUTH:bad}).southChatId,null,bad);
 assert.equal(rules.driverGroupConfig({...on,TELEGRAM_DRIVER_JOBS:'',TELEGRAM_DRIVER_CHAT_ID_SOUTH:'-100333'}),null);
 const cfg=rules.driverGroupConfig({...on,TELEGRAM_DRIVER_CHAT_ID_SOUTH:'-100333'});
 assert.ok(rules.isDriverGroupChat(cfg,'-100222')&&rules.isDriverGroupChat(cfg,'-100333'));
 assert.ok(!rules.isDriverGroupChat(cfg,'-100111')&&!rules.isDriverGroupChat(null,'-100222'));
});

test('a pickup in the south is recognised by the place named, in English or Thai',()=>{
 for(const yes of ['Phuket International Airport (HKT)','Krabi Airport','Hat Yai, Songkhla','Koh Samui Airport','Khao Lak, Phang Nga','สนามบินภูเก็ต','อ่าวนาง กระบี่','Surat Thani railway station'])assert.ok(rules.isSouthPickup(yes),yes);
 for(const no of ['Suvarnabhumi Airport (BKK)','Don Mueang Airport','Pattaya','Chiang Mai','Hua Hin','Koh Chang','',null])assert.ok(!rules.isSouthPickup(no),String(no));
 const cfg={chatId:'-100222',southChatId:'-100333'};
 assert.equal(rules.groupChatFor(cfg,'Phuket Airport'),'-100333');
 assert.equal(rules.groupChatFor(cfg,'Suvarnabhumi Airport'),'-100222');
 assert.equal(rules.groupChatFor({chatId:'-100222',southChatId:null},'Phuket Airport'),'-100222'); // no south group: the main one
});

test('a south pickup is offered only in the south group; every other job only in the main group',async()=>{
 await booking('SG0001','Phuket International Airport (HKT)');
 await booking('SG0002','Suvarnabhumi Airport (BKK)');
 sent.length=0;
 await group.postDriverOffer('SG0001');
 await group.postDriverOffer('SG0002');
 const posts=sent.filter(s=>s.method==='sendMessage');
 assert.deepEqual(posts.map(p=>[p.body.chat_id,p.body.reply_markup.inline_keyboard[0][0].callback_data]),[['-100333','dj_take:SG0001'],['-100222','dj_take:SG0002']]);
 // The offer's own chat is remembered: updates and trip photos go to it.
 assert.equal((await group.driverOfferMessage('SG0001')).chatId,'-100333');
 assert.equal((await group.driverOfferMessage('SG0002')).chatId,'-100222');
 sent.length=0;
 await group.syncDriverOffer('SG0001');
 assert.ok(sent.filter(s=>s.method==='editMessageText').every(s=>s.body.chat_id==='-100333'));
 assert.ok(sent.some(s=>s.method==='editMessageText'));
 assert.equal(await d1.prepare("SELECT chat_id FROM telegram_driver_job_chats WHERE booking_reference='SG0001'").first('chat_id'),'-100333');
});

test('only a member of the group the job was offered in can take it',async()=>{
 await booking('SG0003','Krabi Airport');
 await group.postDriverOffer('SG0003');
 const mainOnly={id:2001,first_name:'Main'}, southMember={id:2002,first_name:'South'};
 members.set('-100222:2001','member'); // in the main group only
 members.set('-100333:2002','member');
 const denied=await group.takeJob(mainOnly,'SG0003');
 assert.equal(denied.ok,false);
 assert.equal(await d1.prepare("SELECT status FROM telegram_driver_jobs WHERE booking_reference='SG0003'").first('status'),'open'); // nothing changed
 const taken=await group.takeJob(southMember,'SG0003');
 assert.equal(taken.ok,true);
 // And the other way round: a south-only member cannot take a main-group job.
 await booking('SG0004','Pattaya');
 await group.postDriverOffer('SG0004');
 assert.equal((await group.takeJob(southMember,'SG0004')).ok,false);
 assert.equal((await group.takeJob(mainOnly,'SG0004')).ok,true);
});

test('a job offered before the south group existed stays in the main group',async()=>{
 await booking('SG0005','Phuket Town');
 await d1.prepare("INSERT INTO telegram_driver_jobs(booking_reference,telegram_message_id,created_at,updated_at) VALUES('SG0005',77,?,?)").bind(at,at).run();
 assert.equal((await group.driverOfferMessage('SG0005')).chatId,'-100222');
});
