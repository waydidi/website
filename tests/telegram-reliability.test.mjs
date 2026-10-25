import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {migrationStatements} from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
for(const f of (await readdir(root+'/drizzle')).filter(f=>f.endsWith('.sql')).sort()) {const sql=migrationStatements(await readFile(root+'/drizzle/'+f,'utf8'));if(sql.length)await db.batch(sql.map(s=>db.prepare(s)));}
const state=globalThis.__reliability={env:{DB:db,TELEGRAM_BOT_TOKEN:'mock',TELEGRAM_CHAT_ID:'-100111',TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24)},admin:{id:'owner',role:'owner',email:'audit@example.invalid',displayName:'Owner'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false},plugins:[{name:'reliability-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0reliability-env';if(id.endsWith('/lib/admin'))return '\0reliability-admin';},load(id){if(id==='\0reliability-env')return 'export const env=globalThis.__reliability.env';if(id==='\0reliability-admin')return 'export const getWaydidiAdmin=async()=>globalThis.__reliability.admin;export const verifyAdminKey=async()=>true';}}]});
const realFetch=globalThis.fetch,sends=[];let mode='ok',mid=1000,deferredReply=null;
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))throw new Error('Unexpected external request');
 const method=String(url).split('/').pop();const body=typeof init.body==='string'?JSON.parse(init.body):Object.fromEntries(init.body.entries());
 sends.push({method,body});
 if(mode==='timeout')throw new Error('simulated transport loss');
 if(mode==='reject')return Response.json({ok:false,description:'mock rejection'},{status:400});
 if(mode==='rate')return Response.json({ok:false,parameters:{retry_after:3600},description:'Private text audit@example.invalid mock'},{status:429});
 if(mode==='malformed')return Response.json({ok:true,result:{message_id:'wrong-type'}});
 if(mode==='private_reject')return Response.json({ok:false,description:'audit@example.invalid PRIVATE_TOKEN mock'},{status:400});
 if(mode==='blocked_private')return Response.json({ok:false,description:'Forbidden: bot blocked audit@example.invalid PRIVATE_TOKEN mock'},{status:403});
 if(mode==='defer')return new Promise(resolve=>{deferredReply=resolve;});
 if(method==='getChatMember')return Response.json({ok:true,result:{status:'member'}});
 const result={message_id:++mid,chat:{id:Number(body.chat_id)}};
 return Response.json({ok:true,result:method==='sendMediaGroup'?[result,{...result,message_id:++mid}]:result});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__reliability;});
const mod=p=>vite.ssrLoadModule(p);
const service=await mod('/lib/assignment-service.ts'),outbox=await mod('/lib/telegram/outbox.ts'),chat=await mod('/lib/website-chat.ts'),tasks=await mod('/lib/telegram/booking-tasks.ts'),cards=await mod('/lib/telegram/bookings.ts'),delivery=await mod('/lib/telegram/assignments.ts'),changes=await mod('/lib/telegram/booking-changes.ts'),requests=await mod('/lib/cancellation-requests.ts'),settings=await mod('/app/api/admin/chat/telegram/route.ts'),assistant=await mod('/lib/telegram/assistant.ts'),photos=await mod('/lib/telegram/trip-photos.ts'),bin=await mod('/lib/booking-bin.ts'),edit=await mod('/app/api/admin/bookings/[reference]/route.ts'),group=await mod('/lib/telegram/driver-group.ts'),files=await mod('/lib/file-store.ts');
const at=new Date().toISOString();let seq=0;
async function booking(opts={}){
 const ref='RA'+String(++seq).padStart(4,'0'),driver='driver-'+ref;
 await db.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,access_token_hash,created_at,updated_at,return_date,return_time) VALUES(?,'Audit Test','audit@example.invalid','Bangkok','Pattaya',?,'09:00',1,0,'economy_sedan','cash',2000,?,'cash_due','audit',?,?,?,?)").bind(ref,opts.date??'2099-01-15',opts.status??'confirmed',at,at,opts.return?'2099-01-16':null,opts.return?'10:00':null).run();
 await db.prepare("INSERT INTO drivers(id,full_name,phone,vehicle,status,created_at,updated_at) VALUES(?,'Audit Driver','0812345678','Sedan','active',?,?)").bind(driver,at,at).run();
 await db.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,800,?)").bind(ref,at).run();
 return {ref,driver};
}
async function conversation(extra={}){
 const id=crypto.randomUUID();await db.prepare("INSERT INTO website_conversations(id,public_id,token_hash,expires_at,created_at,updated_at,telegram_message_id,assigned_name,assigned_telegram_user_id) VALUES(?,?,?,'2099-01-01',?,?,900,?,?)").bind(id,'WD-'+id,id,at,at,extra.name??null,extra.telegram??null).run();return id;
}
const req=body=>new Request('https://example.invalid/api/admin/chat/telegram',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(body)});

