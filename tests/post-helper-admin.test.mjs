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
globalThis.__pwTest={env:{DB:db,ANTHROPIC_API_KEY:'test-key'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'pw-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0pw-env';if(id==='@/lib/admin'||id.endsWith('/lib/admin'))return '\0pw-admin';if(id==='@/lib/cee/quotes'||id.endsWith('/lib/cee/quotes'))return '\0pw-quotes';},load(id){if(id==='\0pw-env')return 'export const env=globalThis.__pwTest.env';if(id==='\0pw-admin')return 'export async function getWaydidiAdmin(){return globalThis.__pwTest.user}';if(id==='\0pw-quotes')return 'export async function quoteTransfer(){return {ok:false,reason:"x",handover:false}}';}}],server:{middlewareMode:true}});
globalThis.__pwTest.user={email:'owner@example.invalid',displayName:'Owner',role:'owner'};
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__pwTest;});
const route=await vite.ssrLoadModule('/app/api/admin/post-helper/route.ts');
const post=(body,origin='https://example.invalid')=>new Request('https://example.invalid/api/admin/post-helper',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const good={action:'save',notes:'PLAYBOOK\r\nHelp first.',whatsapp:'+66 63 206 4884',userLimit:250,blocked:['https://www.Facebook.com/groups','reddit.com','reddit.com']};

test('only the owner can read or change the playbook; other roles and other sites are refused',async()=>{
 for(const role of ['support','operations','finance']){globalThis.__pwTest.user={email:'x',displayName:'X',role};
  assert.equal((await route.GET()).status,403);assert.equal((await route.POST(post(good))).status,403);}
 globalThis.__pwTest.user=null;assert.equal((await route.GET()).status,403);
 globalThis.__pwTest.user={email:'owner@example.invalid',displayName:'Owner',role:'owner'};
 assert.equal((await route.POST(post(good,'https://evil.example'))).status,403);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM app_settings WHERE key='post_helper_notes'").first()).n,0);
});
test('saving stores the playbook, the number and a cleaned blocked list; bad input is refused',async()=>{
 assert.equal((await route.POST(post(good))).status,200);
 const data=await (await route.GET()).json();
 assert.equal(data.notes,'PLAYBOOK\nHelp first.');assert.equal(data.whatsapp,'+66 63 206 4884');assert.deepEqual(data.blocked,['facebook.com','reddit.com']);assert.equal(data.userLimit,250);
 for(const bad of [{...good,notes:'x'.repeat(40001)},{...good,whatsapp:'call me'},{...good,blocked:['not a site!']},{...good,blocked:'reddit.com'},{...good,userLimit:0},{...good,userLimit:100001},{...good,userLimit:1.5},{...good,userLimit:'500'},{action:'nope'}])assert.equal((await route.POST(post(bad))).status,400);
 assert.equal((await (await route.GET()).json()).notes,'PLAYBOOK\nHelp first.');
});
test('saved knowledge: approve a paused answer, retire, delete; a repeated click is a plain conflict',async()=>{
 const at='2026-10-21T00:00:00.000Z';
 await route.GET();
 await db.prepare("INSERT INTO post_helper_knowledge(id,topic_key,question,facts_json,status,time_sensitive,collected_at,refreshed_at) VALUES('e1','t1','Q1','[]','review',0,?,?)").bind(at,at).run();
 assert.equal((await route.POST(post({action:'approve',id:'e1'}))).status,200);
 assert.deepEqual(await db.prepare("SELECT status,approved_by FROM post_helper_knowledge WHERE id='e1'").first(),{status:'approved',approved_by:'Owner'});
 assert.equal((await route.POST(post({action:'approve',id:'e1'}))).status,409);
 assert.equal((await route.POST(post({action:'retire',id:'e1'}))).status,200);
 assert.equal((await route.POST(post({action:'delete',id:'e1'}))).status,200);
 assert.equal((await route.POST(post({action:'delete',id:'e1'}))).status,409);
 assert.equal((await route.POST(post({action:'retire'}))).status,400);
});
