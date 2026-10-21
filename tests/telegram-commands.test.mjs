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
globalThis.__cmdTest={env:{DB:db,TELEGRAM_BOT_TOKEN:'t',TELEGRAM_CHAT_ID:'-100555'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'cmd-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0cmd-env';},load(id){if(id==='\0cmd-env')return 'export const env=globalThis.__cmdTest.env';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__cmdTest;});
const cmd=await vite.ssrLoadModule('/lib/telegram/commands.ts');
const t0=new Date('2026-10-21T05:00:00Z');
test('without a Comment group the Admin group menu has /comment first; it is registered once and again only when something changes',async()=>{
 const calls=[];const ok=async(method,payload)=>{calls.push([method,payload]);return true;};
 assert.equal(await cmd.syncBotCommands(ok,t0),true);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'setMyCommands');assert.deepEqual(calls[0][1].scope,{type:'chat',chat_id:'-100555'});
 assert.deepEqual(calls[0][1].commands.map((c)=>c.command),['comment','ask','id']);assert.match(calls[0][1].commands[0].description,/Facebook comment/);
 for(const c of calls[0][1].commands){assert.match(c.command,/^[a-z0-9_]{1,32}$/);assert.ok(c.description.length>=3&&c.description.length<=256);}
 assert.equal(await cmd.syncBotCommands(ok,new Date(t0.getTime()+3600000)),false);assert.equal(calls.length,1);
});
test('with a Comment group: /comment is in its menu only, and the Admin group menu loses it',async()=>{
 const calls=[];const ok=async(method,payload)=>{calls.push([method,payload]);return true;};
 globalThis.__cmdTest.env.TELEGRAM_COMMENT_CHAT_ID='-100999';
 assert.equal(await cmd.syncBotCommands(ok,new Date(t0.getTime()+7200000)),true);
 assert.equal(calls.length,2);
 const byChat=Object.fromEntries(calls.map(([,p])=>[p.scope.chat_id,p.commands.map((c)=>c.command)]));
 assert.deepEqual(byChat,{'-100555':['ask','id'],'-100999':['comment']});
 assert.equal(await cmd.syncBotCommands(ok,new Date(t0.getTime()+10800000)),false);
 delete globalThis.__cmdTest.env.TELEGRAM_COMMENT_CHAT_ID;
});
test('a failed registration is retried later (not every minute) and nothing is marked done',async()=>{
 await db.prepare("DELETE FROM app_settings WHERE key LIKE 'tg_commands_%'").run();
 let n=0;const bad=async()=>{n++;throw new Error('Telegram setMyCommands failed: nope');};
 assert.equal(await cmd.syncBotCommands(bad,t0),false);assert.equal(n,1);
 assert.equal(await cmd.syncBotCommands(bad,new Date(t0.getTime()+60000)),false);assert.equal(n,1,'waits before retrying');
 assert.equal(await cmd.syncBotCommands(bad,new Date(t0.getTime()+11*60000)),false);assert.equal(n,2);
 const good=async()=>true;assert.equal(await cmd.syncBotCommands(good,new Date(t0.getTime()+30*60000)),true);
});
test('without Telegram set up nothing is called',async()=>{
 await db.prepare("DELETE FROM app_settings WHERE key LIKE 'tg_commands_%'").run();
 const saved=globalThis.__cmdTest.env.TELEGRAM_BOT_TOKEN;delete globalThis.__cmdTest.env.TELEGRAM_BOT_TOKEN;let n=0;
 try{assert.equal(await cmd.syncBotCommands(async()=>{n++;},t0),false);assert.equal(n,0);}finally{globalThis.__cmdTest.env.TELEGRAM_BOT_TOKEN=saved;}
});
