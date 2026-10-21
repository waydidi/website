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
globalThis.__phTest={env:{DB:db,ANTHROPIC_API_KEY:'test-key'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'ph-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0ph-env';if(id==='@/lib/cee/quotes'||id.endsWith('/lib/cee/quotes'))return '\0ph-quotes';},load(id){if(id==='\0ph-env')return 'export const env=globalThis.__phTest.env';if(id==='\0ph-quotes')return 'export async function quoteTransfer(){return {ok:false,reason:"x",handover:false}}';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__phTest;});
const ph=await vite.ssrLoadModule('/lib/telegram/post-helper.ts');
const now=new Date('2026-10-21T05:00:00Z');
const routedJson=(over={})=>JSON.stringify({language:'en',replyType:'info',kind:'travel',topic:'bkk-airport-to-pattaya-options',question:'How to get from Bangkok airport to Pattaya',timeSensitive:false,route:null,...over});
const searchBlocks=()=>[{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://www.airportthai.co.th/transport',title:'AOT',page_age:'September 2, 2026'},{type:'web_search_result',url:'https://blog.example.com/pattaya-tips',title:'Blog',page_age:'1 month ago'},{type:'web_search_result',url:'https://www.facebook.com/groups/x/posts/1',title:'FB',page_age:'1 day ago'}]},{type:'text',text:JSON.stringify({facts:[
 {claim:'Airport rail link runs to the city',category:'schedule',sources:['https://www.airportthai.co.th/transport']},
 {claim:'A blog says the visa fee is 2,000 baht',category:'fees',sources:['https://blog.example.com/pattaya-tips']},
 {claim:'A Facebook comment says it is cheap',category:'tip',sources:['https://www.facebook.com/groups/x/posts/1']},
 {claim:'Morning transfers are less busy',category:'tip',sources:['https://blog.example.com/pattaya-tips']},
 {claim:'Made-up fact',category:'general',sources:['https://example.com/not-returned']}]})}];
/** A scripted model: the router, the web search and the writer, told apart by their system prompt. */
function model(opts={}){const calls={router:0,search:0,compose:0,composeInputs:[]};
 return {calls,create:async(body)=>{const sys=String(body.system);
  if(sys.startsWith('You read a post')){calls.router++;return {stop_reason:'end_turn',content:[{type:'text',text:opts.router??routedJson()}]};}
  if(sys.startsWith('You research facts')){calls.search++;return {stop_reason:'end_turn',content:searchBlocks()};}
  calls.compose++;calls.composeInputs.push(JSON.parse(body.messages[0].content));return {stop_reason:'end_turn',content:[{type:'text',text:opts.compose??JSON.stringify({comment:'Trains and taxis both work.',template:opts.template===undefined?null:opts.template})}]};}};}
const text=(d)=>d.parts.join('\n');

test('a fresh search: only facts with allowed, recent, supporting sources reach the writer and the team',async()=>{
 const m=model();const d=await ph.draftForPost('Anyone know how to get from BKK to Pattaya?',{client:m,now:()=>now});
 assert.deepEqual(m.calls.composeInputs[0].verifiedFacts.map((f)=>f.fact),['Airport rail link runs to the city','Morning transfers are less busy']);
 const out=text(d);
 assert.match(out,/Fresh search · Source from 21\/10\/2026/);assert.match(out,/airportthai\.co\.th/);assert.match(out,/blog\.example\.com/);
 assert.doesNotMatch(out,/facebook\.com|example\.com\/not-returned/);assert.match(out,/Left out: 3 statements/);assert.match(out,/Draft only/);
 assert.equal(m.calls.search,1);
 assert.ok(!JSON.stringify(d.keyboard).includes('ph_save'),'no save button before the question repeats');
});