test('assignment replacement, token rotation and outbox roll back together on database failure',async()=>{
 const {ref,driver}=await booking();const first=await service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'audit'});assert.ok(first.ok);
 await db.prepare(`CREATE TRIGGER fail_assignment BEFORE INSERT ON booking_assignments WHEN NEW.booking_reference='${ref}' BEGIN SELECT RAISE(FAIL,'fault'); END`).run();
 await assert.rejects(()=>service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'audit'}));await db.prepare('DROP TRIGGER fail_assignment').run();
 assert.equal((await db.prepare('SELECT revoked_at FROM booking_assignments WHERE id=?').bind(first.assignment.id).first()).revoked_at,null);
 assert.equal((await db.prepare('SELECT driver_token FROM booking_links WHERE booking_reference=?').bind(ref).first()).driver_token,first.token);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM booking_notifications WHERE booking_reference=?').bind(ref).first()).n,1);
});
test('cancelled, completed, inactive-driver and changed-version assignments are denied',async()=>{
 for(const status of ['cancelled','completed']){const {ref,driver}=await booking({status});assert.equal((await service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'audit'})).ok,false);}
 const {ref,driver}=await booking();await db.prepare("UPDATE drivers SET status='inactive' WHERE id=?").bind(driver).run();assert.equal((await service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'audit'})).ok,false);await db.prepare("UPDATE drivers SET status='active' WHERE id=?").bind(driver).run();assert.equal((await service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'audit',expectedVersion:999})).ok,false);
});
test('concurrent overlapping jobs cannot both be assigned to one driver; retries are idempotent',async()=>{
 const a=await booking(),b=await booking();const results=await Promise.all([a,b].map(b=>service.assignDriver({reference:b.ref,leg:'outbound',driverId:a.driver,by:'audit',idempotencyKey:b.ref})));assert.equal(results.filter(r=>r.ok).length,1);
 const won=results[0].ok?a:b,r=results.find(r=>r.ok);const replay=await service.assignDriver({reference:won.ref,leg:'outbound',driverId:a.driver,by:'audit',idempotencyKey:won.ref});assert.equal(replay.assignment.id,r.assignment.id);assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_assignments WHERE driver_id=? AND revoked_at IS NULL").bind(a.driver).first()).n,1);
});
test('Telegram assignment rejection stays retryable in the same assignment outbox',async()=>{
 const {ref,driver}=await booking();await tasks.saveDriverCost(ref,900,'Owner');await db.prepare('UPDATE telegram_booking_cards SET driver_done=1,driver_form_json=? WHERE booking_reference=?').bind(JSON.stringify({driverId:driver,name:'Audit Driver'}),ref).run();mode='reject';assert.equal(await tasks.postAssignmentWhenReady(ref,'Owner'),true);mode='ok';
 const row=await db.prepare("SELECT assignment_id,status FROM booking_notifications WHERE booking_reference=? AND channel='telegram'").bind(ref).first();assert.equal(row.status,'failed');await db.prepare("UPDATE booking_notifications SET scheduled_for='2020-01-01' WHERE assignment_id=?").bind(row.assignment_id).run();await delivery.retryAssignmentTelegram();assert.equal((await db.prepare('SELECT status FROM booking_notifications WHERE assignment_id=?').bind(row.assignment_id).first()).status,'sent');assert.equal((await db.prepare('SELECT COUNT(*) n FROM booking_assignments WHERE booking_reference=?').bind(ref).first()).n,1);
 // Explicit private updates work for a linked driver even when new group offers are disabled.
 await db.prepare("INSERT INTO telegram_driver_links(telegram_user_id,driver_id,linked_at) VALUES('989898',?,?)").bind(driver,at).run();
 state.env.TELEGRAM_DRIVER_UPDATES='1';const count=sends.length;
 await group.sendJobToLinkedDriver(driver,'Job link update','opt-in-update',row.assignment_id);
 assert.ok(sends.slice(count).some(s=>s.body.chat_id==='989898'));
 delete state.env.TELEGRAM_DRIVER_UPDATES;const after=sends.length;
 await group.sendJobToLinkedDriver(driver,'Default stays off','disabled-update',row.assignment_id);
 assert.equal(sends.length,after);
});
test('group reply lookup never treats a private inbound staff message ID as a group route',async()=>{
 const id=await conversation();await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,client_id,telegram_message_id,telegram_status) VALUES(?,?,'staff','private',?,'telegram:444:555',555,'sent')").bind(crypto.randomUUID(),id,at).run();assert.equal(await chat.conversationForTelegramMessage(555,'-100111'),null);assert.equal(await chat.conversationForTelegramMessage(555,'444'),null);
});
test('disabled assignees do not receive customer messages; removal clears assignment and private mappings',async()=>{
 await db.prepare("INSERT INTO telegram_admins(id,telegram_user_id,display_name,enabled,created_at,updated_at) VALUES('revoke-user','444','Old Staff',0,?,?)").bind(at,at).run();const id=await conversation({name:'Old Staff',telegram:'444'}),before=sends.length;await chat.addVisitorMessage(await chat.conversationById(id),'private customer','revoked-client');assert.ok(!sends.slice(before).some(s=>s.body.chat_id==='444'));
 await db.prepare("INSERT INTO telegram_dm_messages(chat_id,message_id,conversation_id,created_at) VALUES('444',700,?,?)").bind(id,at).run();assert.equal((await settings.POST(req({action:'remove',id:'revoke-user'}))).status,200);assert.equal((await chat.conversationById(id)).assigned_name,null);assert.equal((await db.prepare("SELECT COUNT(*) n FROM telegram_dm_messages WHERE chat_id='444'").first()).n,0);
});
test('stale processing chat is surfaced as uncertain; a recent attempt on an old message stays processing',async()=>{
 const id=await conversation(),old=crypto.randomUUID(),recent=crypto.randomUUID();for(const mid of [old,recent])await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,telegram_status) VALUES(?,?,'visitor','pending','2020-01-01','processing')").bind(mid,id).run();await db.prepare('INSERT INTO telegram_chat_delivery_attempts(message_id,claim_id,attempted_at) VALUES(?,?,?)').bind(recent,'recent',new Date().toISOString()).run();await chat.retryFailedTelegram();assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(old).first()).telegram_status,'uncertain');assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(recent).first()).telegram_status,'processing');
});
test('an old zero-ID booking-card claim requires review instead of a blind duplicate',async()=>{
 const {ref}=await booking();await db.prepare('UPDATE telegram_booking_cards SET telegram_message_id=0 WHERE booking_reference=?').bind(ref).run();const before=sends.length;await cards.notifyBookingTelegram(ref);assert.equal(sends.length,before);assert.equal((await db.prepare('SELECT status FROM telegram_delivery_jobs WHERE id=?').bind('booking-card:'+ref).first()).status,'uncertain');assert.equal((await settings.POST(req({action:'review_delivery',jobId:'booking-card:'+ref}))).status,400);assert.equal((await settings.POST(req({action:'review_delivery',jobId:'booking-card:'+ref,confirmedAbsent:true}))).status,200);assert.ok((await db.prepare('SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?').bind(ref).first()).telegram_message_id);
});
test('media timeout is uncertain and never triggers the quote fallback or a cron duplicate',async()=>{
 await files.putFile('audit/photo',new Uint8Array([1,2,3]),'image/jpeg');const id=crypto.randomUUID(),before=sends.length;mode='timeout';await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Completed',photos:[{key:'audit/photo',mime:'image/jpeg'}],quote:'Reference: audit',replyTo:1}});mode='ok';assert.equal(sends.length,before+1);assert.equal((await db.prepare('SELECT status FROM telegram_delivery_jobs WHERE id=?').bind(id).first()).status,'uncertain');await outbox.deliverTelegramJob(id);assert.equal(sends.length,before+1);
});
test('definite photo rejection recovers once and completion notifications deduplicate by leg',async()=>{
 const {ref}=await booking({return:true});mode='reject';await photos.postJobCompleted(ref,'outbound');mode='ok';await db.prepare("UPDATE telegram_delivery_jobs SET next_attempt_at='2020-01-01' WHERE id=?").bind(`completed:${ref}:outbound:team`).run();await outbox.retryTelegramOutbox();const before=sends.length;await photos.postJobCompleted(ref,'outbound');assert.equal(sends.length,before);await photos.postJobCompleted(ref,'return');assert.ok(sends.length>before);
});
test('cancellation requests survive missing bot configuration, preserve time and allow a later request after keep',async()=>{
 const {ref}=await booking();delete state.env.TELEGRAM_BOT_TOKEN;await changes.notifyCancellationRequest(ref);const one=await requests.requestCancellation(ref);assert.ok(one);assert.equal((await requests.requestCancellation(ref)).id,one.id);await changes.keepBooking(ref,'Owner',one.id);const two=await requests.requestCancellation(ref);assert.notEqual(two.id,one.id);state.env.TELEGRAM_BOT_TOKEN='mock';await requests.recoverCancellationCards();assert.ok((await db.prepare('SELECT telegram_message_id FROM telegram_request_cards WHERE id=?').bind('cancel:'+two.id).first()).telegram_message_id);
});
test('prompts reject a different user, stale version and expired answers; failed writes leave the prompt answerable',async()=>{
 const {ref}=await booking();await tasks.askBookingQuestion(ref,'cost',{id:777,first_name:'Owner'},'atomic-prompt');const prompt=await db.prepare('SELECT telegram_message_id FROM telegram_booking_prompts WHERE booking_reference=?').bind(ref).first();const m={message_id:3331,chat:{id:-100111,type:'group'},from:{id:777},text:'900',reply_to_message:{message_id:prompt.telegram_message_id}};
 assert.equal(await tasks.handleBookingAnswer({...m,from:{id:888}},'Other',async()=>{}),false);await db.prepare(`CREATE TRIGGER fail_prompt BEFORE INSERT ON booking_costs WHEN NEW.booking_reference='${ref}' BEGIN SELECT RAISE(FAIL,'fault'); END`).run();await assert.rejects(()=>tasks.handleBookingAnswer(m,'Owner',async()=>{}));await db.prepare('DROP TRIGGER fail_prompt').run();assert.equal((await db.prepare('SELECT consumed_at FROM telegram_prompt_context WHERE message_id=?').bind(prompt.telegram_message_id).first()).consumed_at,null);assert.equal(await tasks.handleBookingAnswer(m,'Owner',async()=>{}),true);await tasks.handleBookingAnswer(m,'Owner',async()=>{});assert.equal((await db.prepare('SELECT COUNT(*) n FROM telegram_prompt_answers WHERE prompt_id=?').bind(prompt.telegram_message_id).first()).n,1);assert.equal((await db.prepare("SELECT COUNT(*) n FROM telegram_delivery_jobs WHERE id LIKE 'answer-saved:%' AND id=?").bind('answer-saved:telegram:-100111:3331').first()).n,1);
 await tasks.askBookingQuestion(ref,'cost',{id:777},'expired');const newer=await db.prepare('SELECT telegram_message_id FROM telegram_booking_prompts WHERE booking_reference=? ORDER BY telegram_message_id DESC LIMIT 1').bind(ref).first();await db.prepare("UPDATE telegram_booking_prompts SET created_at='2020-01-01' WHERE telegram_message_id=?").bind(newer.telegram_message_id).run();assert.equal(await tasks.handleBookingAnswer({...m,message_id:3332,reply_to_message:{message_id:newer.telegram_message_id}},'Owner',async()=>{}),false);
});
test('admin address edit invalidates saved navigation atomically and notifies both assigned legs',async()=>{
 const {ref,driver}=await booking({return:true});const backDriver='return-'+ref;await db.prepare("INSERT INTO drivers(id,full_name,phone,status,created_at,updated_at) VALUES(?,'Return Driver','000','active',?,?)").bind(backDriver,at,at).run();const out=await service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'audit'}),back=await service.assignDriver({reference:ref,leg:'return',driverId:backDriver,by:'audit'});assert.ok(out.ok&&back.ok);
 await db.prepare("INSERT INTO booking_map_links(booking_reference,pickup_map_url,dropoff_map_url,updated_by,updated_at) VALUES(?,'https://maps.app.goo.gl/old','https://maps.app.goo.gl/keep','audit',?)").bind(ref,at).run();const response=await edit.PATCH(req({customerPhone:'0812345678',pickup:'New hotel',dropoff:'Pattaya',pickupDate:'2099-01-15',pickupTime:'09:00',returnDate:'2099-01-16',returnTime:'10:00',vehicle:'economy_sedan',passengers:1,luggage:0}),{params:Promise.resolve({reference:ref})});assert.equal(response.status,200);const maps=await db.prepare('SELECT pickup_map_url,dropoff_map_url FROM booking_map_links WHERE booking_reference=?').bind(ref).first();assert.equal(maps.pickup_map_url,null);assert.equal(maps.dropoff_map_url,'https://maps.app.goo.gl/keep');
 // The Admin group now chooses first; «คนขับปัจจุบัน» sends the updated jobs to the current drivers of both legs.
 const changes=await mod('/lib/telegram/booking-changes.ts');const editId=(await db.prepare("SELECT id FROM telegram_request_cards WHERE booking_reference=? AND kind='edit'").bind(ref).first()).id;await changes.acknowledgeEdit(editId,'Admin');await changes.editKeepDriver(editId,'Admin');
 assert.ok((await db.prepare('SELECT revoked_at FROM booking_assignments WHERE id=?').bind(out.assignment.id).first()).revoked_at);assert.ok((await db.prepare('SELECT revoked_at FROM booking_assignments WHERE id=?').bind(back.assignment.id).first()).revoked_at);assert.equal((await db.prepare('SELECT COUNT(*) n FROM booking_assignments WHERE booking_reference=? AND revoked_at IS NULL').bind(ref).first()).n,2);
});
test('return driver offers use independent identities and require an explicit per-leg price',async()=>{
 state.env.TELEGRAM_DRIVER_JOBS='1';state.env.TELEGRAM_DRIVER_CHAT_ID='-100222';state.env.TELEGRAM_RETURN_DRIVER_JOBS='1';const {ref}=await booking({return:true});await tasks.saveDriverCost(ref,900,'Owner');await group.syncDriverOffer(ref);assert.equal(await db.prepare('SELECT * FROM telegram_driver_jobs WHERE booking_reference=?').bind(ref+'--RETURN').first(),null);await db.prepare("INSERT INTO telegram_driver_leg_costs(booking_reference,leg,cost_minor,updated_at) VALUES(?,'return',120000,?)").bind(ref,at).run();await group.syncDriverOffer(ref);const a=await db.prepare('SELECT * FROM telegram_driver_jobs WHERE booking_reference=?').bind(ref).first(),b=await db.prepare('SELECT * FROM telegram_driver_jobs WHERE booking_reference=?').bind(ref+'--RETURN').first();assert.ok(a&&b);assert.notEqual(a.telegram_message_id,b.telegram_message_id);delete state.env.TELEGRAM_DRIVER_JOBS;delete state.env.TELEGRAM_DRIVER_CHAT_ID;delete state.env.TELEGRAM_RETURN_DRIVER_JOBS;
});
test('archive retains immutable policy and financial snapshots and does not fail foreign keys',async()=>{
 const {ref}=await booking();await db.prepare("UPDATE bookings SET status='binned',binned_at=?,purge_after='2020-01-01' WHERE reference=?").bind(at,ref).run();await db.prepare("INSERT INTO booking_policy_snapshots(booking_reference,version,policy_json,accepted_at) VALUES(?,'audit','{}',?)").bind(ref,at).run();assert.equal(await bin.permanentlyDeleteBooking(ref),true);assert.ok(await db.prepare('SELECT reference FROM bookings WHERE reference=?').bind(ref).first());assert.ok(await db.prepare('SELECT booking_reference FROM booking_policy_snapshots WHERE booking_reference=?').bind(ref).first());assert.equal(await bin.permanentlyDeleteBooking(ref),false);
});
test('long unbroken answers preserve every character and simultaneous AI calls cannot over-reserve the cap',async()=>{
 const text='x'.repeat(8000);assert.equal(assistant.splitForTelegram(text).join(''),text);state.env.TELEGRAM_ASSISTANT_MONTHLY_USD='0.0021';const responses=await Promise.allSettled(Array.from({length:6},()=>assistant.reserveAssistantCall({max_tokens:4000,messages:['hello']})));assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);const reserved=responses.find(r=>r.status==='fulfilled').value;await assistant.settleAssistantCall(reserved,{input_tokens:10,output_tokens:10});const row=await db.prepare('SELECT * FROM telegram_assistant_budget WHERE month=?').bind(new Date().toISOString().slice(0,7)).first();assert.equal(row.reserved_microusd,0);assert.ok(row.spent_microusd>0);delete state.env.TELEGRAM_ASSISTANT_MONTHLY_USD;
});
test('only owner may review uncertain deliveries or change Telegram team',async()=>{
 state.admin={...state.admin,role:'support'};assert.equal((await settings.POST(req({action:'review_delivery',jobId:'missing',confirmedAbsent:true}))).status,403);state.admin=null;assert.equal((await settings.POST(req({action:'remove',id:'missing'}))).status,403);state.admin={id:'owner',role:'owner',email:'audit@example.invalid',displayName:'Owner'};
});

