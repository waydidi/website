import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
const state=globalThis.__telegramDelivery={env:{DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100'},user:{id:'owner',email:'test@example.invalid',role:'owner',displayName:'Test'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'delivery-boundaries',enforce:'pre',resolveId(id){
 if(id==='cloudflare:workers')return '\0delivery-env';
 if(id.endsWith('/lib/admin'))return '\0delivery-admin';
 if(id.endsWith('/lib/email'))return '\0delivery-email';
 if(id.endsWith('/lib/trip-driver'))return '\0delivery-plan';
},load(id){
 if(id==='\0delivery-env')return 'export const env=globalThis.__telegramDelivery.env';
 if(id==='\0delivery-admin')return 'export async function getWaydidiAdmin(){return globalThis.__telegramDelivery.user}';
 if(id==='\0delivery-email')return 'export async function sendDriverAssignmentEmail(){return {status:"sent"}}';
 if(id==='\0delivery-plan')return 'export async function sendDriverPlanToLine(){return false}';
}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sends=[];let mode='ok';
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 if(mode==='timeout')throw new Error('network timeout test-token');
 if(mode==='denied')return Response.json({ok:false,description:'Forbidden: bot blocked'},{status:403});
 const body=JSON.parse(init.body);sends.push(body);
 return Response.json({ok:true,result:{message_id:sends.length,chat:{id:-100}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__telegramDelivery;});
const {getDb}=await vite.ssrLoadModule('/db/index.ts'),db=getDb();
const schema=await vite.ssrLoadModule('/db/schema.ts');
const delivery=await vite.ssrLoadModule('/lib/telegram/assignments.ts');
const operations=await vite.ssrLoadModule('/app/api/admin/operations/route.ts');
const calendar=await vite.ssrLoadModule('/app/api/admin/calendar/route.ts');
const settings=await vite.ssrLoadModule('/app/api/admin/chat/telegram/route.ts');
const chat=await vite.ssrLoadModule('/lib/website-chat.ts');
let n=0;
async function seed() {
 const reference='TG'+(++n),driverId=crypto.randomUUID(),now=new Date().toISOString();
 await db.insert(schema.bookings).values({reference,customerName:'Test',customerEmail:'test@example.invalid',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:'2026-11-01',pickupTime:'09:00',returnPickup:'Return hotel',returnDropoff:'Return airport',returnDate:'2026-11-02',returnTime:'10:00',passengers:2,luggage:1,vehicle:'economy_sedan',paymentMethod:'cash',total:1000,status:'confirmed',accessTokenHash:'test',createdAt:now,updatedAt:now});
 await db.insert(schema.drivers).values({id:driverId,fullName:'Driver & Test',phone:'000',status:'active',createdAt:now,updatedAt:now});
 return {reference,driverId};
}
const request=body=>new Request('https://example.invalid/api/admin/operations',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(body)});
async function assign(route=operations,leg='outbound') {
 const b=await seed();const response=await route.POST(request({action:route===calendar?'assign_driver':'assign',bookingReference:b.reference,driverId:b.driverId,leg}));
 assert.equal(response.status,200);return {...await response.json(),...b};
}
test('Operations and Calendar assignments send actual driver links, including independent return details',async()=>{
 for(const [route,leg] of [[operations,'outbound'],[calendar,'return']]) {
  const result=await assign(route,leg),sent=sends.at(-1);
  assert.equal(result.telegramNotification,'sent');assert.ok(sent.text.includes(new URL(result.driverUrl).pathname));
  assert.equal(new URL(sent.reply_markup.inline_keyboard[0][0].url).pathname,new URL(result.driverUrl).pathname);
  assert.match(sent.text,/Driver &amp; Test/);
  if(leg==='return'){assert.match(sent.text,/Return hotel/);assert.match(sent.text,/2026-11-02 10:00/);}
  assert.equal((await d1.prepare("SELECT status FROM booking_notifications WHERE assignment_id=? AND channel='telegram'").bind(result.assignment.id).first()).status,'sent');
  const count=sends.length;await Promise.all([delivery.deliverAssignmentTelegram(result.assignment.id),delivery.deliverAssignmentTelegram(result.assignment.id)]);assert.equal(sends.length,count);
 }
});
test('missing configuration queues assignment and reconnect recovers it once under concurrent retries',async()=>{
 delete state.env.TELEGRAM_BOT_TOKEN;const result=await assign();assert.equal(result.telegramNotification,'queued');
 state.env.TELEGRAM_BOT_TOKEN='test-token';const count=sends.length;
 await d1.prepare("INSERT INTO journey_legs(id,booking_reference,leg,status,created_at,updated_at) VALUES(?,?,'outbound','pending_payment',?,?)").bind(`${result.reference}:outbound`,result.reference,new Date().toISOString(),new Date().toISOString()).run();
 await Promise.all([delivery.deliverAssignmentTelegram(result.assignment.id),delivery.deliverAssignmentTelegram(result.assignment.id)]);
 assert.equal(sends.length,count+1);
});
test('definite Telegram rejection retries; uncertain outcome never blindly duplicates',async()=>{
 mode='denied';const rejected=await assign();assert.equal(rejected.telegramNotification,'failed');
 await d1.prepare("UPDATE booking_notifications SET scheduled_for='2020-01-01' WHERE assignment_id=?").bind(rejected.assignment.id).run();
 mode='ok';await delivery.retryAssignmentTelegram();assert.equal((await d1.prepare("SELECT status FROM booking_notifications WHERE assignment_id=?").bind(rejected.assignment.id).first()).status,'sent');
 mode='timeout';const uncertain=await assign();assert.equal(uncertain.telegramNotification,'uncertain');
 mode='ok';const count=sends.length;await delivery.retryAssignmentTelegram();assert.equal(sends.length,count);
});
test('revoked assignment and rotated token cannot send obsolete driver links',async()=>{
 delete state.env.TELEGRAM_BOT_TOKEN;const result=await assign();
 await d1.prepare("UPDATE booking_links SET driver_token='different' WHERE booking_reference=?").bind(result.reference).run();
 state.env.TELEGRAM_BOT_TOKEN='test-token';const count=sends.length;assert.equal(await delivery.deliverAssignmentTelegram(result.assignment.id),'cancelled');assert.equal(sends.length,count);
});
test('diagnostics expose queue problems and allow outbound testing without a webhook secret',async()=>{
 const result=await (await settings.GET()).json();assert.equal(result.outboundReady,true);assert.equal(result.secrets.TELEGRAM_WEBHOOK_SECRET,false);assert.ok(result.delivery.assignments.some(r=>r.status==='uncertain'));
 assert.equal((await settings.POST(request({action:'test'}))).status,200);
 mode='denied';const error=await (await settings.GET()).json();assert.match(error.connectionError,/bot blocked/);mode='ok';
});
test('website notification survives missing configuration and duplicate client retry without duplicate sends',async()=>{
 const now=new Date().toISOString(),id=crypto.randomUUID();
 await d1.prepare("INSERT INTO website_conversations(id,public_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(id,'WD-test',id,new Date(Date.now()+86400000).toISOString(),now,now).run();
 const c=await chat.conversationById(id);
 delete state.env.TELEGRAM_BOT_TOKEN;
 const first=await chat.addVisitorMessage(c,'Customer needs pickup','retry-client');
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(first.id).first()).telegram_status,'pending');
 state.env.TELEGRAM_BOT_TOKEN='test-token';const count=sends.length;
 await Promise.all([chat.addVisitorMessage(c,'Customer needs pickup','retry-client'),chat.deliverVisitorMessage(id,first.id)]);
 assert.equal(sends.length,count+1);
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(first.id).first()).telegram_status,'sent');
 assert.equal((await d1.prepare('SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id=?').bind(id).first()).n,1);
});
test('website timeout stays visible as uncertain and is excluded from automatic retries',async()=>{
 const now=new Date().toISOString(),id=crypto.randomUUID();
 await d1.prepare("INSERT INTO website_conversations(id,public_id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(id,'WD-timeout',id,new Date(Date.now()+86400000).toISOString(),now,now).run();
 mode='timeout';const saved=await chat.addVisitorMessage(await chat.conversationById(id),'Please help','timeout-client');mode='ok';
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(saved.id).first()).telegram_status,'uncertain');
 const count=sends.length;await chat.retryFailedTelegram();assert.equal(sends.length,count);
});
async function botConversation(channel='web') {
 const now=new Date().toISOString(),id=crypto.randomUUID();
 await d1.prepare("INSERT INTO website_conversations(id,public_id,token_hash,expires_at,created_at,updated_at,telegram_message_id,channel) VALUES(?,?,?,?,?,?,1234,?)").bind(id,`WD-bot-${id}`,id,new Date(Date.now()+86400000).toISOString(),now,now,channel).run();
 return id;
}
test('website bot answer posts once under the conversation, clearly labelled and escaped',async()=>{
 const id=await botConversation(),count=sends.length;
 const message=await chat.addBotMessage(id,'The fare is < 1,000 & includes tolls',{type:'summary',text:'Trip quote'});
 const sent=sends.find((s,i)=>i>=count&&s.text?.includes('Non (AI)'));
 assert.ok(sent);assert.equal(sent.chat_id,'-100');assert.equal(sent.reply_parameters.message_id,1234);
 assert.match(sent.text,/fare is &lt; 1,000 &amp;/);
 await Promise.all([chat.deliverBotMessage(id,message),chat.deliverBotMessage(id,message),chat.deliverVisitorMessage(id,message)]);
 assert.equal(sends.filter((s,i)=>i>=count&&s.text?.includes('Non (AI)')).length,1);
 const row=await d1.prepare('SELECT is_bot,sender_name,telegram_status,card_json FROM website_chat_messages WHERE id=?').bind(message).first();
 assert.equal(row.is_bot,1);assert.equal(row.sender_name,'Non');assert.equal(row.telegram_status,'sent');assert.equal(JSON.parse(row.card_json).type,'summary');
 assert.equal((await chat.conversationById(id)).assigned_name,null);
});
test('website bot reply queues while disconnected and cron recovers it once',async()=>{
 const id=await botConversation();delete state.env.TELEGRAM_BOT_TOKEN;
 const message=await chat.addBotMessage(id,'Bot answer after reconnect');
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(message).first()).telegram_status,'pending');
 await d1.prepare("UPDATE website_chat_messages SET created_at='2026-01-01T00:00:00Z' WHERE id=?").bind(message).run();
 state.env.TELEGRAM_BOT_TOKEN='test-token';const count=sends.length;
 await Promise.all([chat.retryFailedTelegram(),chat.deliverBotMessage(id,message)]);
 assert.equal(sends.filter((s,i)=>i>=count&&s.reply_parameters?.message_id===1234&&s.text?.includes('Bot answer after reconnect')).length,1);
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(message).first()).telegram_status,'sent');
});
test('bot notification rejection retries but a timeout remains uncertain',async()=>{
 const id=await botConversation();mode='denied';const rejected=await chat.addBotMessage(id,'Retry this bot reply');mode='ok';
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(rejected).first()).telegram_status,'failed');
 await chat.deliverBotMessage(id,rejected);
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(rejected).first()).telegram_status,'sent');
 mode='timeout';const uncertain=await chat.addBotMessage(id,'Uncertain bot reply');mode='ok';
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(uncertain).first()).telegram_status,'uncertain');
 const count=sends.length;await chat.deliverBotMessage(id,uncertain);assert.equal(sends.length,count);
});
test('other-channel bot replies are not mirrored to Telegram',async()=>{
 const id=await botConversation('line'),count=sends.length;
 const message=await chat.addBotMessage(id,'External channel reply');
 await chat.deliverBotMessage(id,message);assert.equal(sends.length,count);
 assert.equal((await d1.prepare('SELECT telegram_status FROM website_chat_messages WHERE id=?').bind(message).first()).telegram_status,'skipped');
});