test('asked three times it can be saved (a person taps); then it is used without a web search, with its date',async()=>{
 const m=model();let d;for(let i=0;i<2;i++)d=await ph.draftForPost('Anyone know how to get from BKK to Pattaya? #'+i,{client:m,now:()=>now});
 assert.ok(JSON.stringify(d.keyboard).includes('ph_save:'+d.id),'3rd ask offers the save button (the 1st was counted above)');
 await ph.handlePostCallback('ph_save',d.id,'Anna','q1',undefined);
 const row=await db.prepare("SELECT status,approved_by,collected_at FROM post_helper_knowledge WHERE topic_key='bkk-airport-to-pattaya-options'").first();
 assert.deepEqual([row.status,row.approved_by],['approved','Anna']);
 const before=m.calls.search;
 const later=await ph.draftForPost('Best way from BKK to Pattaya please',{client:m,now:()=>new Date('2026-11-02T05:00:00Z')});
 assert.equal(m.calls.search,before,'no web search for saved knowledge');
 assert.match(text(later),/Saved knowledge · Source from 21\/10\/2026/);
 assert.equal((await db.prepare("SELECT hits FROM post_helper_knowledge WHERE topic_key='bkk-airport-to-pattaya-options'").first()).hits,1);
 await ph.draftForPost('Best way from BKK to Pattaya please',{client:m,now:()=>now},{forceFresh:true});assert.equal(m.calls.search,before+1);
});

test('"Wrong or outdated" pauses the saved facts until checked',async()=>{
 const m=model();const d=await ph.draftForPost('BKK to Pattaya again',{client:m,now:()=>now});
 await ph.handlePostCallback('ph_bad',d.id,'Anna','q2',undefined);
 assert.equal((await db.prepare("SELECT status FROM post_helper_knowledge WHERE topic_key='bkk-airport-to-pattaya-options'").first()).status,'review');
 const s=m.calls.search;await ph.draftForPost('BKK to Pattaya once more',{client:m,now:()=>now});assert.equal(m.calls.search,s+1,'paused knowledge is not reused');
});

test('a sales post gets the real quote in the comment, one WhatsApp line and no em dashes; no quote means no price',async()=>{
 const sales=routedJson({replyType:'sales',kind:'transport',topic:'phuket-airport-to-patong',question:'Phuket airport to Patong transport',route:{pickup:'Phuket Airport',dropoff:'Patong',passengers:2,bags:2}});
 const quote=async()=>({ok:true,kind:'transfer',summary:'Phuket Airport to Patong',notes:[],cars:[{vehicle:'economy_sedan',name:'Economy sedan',seats:2,bags:2,price:900,bookUrl:'https://waydidi.com/?x=1'}]});
 const m=model({router:sales,compose:JSON.stringify({comment:'Hi! 😊 A private car is easier with bags — from THB 900 in an Economy sedan. What is your travel date and hotel?'})});
 const d=await ph.draftForPost('Need a taxi Phuket airport to Patong for 2',{client:m,quote,now:()=>now});
 assert.equal(m.calls.composeInputs[0].waydidiQuote.cars[0].priceThb,900);
 const out=text(d);assert.match(out,/Sales \(wants to hire\)/);assert.match(out,/from THB 900/);assert.match(out,/WhatsApp[: ]+\+66 63 206 4884/);assert.doesNotMatch(out,/—/);
 assert.equal((out.match(/WhatsApp/g)||[]).length,1);
 const none=await ph.draftForPost('Need a taxi Phuket airport to Patong for 2',{client:model({router:sales}),quote:async()=>({ok:false,reason:'No price for that route.',handover:false}),now:()=>now});
 assert.match(text(none),/No Waydidi price in the comment/);
 const inputs=m.calls.composeInputs;assert.equal(inputs.length,1);
});