test('attempted Telegram payloads stay frozen when producers enqueue the same ID again',async()=>{
 const id=crypto.randomUUID();mode='reject';
 try{
  await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Original notification'}});
  await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Changed notification'}},false);
  const saved=await db.prepare('SELECT payload_json FROM telegram_delivery_jobs WHERE id=?').bind(id).first();
  assert.equal(JSON.parse(saved.payload_json).text,'Original notification');
  await db.prepare("UPDATE telegram_delivery_jobs SET next_attempt_at='2020-01-01' WHERE id=?").bind(id).run();
  mode='ok';await outbox.deliverTelegramJob(id);assert.equal(sends.at(-1).body.text,'Original notification');
 }finally{mode='ok';}
});

test('Telegram attempts and queue age have finite budgets, including missing credentials',async()=>{
 const original=state.env.TELEGRAM_BOT_TOKEN;
 try{
  delete state.env.TELEGRAM_BOT_TOKEN;
  for(const [label,sql] of [['attempts','attempts=12'],['age',"created_at='2000-01-01T00:00:00.000Z'"]]){
   const id='budget:'+label+':'+crypto.randomUUID(),before=sends.length;
   await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Budget test'}},false);
   await db.prepare(`UPDATE telegram_delivery_jobs SET ${sql} WHERE id=?`).bind(id).run();
   assert.equal(await outbox.deliverTelegramJob(id),'dead_letter');
   assert.equal(sends.length,before);
  }
 }finally{state.env.TELEGRAM_BOT_TOKEN=original;}
 const id=crypto.randomUUID();await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Last attempt'}},false);
 await db.prepare('UPDATE telegram_delivery_jobs SET attempts=11 WHERE id=?').bind(id).run();mode='reject';
 try{assert.equal(await outbox.deliverTelegramJob(id),'dead_letter');assert.equal((await db.prepare('SELECT attempts FROM telegram_delivery_jobs WHERE id=?').bind(id).first()).attempts,12);}
 finally{mode='ok';}
});

