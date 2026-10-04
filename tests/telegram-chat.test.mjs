import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
await db.exec('CREATE TABLE staff_accounts(id TEXT PRIMARY KEY,display_name TEXT,username TEXT,role TEXT,active INTEGER);');
await db.exec('CREATE TABLE security_rate_windows(fingerprint TEXT,window INTEGER,attempts INTEGER,PRIMARY KEY(fingerprint,window));');
for(const sql of (await readFile(root+'/drizzle/0061_website_chat.sql','utf8')).split('--> statement-breakpoint'))await db.prepare(sql).run();
await db.prepare("INSERT INTO staff_accounts VALUES('alice','Alice','alice','support',1),('bob','Bob','bob','operations',1),('finance','Finance','finance','finance',1)").run();
const secret='s'.repeat(48);
globalThis.__telegramTest={env:{DB:db,TELEGRAM_BOT_TOKEN:'123:test-token',TELEGRAM_CHAT_ID:'-100123',TELEGRAM_WEBHOOK_SECRET:secret},user:{id:'owner',role:'owner'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'telegram-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0telegram-env';if(id==='@/lib/admin'||id===root+'/lib/admin')return '\0telegram-admin';},load(id){if(id==='\0telegram-env')return 'export const env=globalThis.__telegramTest.env';if(id==='\0telegram-admin')return 'export async function getWaydidiAdmin(){return globalThis.__telegramTest.user}';}}],server:{middlewareMode:true}});
const originalFetch=globalThis.fetch;let calls=[],fail=false,nextId=500;
globalThis.fetch=async(url,options)=>{assert.match(url,/^https:\/\/api.telegram.org\/bot123:test-token\//);calls.push({url,body:JSON.parse(options.body)});return Response.json(fail?{ok:false}:{ok:true,result:{message_id:nextId++}},{status:fail?503:200});};
after(async()=>{globalThis.fetch=originalFetch;await vite.close();await mf.dispose();delete globalThis.__telegramTest;});
const bridge=await vite.ssrLoadModule('/lib/telegram-chat.ts'),customer=await vite.ssrLoadModule('/app/api/chat/route.ts'),webhook=await vite.ssrLoadModule('/app/api/webhooks/telegram/route.ts'),settings=await vite.ssrLoadModule('/app/api/admin/telegram-chat/route.ts');
const adminPost=(body)=>settings.POST(new Request('https://example.invalid/api/admin/telegram-chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(body)}));
const update=(id,from=101,reply=500,chat=-100123)=>({update_id:id,message:{message_id:900+id,chat:{id:chat},from:{id:from,is_bot:false},text:'Hello from Telegram',reply_to_message:{message_id:reply}}});
const receive=(data,token=secret)=>webhook.POST(new Request('https://example.invalid/api/webhooks/telegram',{method:'POST',headers:{'x-telegram-bot-api-secret-token':token},body:JSON.stringify(data)}));
let cookie,conversation;
test('owner links allowed staff; settings never expose secrets or allow other roles',async()=>{
 assert.equal((await adminPost({action:'link',telegramId:'101',staffId:'alice'})).status,200);
 assert.equal((await adminPost({action:'link',telegramId:'102',staffId:'bob'})).status,200);
 assert.equal((await adminPost({action:'link',telegramId:'103',staffId:'finance'})).status,400);
 const body=JSON.stringify(await (await settings.GET()).json());assert.ok(!body.includes(secret));assert.ok(!body.includes('test-token'));
 globalThis.__telegramTest.user={id:'alice',role:'support'};assert.equal((await settings.GET()).status,403);assert.equal((await adminPost({action:'register'})).status,403);globalThis.__telegramTest.user={id:'owner',role:'owner'};
});
test('website message queues atomically and reaches Telegram once despite simultaneous flushes',async()=>{
 const result=await customer.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','cf-connecting-ip':'telegram-test'},body:JSON.stringify({message:'Airport pickup question'})}));assert.equal(result.status,200);cookie=result.headers.get('set-cookie').split(';')[0];
 const row=await db.prepare('SELECT * FROM website_telegram_deliveries').first();conversation=row.conversation_id;assert.equal(row.status,'pending');
 await Promise.all([bridge.flushTelegramChatDelivery(),bridge.flushTelegramChatDelivery()]);assert.equal(calls.length,1);assert.match(calls[0].body.text,/Airport pickup question/);assert.equal(calls[0].body.chat_id,'-100123');assert.equal((await db.prepare('SELECT * FROM website_telegram_deliveries').first()).telegram_message_id,500);
});
test('webhook secret, configured chat and linked Telegram identity protect website replies',async()=>{
 assert.equal((await receive(update(1),'wrong')).status,401);
 for(const data of [update(2,999),update(3,101,500,-999)])assert.equal((await (await receive(data)).json()).ok,true);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE sender='staff'").first()).n,0);
});
test('Telegram reply assigns the admin name, appears in website chat and is idempotent',async()=>{
 const result=await (await receive(update(4))).json();assert.match(result.text,/delivered/);
 const history=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie}}))).json();assert.equal(history.assignment.staff_name,'Alice');assert.ok(history.messages.some(m=>m.body==='Hello from Telegram'&&m.staff_name==='Alice'));
 assert.equal((await (await receive(update(4))).json()).ok,true);assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE sender='staff'").first()).n,1);
 const isolated=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:'waydidi_chat='+ 'c'.repeat(48)}}))).json();assert.equal(isolated.messages.length,0);
});
test('another assigned admin, disabled staff and expired chats cannot reply',async()=>{
 assert.match((await (await receive(update(5,102))).json()).text,/assigned to another admin/);
 await db.prepare("UPDATE staff_accounts SET active=0 WHERE id='alice'").run();assert.equal((await (await receive(update(6))).json()).ok,true);await db.prepare("UPDATE staff_accounts SET active=1 WHERE id='alice'").run();
 await db.prepare('UPDATE website_conversations SET expires_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',conversation).run();assert.match((await (await receive(update(7))).json()).text,/expired/);assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE sender='staff'").first()).n,1);
});
test('provider failure preserves customer messages and retry succeeds',async()=>{
 fail=true;const result=await customer.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','cf-connecting-ip':'telegram-retry'},body:JSON.stringify({message:'Retry notification'})}));assert.equal(result.status,200);
 await bridge.flushTelegramChatDelivery();const pending=await db.prepare("SELECT * FROM website_telegram_deliveries WHERE status='pending'").first();assert.equal(pending.attempts,1);assert.equal(pending.lease_until,null);assert.ok(await db.prepare('SELECT id FROM website_chat_messages WHERE id=?').bind(pending.website_message_id).first());
 fail=false;await db.prepare('UPDATE website_telegram_deliveries SET retry_at=? WHERE website_message_id=?').bind('2020-01-01T00:00:00.000Z',pending.website_message_id).run();await bridge.flushTelegramChatDelivery();assert.equal((await db.prepare('SELECT status FROM website_telegram_deliveries WHERE website_message_id=?').bind(pending.website_message_id).first()).status,'sent');
});
test('owner webhook registration uses the canonical URL and secret header configuration',async()=>{
 assert.equal((await adminPost({action:'register'})).status,200);const call=calls.at(-1);assert.match(call.url,/setWebhook$/);assert.equal(call.body.url,'https://waydidi-website.contact-waydidi.workers.dev/api/webhooks/telegram');assert.equal(call.body.secret_token,secret);assert.deepEqual(call.body.allowed_updates,['message']);
});