test('an information post gets a light sign-off and no WhatsApp; a social post gets no promotion; the number can be changed',async()=>{
 const info=await ph.draftForPost('Kata or Karon for a family?',{client:model({router:routedJson({replyType:'info',topic:'kata-or-karon'})}),now:()=>now});
 assert.match(text(info),/Information only/);assert.match(text(info),/Waydidi Travel/);assert.doesNotMatch(text(info),/WhatsApp/);
 const social=await ph.draftForPost('First time in Thailand, anyone around?',{client:model({router:routedJson({replyType:'social',topic:'first-time-hello'})}),now:()=>now});
 assert.doesNotMatch(text(social),/WhatsApp|have a look at Waydidi|tips like this|local travel ideas/);
 await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('post_helper_whatsapp','+66 99 000 0000','x')").run();
 const sales=await ph.draftForPost('Looking for a private driver Bangkok',{client:model({router:routedJson({replyType:'sales',kind:'transport',topic:'bkk-private-driver'})}),now:()=>now});
 assert.match(text(sales),/\+66 99 000 0000/);
 await db.prepare("DELETE FROM app_settings WHERE key='post_helper_whatsapp'").run();
});

test('the owner playbook is given to the writer, and its reference prices are marked as not quotes',async()=>{
 await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('post_helper_notes','PLAYBOOK: help first. Sedan 1,300','x')").run();
 let system='';const m=model();const wrapped={create:async(b)=>{if(String(JSON.stringify(b.system)).includes('Facebook community adviser'))system=JSON.stringify(b.system);return m.create({...b,system:Array.isArray(b.system)?b.system[0].text:b.system});}};
 await ph.draftForPost('Kata or Karon?',{client:wrapped,now:()=>now});
 assert.match(system,/PLAYBOOK: help first/);assert.match(system,/reference prices are NOT quotes/);
 await db.prepare("DELETE FROM app_settings WHERE key='post_helper_notes'").run();
});

test('unreadable model replies stop with an error',async()=>{
 await assert.rejects(()=>ph.draftForPost('hello there friends',{client:model({router:'sorry'}),now:()=>now}),/UNREADABLE/);
 await assert.rejects(()=>ph.draftForPost('hello there friends',{client:model({compose:'nope'}),now:()=>now}),/UNREADABLE/);
});

test('twice-yearly refresh: due entries are searched again and replaced; ones with no good source are paused',async()=>{
 const old='2026-03-01T00:00:00.000Z';
 for(const [id,topic,q] of [['k1','refresh-ok','Question one'],['k2','refresh-none','Question two'],['k3','refresh-fresh','Question three']])
  await db.prepare("INSERT INTO post_helper_knowledge(id,topic_key,question,facts_json,status,time_sensitive,collected_at,refreshed_at) VALUES(?,?,?,?,?,0,?,?)").bind(id,topic,q,'[]','approved',old,id==='k3'?'2026-07-20T00:00:00.000Z':old).run();
 const at=new Date('2026-07-11T05:00:00Z');
 assert.equal(await ph.refreshKnowledgeDue(new Date('2026-07-09T05:00:00Z'),{client:model()},5),0,'not due before 10 July');
 const nothing={create:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'{"facts":[]}'}]})};
 await db.prepare("UPDATE post_helper_knowledge SET status='paused-test' WHERE id='k2'").run();
 await ph.refreshKnowledgeDue(at,{client:model()},5);
 await db.prepare("UPDATE post_helper_knowledge SET status='approved' WHERE id='k2'").run();
 await ph.refreshKnowledgeDue(at,{client:nothing},5);
 const k1=await db.prepare("SELECT refreshed_at,facts_json FROM post_helper_knowledge WHERE id='k1'").first();
 assert.equal(k1.refreshed_at,at.toISOString());assert.ok(JSON.parse(k1.facts_json).length>=1);
 assert.equal((await db.prepare("SELECT status FROM post_helper_knowledge WHERE id='k2'").first()).status,'review');
 assert.equal((await db.prepare("SELECT refreshed_at FROM post_helper_knowledge WHERE id='k3'").first()).refreshed_at,'2026-07-20T00:00:00.000Z','refreshed after 10 July already');
});

test('pasted posts are deleted after 7 days',async()=>{
 await db.prepare("INSERT INTO post_helper_drafts(id,topic_key,text,routed_json,facts_json,mode,created_at) VALUES('old1','t','x','{}','[]','fresh',?)").bind('2026-10-01T00:00:00.000Z').run();
 await ph.purgeOldDrafts(now);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM post_helper_drafts WHERE id='old1'").first()).n,0);
});