test('Telegram rate holds survive enqueue and arbitrary provider descriptions never enter stored errors',async()=>{
 const id=crypto.randomUUID(),before=Date.now();mode='rate';
 try{
  assert.equal(await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Rate test'}}),'failed');
  const job=await db.prepare('SELECT * FROM telegram_delivery_jobs WHERE id=?').bind(id).first();
  assert.ok(Date.parse(job.next_attempt_at)>=before+3600000);
  assert.equal(job.last_error,'Telegram: rate limited');
  assert.ok(!job.last_error.includes('audit@example.invalid'));
  const count=sends.length;await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Different'}},false);
  await outbox.deliverTelegramJob(id);assert.equal(sends.length,count);
 }finally{mode='ok';}
 const client=await mod('/lib/telegram/client.ts');mode='private_reject';
 try{await assert.rejects(()=>client.sendTo('-100111','Private request'),error=>error.retryable===true&&!error.message.includes('audit@example.invalid')&&!error.message.includes('PRIVATE_TOKEN')&&!error.message.includes('mock'));}
 finally{mode='ok';}
});

test('malformed success cannot mark a Telegram message sent or trigger a second automatic send',async()=>{
 const id=crypto.randomUUID(),before=sends.length;mode='malformed';
 try{assert.equal(await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Acknowledgment test'}}),'uncertain');}
 finally{mode='ok';}
 await outbox.deliverTelegramJob(id);assert.equal(sends.length,before+1);
});

test('a late Telegram acknowledgment cannot replace a new lease or update linked booking cards',async()=>{
 const {ref}=await booking(),id=crypto.randomUUID();await db.prepare('UPDATE telegram_booking_cards SET telegram_message_id=0 WHERE booking_reference=?').bind(ref).run();
 mode='defer';deferredReply=null;
 const running=outbox.queueTelegram({id,reference:ref,destination:'-100111',payload:{text:'Lease test',target:{kind:'booking_card',id:ref}}});
 try{
  const deadline=Date.now()+10000;while(!deferredReply&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(deferredReply,'provider request started');
  await db.prepare("UPDATE telegram_delivery_jobs SET status='uncertain',attempted_at='2099-01-01T00:00:00.000Z',last_error='New owner result' WHERE id=?").bind(id).run();
  deferredReply(Response.json({ok:true,result:{message_id:888888,chat:{id:-100111}}}));
  assert.equal(await running,'uncertain');
  const job=await db.prepare('SELECT * FROM telegram_delivery_jobs WHERE id=?').bind(id).first();
  assert.equal(job.status,'uncertain');assert.equal(job.last_error,'New owner result');assert.equal(job.telegram_message_id,null);
  assert.equal((await db.prepare('SELECT telegram_message_id FROM telegram_booking_cards WHERE booking_reference=?').bind(ref).first()).telegram_message_id,0);
 }finally{mode='ok';if(deferredReply)deferredReply(Response.json({ok:true,result:{message_id:888888}}));await running;}
});

test('a changed private photo stops rather than sending different bytes on retry',async()=>{
 const id=crypto.randomUUID(),key='audit/frozen-'+id;await files.putFile(key,new Uint8Array([1,2,3]),'image/jpeg');mode='reject';
 try{assert.equal(await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Evidence snapshot',photos:[{key,mime:'image/jpeg'}]}}),'failed');}
 finally{mode='ok';}
 const saved=JSON.parse((await db.prepare('SELECT payload_json FROM telegram_delivery_jobs WHERE id=?').bind(id).first()).payload_json);
 assert.match(saved.photos[0].contentHash,/^[a-f0-9]{64}$/);
 await files.putFile(key,new Uint8Array([4,5,6]),'image/jpeg');await db.prepare("UPDATE telegram_delivery_jobs SET next_attempt_at='2020-01-01' WHERE id=?").bind(id).run();
 const before=sends.length;assert.equal(await outbox.deliverTelegramJob(id),'uncertain');assert.equal(sends.length,before);
});

test('a corrupt queued payload is held without aborting the recovery sweep',async()=>{
 const id=crypto.randomUUID();await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Corruption test'}},false);
 await db.prepare("UPDATE telegram_delivery_jobs SET payload_json='not-json' WHERE id=?").bind(id).run();
 const next=crypto.randomUUID();await outbox.queueTelegram({id:next,destination:'-100111',payload:{text:'Healthy recovery job'}},false);
 await outbox.retryTelegramOutbox(100);
 assert.equal((await db.prepare('SELECT status FROM telegram_delivery_jobs WHERE id=?').bind(id).first()).status,'dead_letter');
 assert.equal((await db.prepare('SELECT status FROM telegram_delivery_jobs WHERE id=?').bind(next).first()).status,'sent');
});

test('an expired rendering lease cannot start a Telegram provider request',async()=>{
 const id=crypto.randomUUID(),clock=Date.now,previous=state.env.BUCKET,before=sends.length;
 state.env.BUCKET={async get(){Date.now=()=>clock()+90000;return {body:new Uint8Array([1,2,3]),httpMetadata:{contentType:'image/jpeg'}};}};
 try{assert.equal(await outbox.queueTelegram({id,destination:'-100111',payload:{text:'Slow private read',photos:[{key:'slow',mime:'image/jpeg'}]}}),'failed');assert.equal(sends.length,before);}
 finally{Date.now=clock;if(previous)state.env.BUCKET=previous;else delete state.env.BUCKET;}
});

test('recipient authorization is checked again after private photo rendering',async()=>{
 const {ref}=await booking(),id=crypto.randomUUID(),previous=state.env.BUCKET,before=sends.length;
 state.env.BUCKET={async get(){await db.prepare("UPDATE bookings SET status='cancelled' WHERE reference=?").bind(ref).run();return {body:new Uint8Array([1,2,3]),httpMetadata:{contentType:'image/jpeg'}};}};
 try{assert.equal(await outbox.queueTelegram({id,reference:ref,destination:'-100111',payload:{text:'Revoked trip',activeBooking:true,photos:[{key:'revoked',mime:'image/jpeg'}]}}),'cancelled');assert.equal(sends.length,before);}
 finally{if(previous)state.env.BUCKET=previous;else delete state.env.BUCKET;}
});

async function assignmentNotice(){
 const {ref,driver}=await booking(),result=await service.assignDriver({reference:ref,leg:'outbound',driverId:driver,by:'snapshot-test'});
 assert.ok(result.ok);const job=await db.prepare("SELECT * FROM booking_notifications WHERE assignment_id=? AND channel='telegram'").bind(result.assignment.id).first();
 return {ref,driver,assignmentId:result.assignment.id,job};
}
async function providerStarted(){const deadline=Date.now()+10000;while(!deferredReply&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(deferredReply,'provider request started');}

test('assignment retries reuse the frozen message after booking and driver details change',async()=>{
 const {ref,driver,assignmentId,job}=await assignmentNotice();mode='reject';
 try{assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'failed');}finally{mode='ok';}
 const original=sends.at(-1).body;
 await db.prepare("UPDATE bookings SET pickup='Changed private pickup' WHERE reference=?").bind(ref).run();
 await db.prepare("UPDATE drivers SET full_name='Changed driver' WHERE id=?").bind(driver).run();
 await db.prepare("UPDATE booking_notifications SET scheduled_for='2020-01-01' WHERE id=?").bind(job.id).run();
 assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'sent');
 assert.deepEqual(sends.at(-1).body,original);
 const saved=await db.prepare('SELECT * FROM telegram_assignment_payloads WHERE id=?').bind(job.id).first();assert.ok(saved.provider_message_id>0);
 assert.equal((await db.prepare('SELECT attempt_count FROM booking_notifications WHERE id=?').bind(job.id).first()).attempt_count,2);
});

test('assignment budgets and legacy snapshot review apply even while the bot is disconnected',async()=>{
 const token=state.env.TELEGRAM_BOT_TOKEN;delete state.env.TELEGRAM_BOT_TOKEN;
 try{
  for(const [setup,expected] of [["attempt_count=12",'dead_letter'],["created_at='2000-01-01'",'dead_letter'],["attempt_count=1,status='failed'",'uncertain']]){
   const {assignmentId,job}=await assignmentNotice(),before=sends.length;
   await db.prepare(`UPDATE booking_notifications SET ${setup} WHERE id=?`).bind(job.id).run();
   assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),expected);assert.equal(sends.length,before);
  }
 }finally{state.env.TELEGRAM_BOT_TOKEN=token;}
});

test('assignment rate holds persist and a late acknowledgment cannot replace a newer outcome',async()=>{
 const {assignmentId,job}=await assignmentNotice(),before=Date.now();mode='rate';
 try{assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'failed');}finally{mode='ok';}
 let saved=await db.prepare('SELECT * FROM booking_notifications WHERE id=?').bind(job.id).first();assert.ok(Date.parse(saved.scheduled_for)>=before+3600000);
 const count=sends.length;await delivery.deliverAssignmentTelegram(assignmentId);assert.equal(sends.length,count);
 await db.prepare("UPDATE booking_notifications SET scheduled_for='2020-01-01' WHERE id=?").bind(job.id).run();
 mode='defer';deferredReply=null;const running=delivery.deliverAssignmentTelegram(assignmentId);
 try{
  await providerStarted();await db.prepare("UPDATE booking_notifications SET status='uncertain',last_attempt_at='2099-01-01',error_message='New owner result' WHERE id=?").bind(job.id).run();
  mode='ok';deferredReply(Response.json({ok:true,result:{message_id:787878,chat:{id:-100111}}}));await running;
  saved=await db.prepare('SELECT * FROM booking_notifications WHERE id=?').bind(job.id).first();assert.equal(saved.status,'uncertain');assert.equal(saved.error_message,'New owner result');
  assert.equal((await db.prepare('SELECT provider_message_id FROM telegram_assignment_payloads WHERE id=?').bind(job.id).first()).provider_message_id,null);
 }finally{mode='ok';if(deferredReply)deferredReply(Response.json({ok:true,result:{message_id:787878}}));await running;}
});

test('chat retries preserve the rendered message, and enforce the saved delay on direct calls',async()=>{
 const id=await conversation(),c=await chat.conversationById(id);mode='reject';let saved;
 try{saved=await chat.addVisitorMessage(c,'Original chat notification',crypto.randomUUID());}finally{mode='ok';}
 const original=sends.at(-1).body,count=sends.length;
 await db.prepare("UPDATE website_conversations SET customer_name='Changed private name' WHERE id=?").bind(id).run();
 await db.prepare("UPDATE website_chat_messages SET body='Changed stored body' WHERE id=?").bind(saved.id).run();
 await chat.deliverVisitorMessage(id,saved.id);assert.equal(sends.length,count);
 await db.prepare("UPDATE telegram_chat_payloads SET next_attempt_at='2020-01-01' WHERE id=?").bind(saved.id).run();
 await chat.deliverVisitorMessage(id,saved.id);assert.deepEqual(sends.filter(s=>s.method==='sendMessage').at(-1).body,original);
 assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(saved.id).first()).telegram_status,'sent');
});

