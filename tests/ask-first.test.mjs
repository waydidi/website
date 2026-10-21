import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
// Non (chat quote bot): the tool loop with a scripted model, and the rules for when Non speaks.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
await db.exec("CREATE TABLE attractions(id TEXT PRIMARY KEY,name TEXT,customer_name TEXT,area TEXT DEFAULT '',category TEXT DEFAULT 'sight',tags_json TEXT DEFAULT '[]',open_time TEXT,close_time TEXT,closed_days_json TEXT DEFAULT '[]',exceptions_json TEXT DEFAULT '[]',duration_min INTEGER DEFAULT 60,dress_code TEXT,description TEXT,status TEXT DEFAULT 'active');");
await db.exec("CREATE TABLE drivers(id TEXT PRIMARY KEY,full_name TEXT,phone TEXT);");
await db.exec('CREATE TABLE staff_accounts(id TEXT PRIMARY KEY,display_name TEXT,active INTEGER,role TEXT);');
await db.prepare("INSERT INTO staff_accounts VALUES('anna','Anna',1,'support')").run();
for(const file of ['0061_website_chat.sql','0069_chat_telegram.sql','0070_support_reviews.sql','0071_chat_country.sql','0072_cee_bot.sql','0073_cee_knowledge_channels.sql','0074_non_scaling.sql','0075_chat_read_receipts.sql','0076_chat_idle.sql','0077_telegram_prompt_user.sql','0078_telegram_dm.sql','0079_chat_payment_links.sql','0080_chat_cards.sql','0081_telegram_booking_tasks.sql','0082_telegram_request_cards.sql','0084_chat_alerts_limits.sql','0085_booking_links.sql','0086_flight_status.sql','0087_flight_stats.sql','0088_flight_tracked.sql','0089_flight_watch.sql','0090_flight_settings.sql','0091_site_settings.sql'])for(const sql of (await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();
globalThis.__askTest={env:{DB:db,ANTHROPIC_API_KEY:'test-key'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'ask-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0ask-env';if(id==='@/lib/cee/schedule'||id.endsWith('/lib/cee/schedule'))return '\0ask-sched';},load(id){if(id==='\0ask-env')return 'export const env=globalThis.__askTest.env';if(id==='\0ask-sched')return 'export async function scheduleNon(id){(globalThis.__scheduled??=[]).push(id)}';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__askTest;});
// "Ask me first": a new chat waits in Telegram for Let AI answer / I'll answer; the AI answers by itself after the wait.
const chat=await vite.ssrLoadModule('/lib/website-chat.ts');
const ask=await vite.ssrLoadModule('/lib/cee/ask-first.ts');
const cards=await vite.ssrLoadModule('/lib/telegram/cards.ts');
globalThis.__scheduled=[];
let n=0;
const newChat=async(channel='web')=>chat.createConversation('h'+(++n).toString().padStart(8,'0'),{channel,channelUserId:channel==='web'?null:'u'+n});
const row=(id)=>db.prepare('SELECT bot_paused,bot_state,assigned_name,status,created_at FROM website_conversations WHERE id=?').bind(id).first();

test('off by default: a new chat is answered by Non as before',async()=>{
 const c=await newChat();const r=await row(c.id);assert.equal(r.bot_paused,0);assert.equal(r.bot_state,null);
});
test('on: a new website, WhatsApp or LINE chat waits for a choice, and the card offers both buttons',async()=>{
 await ask.setAskFirst(true,5);
 for(const channel of ['web','whatsapp','line']){
  const c=await newChat(channel);const r=await row(c.id);assert.equal(r.bot_paused,1);assert.equal(r.bot_state,'ask_first');
  const fresh=await chat.conversationById(c.id);
  assert.match(cards.conversationCard(fresh,{body:'Hi, price to Pattaya?',created_at:fresh.created_at,from:'visitor'},true),/Who answers\?/);
  const keys=JSON.stringify(cards.conversationKeyboard(fresh,'https://x/admin'));
  assert.ok(keys.includes('chat_ai:'+c.id)&&keys.includes('chat_assign:'+c.id));
 }
 assert.match(cards.conversationCard(await chat.conversationById((await newChat('whatsapp')).id),null,true),/WhatsApp chat/);
});
test('Let AI answer works once; a second tap or a race does nothing more',async()=>{
 const c=await newChat();globalThis.__scheduled=[];
 const results=await Promise.all([ask.letAiAnswer(c.id),ask.letAiAnswer(c.id),ask.letAiAnswer(c.id)]);
 assert.equal(results.filter(Boolean).length,1);
 assert.deepEqual(globalThis.__scheduled,[c.id]);
 const r=await row(c.id);assert.equal(r.bot_paused,0);assert.equal(r.bot_state,'ai_chosen');
 assert.equal(await ask.letAiAnswer(c.id),false);
 assert.match(cards.conversationCard(await chat.conversationById(c.id),null,false),/Not assigned yet/);
});
test('a chat a person already took, or a closed one, is not given to the AI',async()=>{
 const taken=await newChat();await chat.assign(taken.id,{name:'Anna',staffId:null,telegramUserId:null},false);
 globalThis.__scheduled=[];assert.equal(await ask.letAiAnswer(taken.id),false);assert.deepEqual(globalThis.__scheduled,[]);
 const closed=await newChat();await db.prepare("UPDATE website_conversations SET status='closed' WHERE id=?").bind(closed.id).run();
 assert.equal(await ask.letAiAnswer(closed.id),false);
});
test('nobody chooses: after the wait Non answers by itself; newer chats keep waiting; the switch off stops it',async()=>{
 const old=await newChat(),young=await newChat();
 await db.prepare("UPDATE website_conversations SET created_at=? WHERE id=?").bind(new Date(Date.now()-6*60000).toISOString(),old.id).run();
 globalThis.__scheduled=[];
 assert.equal(await ask.releaseWaitingChats(new Date()),1);
 assert.equal((await row(old.id)).bot_state,'ai_timeout');assert.equal((await row(young.id)).bot_state,'ask_first');
 assert.deepEqual(globalThis.__scheduled,[old.id]);
 await db.prepare("UPDATE website_conversations SET created_at=? WHERE id=?").bind(new Date(Date.now()-60*60000).toISOString(),young.id).run();
 await ask.setAskFirst(false);assert.equal(await ask.releaseWaitingChats(new Date()),0);
 assert.equal((await chat.conversationById((await newChat()).id)).bot_paused,0);
});
test('without the AI key nothing waits (there is no AI to choose)',async()=>{
 await ask.setAskFirst(true,5);const key=globalThis.__askTest.env.ANTHROPIC_API_KEY;delete globalThis.__askTest.env.ANTHROPIC_API_KEY;
 try{assert.equal((await row((await newChat()).id)).bot_paused,0);}finally{globalThis.__askTest.env.ANTHROPIC_API_KEY=key;}
});