test('chat budgets and legacy review remain effective without current Telegram credentials',async()=>{
 const token=state.env.TELEGRAM_BOT_TOKEN;delete state.env.TELEGRAM_BOT_TOKEN;
 try{
  for(const [attempts,days,expected] of [[12,0,'dead_letter'],[0,8,'dead_letter'],[1,0,'uncertain']]){
   const id=await conversation(),mid=crypto.randomUUID(),at=new Date(Date.now()-days*86400000).toISOString();
   await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,telegram_status) VALUES(?,?,'visitor','Queued question',?,'pending')").bind(mid,id,at).run();
   if(attempts)await db.prepare('INSERT INTO telegram_chat_delivery_attempts(message_id,claim_id,attempted_at,attempts) VALUES(?,?,?,?)').bind(mid,'legacy',at,attempts).run();
   const before=sends.length;await chat.deliverVisitorMessage(id,mid);assert.equal(sends.length,before);
   assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(mid).first()).telegram_status,expected);
  }
 }finally{state.env.TELEGRAM_BOT_TOKEN=token;}
});

test('a chat DM rate limit does not fall back to the group or discard the provider hold',async()=>{
 const telegram='776655';await db.prepare('INSERT INTO telegram_admins(id,telegram_user_id,display_name,enabled,created_at,updated_at) VALUES(?,?,?,1,?,?)').bind('rate-member',telegram,'Rate owner',at,at).run();
 const id=await conversation({name:'Rate owner',telegram}),before=sends.length,clock=Date.now();mode='rate';let saved;
 try{saved=await chat.addVisitorMessage(await chat.conversationById(id),'Rate-limited private chat',crypto.randomUUID());}finally{mode='ok';}
 assert.equal(sends.length,before+1);assert.equal(sends.at(-1).body.chat_id,telegram);
 const snapshot=await db.prepare('SELECT next_attempt_at,last_error FROM telegram_chat_payloads WHERE id=?').bind(saved.id).first();assert.ok(Date.parse(snapshot.next_attempt_at)>=clock+3600000);assert.equal(snapshot.last_error,'Telegram: rate limited');
 const count=sends.length;await chat.deliverVisitorMessage(id,saved.id);assert.equal(sends.length,count);
});

test('concurrent first chat messages create one root card and then notify as replies',async()=>{
 const id=await conversation();await db.prepare('UPDATE website_conversations SET telegram_message_id=NULL WHERE id=?').bind(id).run();
 const c=await chat.conversationById(id),before=sends.length;mode='defer';deferredReply=null;
 const first=chat.addVisitorMessage(c,'First concurrent question',crypto.randomUUID());
 try{
  await providerStarted();const second=await chat.addVisitorMessage(c,'Second concurrent question',crypto.randomUUID());
  assert.equal(sends.length,before+1);assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(second.id).first()).telegram_status,'pending');
  mode='ok';deferredReply(Response.json({ok:true,result:{message_id:765432,chat:{id:-100111}}}));await first;
  await chat.deliverVisitorMessage(id,second.id);
  const messages=sends.slice(before).filter(s=>s.method==='sendMessage');assert.equal(messages.length,2);assert.equal(messages[1].body.reply_parameters.message_id,765432);
  assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(second.id).first()).telegram_status,'sent');
 }finally{mode='ok';if(deferredReply)deferredReply(Response.json({ok:true,result:{message_id:765432}}));await first;}
});

test('a stale chat acknowledgment cannot change message status, root card or route mappings',async()=>{
 const id=await conversation();await db.prepare('UPDATE website_conversations SET telegram_message_id=NULL WHERE id=?').bind(id).run();mode='defer';deferredReply=null;
 const running=chat.addVisitorMessage(await chat.conversationById(id),'Uncertain root',crypto.randomUUID());
 try{
  await providerStarted();const m=await db.prepare('SELECT id FROM website_chat_messages WHERE conversation_id=?').bind(id).first();
  await db.batch([db.prepare("UPDATE website_chat_messages SET telegram_status='uncertain' WHERE id=?").bind(m.id),db.prepare("UPDATE telegram_chat_delivery_attempts SET claim_id='new-owner' WHERE message_id=?").bind(m.id)]);
  mode='ok';deferredReply(Response.json({ok:true,result:{message_id:654321,chat:{id:-100111}}}));await running;
  assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(m.id).first()).telegram_status,'uncertain');
  assert.equal((await chat.conversationById(id)).telegram_message_id,null);
  assert.equal(await db.prepare('SELECT * FROM telegram_message_routes WHERE message_id=654321').first(),null);
  assert.equal((await db.prepare('SELECT provider_message_id FROM telegram_chat_payloads WHERE id=?').bind(m.id).first()).provider_message_id,null);
 }finally{mode='ok';if(deferredReply)deferredReply(Response.json({ok:true,result:{message_id:654321}}));await running;}
});

test('chat snapshot integrity and revoked assignee routing fail closed before sending',async()=>{
 for(const corrupt of [true,false]){
  const id=await conversation();mode='reject';let saved;
  try{saved=await chat.addVisitorMessage(await chat.conversationById(id),'Private review question',crypto.randomUUID());}finally{mode='ok';}
  await db.prepare("UPDATE telegram_chat_payloads SET next_attempt_at='2020-01-01' WHERE id=?").bind(saved.id).run();
  if(corrupt)await db.prepare("UPDATE telegram_chat_payloads SET payload_json='{}' WHERE id=?").bind(saved.id).run();
  else await db.prepare("UPDATE website_conversations SET assigned_name='New owner',assigned_telegram_user_id='999888' WHERE id=?").bind(id).run();
  const before=sends.length;await chat.deliverVisitorMessage(id,saved.id);assert.equal(sends.length,before);
  assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(saved.id).first()).telegram_status,'uncertain');
 }
});

test('private notification snapshots are purged on schedule and cascade with deleted chat messages',async()=>{
 const store=await mod('/lib/telegram/message-store.ts'),id=await conversation(),saved=await chat.addVisitorMessage(await chat.conversationById(id),'Retention question',crypto.randomUUID());
 await db.prepare("UPDATE telegram_chat_delivery_attempts SET attempted_at=? WHERE message_id=?").bind(new Date(Date.now()-8*86400000).toISOString(),saved.id).run();
 await store.purgeTelegramMessages(db,'chat');
 const snapshot=await db.prepare('SELECT * FROM telegram_chat_payloads WHERE id=?').bind(saved.id).first();assert.equal(snapshot.payload_json,null);assert.match(snapshot.content_hash,/^[a-f0-9]{64}$/);assert.ok(snapshot.provider_message_id>0);
 await db.prepare('DELETE FROM website_chat_messages WHERE id=?').bind(saved.id).run();assert.equal(await db.prepare('SELECT id FROM telegram_chat_payloads WHERE id=?').bind(saved.id).first(),null);
});

test('a failed private snapshot write prevents any provider send',async()=>{
 const {assignmentId,job}=await assignmentNotice();
 await db.prepare("CREATE TRIGGER fail_assignment_snapshot BEFORE INSERT ON telegram_assignment_payloads BEGIN SELECT RAISE(ABORT,'test storage failure'); END").run();
 const before=sends.length;
 try{assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'uncertain');assert.equal(sends.length,before);}
 finally{await db.prepare('DROP TRIGGER fail_assignment_snapshot').run();}
 assert.equal((await db.prepare('SELECT status FROM booking_notifications WHERE id=?').bind(job.id).first()).status,'uncertain');
 const id=await conversation();await db.prepare("CREATE TRIGGER fail_chat_snapshot BEFORE INSERT ON telegram_chat_payloads BEGIN SELECT RAISE(ABORT,'test storage failure'); END").run();
 try{const count=sends.length,saved=await chat.addVisitorMessage(await chat.conversationById(id),'No send without snapshot',crypto.randomUUID());assert.equal(sends.length,count);assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(saved.id).first()).telegram_status,'uncertain');}
 finally{await db.prepare('DROP TRIGGER fail_chat_snapshot').run();}
});

test('snapshot runtime bootstrap recreates the additive tables without changing parent notifications',async()=>{
 const store=await mod('/lib/telegram/message-store.ts'),before=await db.prepare('SELECT COUNT(*) n FROM booking_notifications').first();
 await db.batch(['DROP TABLE telegram_chat_card_claims','DROP TABLE telegram_chat_payloads','DROP TABLE telegram_assignment_payloads'].map(sql=>db.prepare(sql)));
 await Promise.all([store.ensureTelegramMessages(db,'chat'),store.ensureTelegramMessages(db,'assignment')]);
 await Promise.all([store.ensureTelegramMessages(db,'chat'),store.ensureTelegramMessages(db,'assignment')]);
 for(const name of ['telegram_chat_card_claims','telegram_chat_payloads','telegram_assignment_payloads'])assert.equal((await db.prepare(`SELECT COUNT(*) n FROM ${name}`).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM booking_notifications').first()).n,before.n);
});

test('a conversation awaiting root-card review does not starve other conversations in recovery',async()=>{
 const blocked=await conversation(),healthy=await conversation(),owner=crypto.randomUUID(),pending=crypto.randomUUID(),next=crypto.randomUUID(),old=new Date(Date.now()-120000).toISOString();
 await db.prepare('UPDATE website_conversations SET telegram_message_id=NULL WHERE id=?').bind(blocked).run();
 for(const [id,c,status,text] of [[owner,blocked,'uncertain','Original root outcome'],[pending,blocked,'pending','Blocked pending question'],[next,healthy,'pending','Healthy recovery question']])await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,telegram_status) VALUES(?,?,'visitor',?,?,?)").bind(id,c,text,old,status).run();
 await db.prepare('INSERT INTO telegram_chat_card_claims(conversation_id,message_id,claim_id,attempted_at) VALUES(?,?,?,?)').bind(blocked,owner,'unknown-root',old).run();
 await chat.retryFailedTelegram(1);
 assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(next).first()).telegram_status,'sent');
 assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(pending).first()).telegram_status,'pending');
 assert.equal((await chat.conversationById(blocked)).telegram_message_id,null);
});

test('a frozen assignment notice cannot resend an older booking version',async()=>{
 const {ref,assignmentId,job}=await assignmentNotice();mode='reject';
 try{assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'failed');}finally{mode='ok';}
 await db.prepare('UPDATE bookings SET booking_version=booking_version+1 WHERE reference=?').bind(ref).run();
 await db.prepare("UPDATE booking_notifications SET scheduled_for='2020-01-01' WHERE id=?").bind(job.id).run();
 const before=sends.length;assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'uncertain');assert.equal(sends.length,before);
});

test('the twelfth rejected assignment or chat attempt stops instead of scheduling a thirteenth',async()=>{
 const {assignmentId,job}=await assignmentNotice();mode='reject';let id,saved;
 try{
  assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'failed');
  await db.prepare("UPDATE booking_notifications SET attempt_count=11,scheduled_for='2020-01-01' WHERE id=?").bind(job.id).run();
  assert.equal(await delivery.deliverAssignmentTelegram(assignmentId),'dead_letter');
  assert.equal((await db.prepare('SELECT attempt_count FROM booking_notifications WHERE id=?').bind(job.id).first()).attempt_count,12);
  id=await conversation();saved=await chat.addVisitorMessage(await chat.conversationById(id),'Twelfth chat attempt',crypto.randomUUID());
  await db.prepare('UPDATE telegram_chat_delivery_attempts SET attempts=11 WHERE message_id=?').bind(saved.id).run();
  await db.prepare("UPDATE telegram_chat_payloads SET next_attempt_at='2020-01-01' WHERE id=?").bind(saved.id).run();
  await chat.deliverVisitorMessage(id,saved.id);
  assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(saved.id).first()).telegram_status,'dead_letter');
  assert.equal((await db.prepare('SELECT attempts FROM telegram_chat_delivery_attempts WHERE message_id=?').bind(saved.id).first()).attempts,12);
 }finally{mode='ok';}
 const before=sends.length;await delivery.deliverAssignmentTelegram(assignmentId);await chat.deliverVisitorMessage(id,saved.id);assert.equal(sends.length,before);
});

test('blocked-bot diagnostics preserve the known reason without provider text or secrets',async()=>{
 const client=await mod('/lib/telegram/client.ts');mode='blocked_private';
 try{await assert.rejects(()=>client.sendTo('-100111','Private request'),error=>error.message==='Telegram: bot blocked'&&error.retryable===true);}
 finally{mode='ok';}
});

test('losing the chat lease during destination persistence prevents the provider request',async()=>{
 const id=await conversation(),message=crypto.randomUUID();await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,telegram_status) VALUES(?,?,'visitor','Lease changed before POST',?,'pending')").bind(message,id,at).run();
 await db.prepare(`CREATE TRIGGER change_chat_owner AFTER UPDATE OF destination ON telegram_chat_delivery_attempts WHEN NEW.message_id='${message}' BEGIN UPDATE website_chat_messages SET telegram_status='uncertain' WHERE id=NEW.message_id; END`).run();
 const before=sends.length;
 try{await chat.deliverVisitorMessage(id,message);assert.equal(sends.length,before);assert.equal((await db.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(message).first()).telegram_status,'uncertain');}
 finally{await db.prepare('DROP TRIGGER change_chat_owner').run();}
});
