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
  if(sys.startsWith('You read a post')){calls.router++;(calls.routerInputs??=[]).push(body.messages[0].content);const r=Array.isArray(opts.router)?opts.router[calls.router-1]:opts.router;return {stop_reason:r?.stop_reason??'end_turn',content:[{type:'text',text:(r?.text??r)??routedJson()}]};}
  if(sys.startsWith('You research facts')){calls.search++;(calls.maxUses??=[]).push(body.tools[0].max_uses);return {stop_reason:'end_turn',content:searchBlocks()};}
  calls.compose++;calls.composeInputs.push(JSON.parse(body.messages[0].content));return {stop_reason:'end_turn',content:[{type:'text',text:opts.compose??JSON.stringify({comment:'Trains and taxis both work.',template:opts.template===undefined?null:opts.template})}]};}};}
const text=(d)=>d.parts.join('\n');

test('a fresh search: only facts with allowed, recent, supporting sources reach the writer and the team',async()=>{
 const m=model();const d=await ph.draftForPost('Anyone know how to get from BKK to Pattaya?',{client:m,now:()=>now});
 assert.deepEqual(m.calls.composeInputs[0].verifiedFacts.map((f)=>f.fact),['Airport rail link runs to the city','Morning transfers are less busy']);
 const out=text(d);
 assert.match(out,/Fresh search · Source from 21\/10\/2026/);assert.match(out,/airportthai\.co\.th/);assert.match(out,/blog\.example\.com/);
 assert.doesNotMatch(out,/facebook\.com|example\.com\/not-returned/);assert.match(out,/Left out: 3 statements/);assert.match(out,/Draft only/);
 assert.equal(m.calls.search,1);
 // What the Facebook leads flow reads to decide "ready to post" (lib/fb-leads-rules → reliability).
 assert.deepEqual([d.replyType,d.factCount,d.stale],['info',2,false]);
 assert.ok(!JSON.stringify(d.keyboard).includes('ph_save'),'no save button before the question repeats');
 // Two messages: the comment alone (easy to copy), then the checks with the buttons.
 assert.equal(d.parts.length,2);assert.ok(d.parts[0].startsWith('Trains and taxis both work.'));
 assert.doesNotMatch(d.parts[0],/Source|Sources|Check before|Fresh search|<b>/);
 assert.match(d.parts[1],/Check before posting/);assert.match(d.parts[1],/Up to date: searched just now/);assert.match(d.parts[1],/Sources/);
});

test('asked three times it can be saved (a person taps); then it is used without a web search, with its date',async()=>{
 const m=model();let d;for(let i=0;i<2;i++)d=await ph.draftForPost('Anyone know how to get from BKK to Pattaya? #'+i,{client:m,now:()=>now});
 assert.ok(JSON.stringify(d.keyboard).includes('ph_save:'+d.id),'3rd ask offers the save button (the 1st was counted above)');
 await ph.handlePostCallback('ph_save',d.id,'Anna','q1',undefined,'-100',{id:'78',isTeam:true},now);
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
 await ph.handlePostCallback('ph_bad',d.id,'Anna','q2',undefined,'-100',{id:'78',isTeam:true});
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

test('a router reply cut off at the token limit is asked for once more, JSON only',async()=>{
 const cut={stop_reason:'max_tokens',text:'Great question! The Ancient City (Muang Boran) is well worth it. {"language":"en","replyType":"adjacent","kind":"transport","topic":"ancient-ci'};
 let systems=[];const m=model({router:[cut,routedJson({topic:'ancient-city-from-bangkok'})]});
 const wrapped={create:async(b)=>{if(String(b.system).startsWith('You read a post'))systems.push(String(b.system));return m.create(b);}};
 const d=await ph.draftForPost('Worth it po ba Ancient City tour? If yes, how to get there from Bangkok?',{client:wrapped,now:()=>now});
 assert.equal(m.calls.router,2);assert.equal(m.calls.compose,1);assert.ok(d.parts.length>0);
 assert.doesNotMatch(systems[0],/could not be read/);assert.match(systems[1],/JSON object only/);
 const row=await db.prepare("SELECT count FROM post_helper_topics WHERE topic_key='ancient-city-from-bangkok'").first();assert.equal(row.count,1);
 const twice=model({router:[cut,cut]});
 await assert.rejects(()=>ph.draftForPost('Worth it po ba?',{client:twice,now:()=>now}),/UNREADABLE/);assert.equal(twice.calls.router,2,'only one retry');assert.equal(twice.calls.search,0);
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

test('each person has a monthly comment limit: counted atomically, per person, per month; a failed draft gives it back', async () => {
 await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('post_helper_user_limit','3','x')").run();
 const t=new Date('2026-10-21T05:00:00Z');
 // Five taps at once for a limit of three: exactly three get through.
 const racing=await Promise.all(Array.from({length:5},()=>ph.claimComment('u1',t)));
 assert.equal(racing.filter((c)=>c.ok).length,3);
 assert.deepEqual(racing.filter((c)=>c.ok).map((c)=>c.used).sort(),[1,2,3]);
 const over=await ph.claimComment('u1',t);assert.deepEqual([over.ok,over.used,over.limit],[false,3,3]);
 // Other people and the next month are not affected.
 assert.equal((await ph.claimComment('u2',t)).ok,true);
 assert.equal((await ph.claimComment('u1',new Date('2026-11-01T01:00:00Z'))).ok,true);
 // A failed draft gives the comment back.
 await ph.releaseComment('u1',t);assert.equal((await ph.claimComment('u1',t)).ok,true);
 await ph.releaseComment('nobody',t); // nothing to give back: no error, no negative count
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM post_helper_usage WHERE telegram_user_id='nobody'").first()).n,0);
 assert.equal(await ph.userLimit(),3);
 await db.prepare("DELETE FROM app_settings WHERE key='post_helper_user_limit'").run();
 assert.equal(await ph.userLimit(),500);
 await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('post_helper_user_limit','not a number','x')").run();assert.equal(await ph.userLimit(),500);
 await db.prepare("DELETE FROM app_settings WHERE key='post_helper_user_limit'").run();
});
test('only the team can save knowledge; any group member can use the other buttons', async () => {
 const m=model();const d=await ph.draftForPost('BKK to Pattaya again and again',{client:m,now:()=>now});
 await db.prepare("DELETE FROM post_helper_knowledge WHERE topic_key='bkk-airport-to-pattaya-options'").run();
 await ph.handlePostCallback('ph_save',d.id,'Guest','q9',undefined,'-100',{id:'77',isTeam:false});
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM post_helper_knowledge WHERE topic_key='bkk-airport-to-pattaya-options'").first()).n,0);
 await ph.handlePostCallback('ph_save',d.id,'Anna','q10',undefined,'-100',{id:'78',isTeam:true});
 assert.equal((await db.prepare("SELECT status FROM post_helper_knowledge WHERE topic_key='bkk-airport-to-pattaya-options'").first()).status,'approved');
});

test('cheaper drafts for Facebook leads: a social post stops after sorting, booking requests skip the search, one search otherwise',async()=>{
 // Social: sorted, then nothing else is paid for.
 let m=model({router:routedJson({replyType:'social',kind:'other',topic:'cheap-social'})});
 let d=await ph.draftForPost('Anyone else on Koh Chang this week?',{client:m,now:()=>now},{leadsOnly:true});
 assert.deepEqual([d.replyType,d.parts.length,m.calls.search,m.calls.compose],['social',0,0,0]);
 // Booking request: written (offer and one question) without a web search; no "check the facts" warning.
 m=model({router:routedJson({replyType:'sales',kind:'transport',topic:'cheap-sales'})});
 d=await ph.draftForPost('Looking for a driver tomorrow',{client:m,now:()=>now},{leadsOnly:true,noSearchForBookings:true,maxSearches:1});
 assert.deepEqual([m.calls.search,m.calls.compose,d.factCount,d.searched],[0,1,0,false]);
 assert.match(text(d),/Booking request: no web search/);assert.doesNotMatch(text(d),/No fact passed/);
 // Information post: still searched, but at most once.
 m=model({router:routedJson({topic:'cheap-info'})});
 d=await ph.draftForPost('Which beach is best in Koh Chang?',{client:m,now:()=>now},{leadsOnly:true,noSearchForBookings:true,maxSearches:1});
 assert.deepEqual([m.calls.search,m.calls.maxUses,d.searched],[1,[1],true]);
 // /c is unchanged: two searches allowed, and a social post still gets a comment.
 m=model({router:routedJson({topic:'cheap-c'})});await ph.draftForPost('Which beach is best?',{client:m,now:()=>now});
 assert.deepEqual(m.calls.maxUses,[2]);
 m=model({router:routedJson({replyType:'social',kind:'other',topic:'cheap-c-social'})});
 d=await ph.draftForPost('Hello everyone',{client:m,now:()=>now});
 assert.equal(m.calls.compose,1);assert.equal(d.parts.length,2);
});

test('an advert (the sorter sees an offer) stops after sorting for Facebook leads; /c still drafts it', async () => {
  let m = model({ router: routedJson({ topic: 'cheap-advert', advert: true }) });
  let d = await ph.draftForPost('Luxury Private Pool Villas for Yearly Rental', { client: m, now: () => now }, { leadsOnly: true, maxSearches: 1, noSearchForBookings: true });
  assert.deepEqual([d.advert, d.parts.length, m.calls.search, m.calls.compose], [true, 0, 0, 0]);
  m = model({ router: routedJson({ topic: 'cheap-advert-c', advert: true }) });
  d = await ph.draftForPost('Luxury Private Pool Villas for Yearly Rental', { client: m, now: () => now });
  assert.equal(m.calls.compose, 1); assert.equal(d.parts.length, 2);
});

test('the sorter post type and place: only a request about Thailand becomes a lead; /c ignores both', async () => {
  for (const [over, want] of [[{ postType: 'news' }, 'news'], [{ postType: 'meme' }, 'meme'], [{ postType: 'giveaway' }, 'giveaway'], [{ inThailand: 'no' }, 'not_thailand']]) {
    const m = model({ router: routedJson({ topic: 'type-' + want, ...over }) });
    const d = await ph.draftForPost('A post', { client: m, now: () => now }, { leadsOnly: true, maxSearches: 1, noSearchForBookings: true });
    assert.deepEqual([d.skipReason, m.calls.search, m.calls.compose], [want, 0, 0], want);
  }
  const m = model({ router: routedJson({ topic: 'type-unclear', inThailand: 'unclear' }) });
  const d = await ph.draftForPost('Best beach?', { client: m, now: () => now }, { leadsOnly: true, maxSearches: 1 });
  assert.equal(d.skipReason, undefined, 'unclear place is kept');
  const c = model({ router: routedJson({ topic: 'type-c', postType: 'news', inThailand: 'no' }) });
  await ph.draftForPost('A post', { client: c, now: () => now });
  assert.equal(c.calls.compose, 1, '/c still drafts');
});

test('"no agents" posts: a booking request is answered as information, with no offer or WhatsApp', async () => {
  const m = model({ router: routedJson({ topic: 'no-agents', replyType: 'sales', kind: 'transport' }) });
  const d = await ph.draftForPost('Need a driver to Pattaya, no agents please', { client: m, now: () => now }, { leadsOnly: true, maxSearches: 1, noSearchForBookings: true, noSalesPitch: true });
  assert.equal(d.replyType, 'info');
  assert.equal(m.calls.search, 1, 'answered with checked facts like any information post');
  assert.match(d.parts[1], /Information only/);
  assert.doesNotMatch(d.parts[0], /WhatsApp|wa\.me/);
});

test('Facebook leads answer for the group\'s place: the sorter sees the group, the writer gets "where", knowledge is kept per area', async () => {
  // Owner's report: "Is anywhere doing anything for remembrance day" in Koh Chang Community was answered with Kanchanaburi.
  const m = model({ router: routedJson({ topic: 'remembrance-day-events', question: 'Remembrance Day events on Koh Chang this year', area: 'Koh Chang', timeSensitive: true }) });
  const d = await ph.draftForPost('Is anywhere doing anything for remembrance day', { client: m, now: () => now }, { leadsOnly: true, maxSearches: 1, noSearchForBookings: true, groupName: 'Koh Chang Community' });
  assert.match(m.calls.routerInputs[0], /^<group>Koh Chang Community<\/group>\n<post>/);
  assert.deepEqual(m.calls.composeInputs[0].where, { group: 'Koh Chang Community', area: 'Koh Chang' });
  const row = await db.prepare('SELECT topic_key FROM post_helper_drafts WHERE id=?').bind(d.id).first();
  assert.equal(row.topic_key, 'koh-chang-remembrance-day-events', 'a Koh Chang answer is never reused for another place');
  // /c has no group: no group line, no "where", topic unchanged.
  const c = model({ router: routedJson({ topic: 'remembrance-day-events-c' }) });
  const dc = await ph.draftForPost('Is anywhere doing anything for remembrance day', { client: c, now: () => now });
  assert.match(c.calls.routerInputs[0], /^<post>/);
  assert.equal('where' in c.calls.composeInputs[0], false);
  assert.equal((await db.prepare('SELECT topic_key FROM post_helper_drafts WHERE id=?').bind(dc.id).first()).topic_key, 'remembrance-day-events-c');
});

test('the writer is told to stay in the area and not to fill a gap with another province', async () => {
  let system = '';
  const m = model({ router: routedJson({ topic: 'area-rule', area: 'Koh Chang' }) });
  const spy = { create: async (body) => { if (!String(body.system).startsWith('You read a post') && !String(body.system).startsWith('You research facts')) system = JSON.stringify(body.system); return m.create(body); } };
  await ph.draftForPost('Any events this weekend?', { client: spy, now: () => now }, { leadsOnly: true, maxSearches: 1, groupName: 'Koh Chang Community' });
  assert.match(system, /answer for that area only/);
  assert.match(system, /Never recommend, describe or send people to events, places or services in another area/);
  assert.match(system, /move the comment toward how Waydidi can help directly/);
  assert.doesNotMatch(system, /not sure what is on there|worth checking/i, 'no hedge about missing local data');
  assert.doesNotMatch(system, /Koh Chang/, 'the group stays out of the cached instructions');
});

test('sorting on arrival: the sorter alone says lead or not; drafting reuses that answer without asking again', async () => {
  let m = model({ router: routedJson({ topic: 'arrive-chat', replyType: 'social', postType: 'chat' }) });
  let s = await ph.sortForLead('Hello everyone', 'Koh Chang Community', { client: m });
  assert.deepEqual([s.skipReason, m.calls.router, m.calls.search, m.calls.compose], ['chat', 1, 0, 0]);
  assert.match(m.calls.routerInputs[0], /<group>Koh Chang Community<\/group>/);
  m = model({ router: routedJson({ topic: 'arrive-lead', area: 'Koh Chang' }) });
  s = await ph.sortForLead('Best beach for kids?', 'Koh Chang Community', { client: m });
  assert.equal(s.skipReason, '');
  const d = await ph.draftForPost('Best beach for kids?', { client: m, now: () => now }, { leadsOnly: true, maxSearches: 1, groupName: 'Koh Chang Community', routed: s.routed });
  assert.equal(m.calls.router, 1, 'not sorted a second time');
  assert.equal(m.calls.compose, 1);
  assert.equal(d.skipReason, undefined);
});

test('the writer is told to avoid AI-sounding hedges, vary its openings, and never suggest asking someone else', async () => {
  let system = '';
  const m = model({ router: routedJson({ topic: 'quality-rule' }) });
  const spy = { create: async (body) => { if (!String(body.system).startsWith('You read a post') && !String(body.system).startsWith('You research facts')) system = JSON.stringify(body.system); return m.create(body); } };
  await ph.draftForPost('Any tips for a day trip?', { client: spy, now: () => now }, { leadsOnly: true, maxSearches: 1 });
  assert.match(system, /I can't confirm/);
  assert.match(system, /I don't have \[place\]-specific data/);
  assert.match(system, /vary your sentence openings/i);
  assert.match(system, /Your best bet is/);
  assert.match(system, /The trade-off is/);
  assert.match(system, /Never suggest the poster ask someone else/);
  assert.match(system, /Agoda, Booking\.com or Google review rating/);
});

test('"adjacent" now covers booking tours/activities online vs locally, and country comparisons are chat, not a request', async () => {
  const m = model({ router: routedJson({ topic: 'quality-router' }) });
  const spy = { create: async (body) => { if (String(body.system).startsWith('You read a post')) { assert.match(body.system, /whether\/where to book tours, activities or day trips/); assert.match(body.system, /Turkey or Thailand resort holidays, which is better/i); assert.match(body.system, /missing person/); } return m.create(body); } };
  await ph.draftForPost('Is it better to book activities on the app or locally for the best price?', { client: spy, now: () => now }, { leadsOnly: true, maxSearches: 1 });
});

test('for a broader trip (not a point-to-point transfer), the writer offers to help plan and arrange it, not a fixed line', async () => {
  let system = '';
  const m = model({ router: routedJson({ topic: 'trip-offer-rule' }) });
  const spy = { create: async (body) => { if (!String(body.system).startsWith('You read a post') && !String(body.system).startsWith('You research facts')) system = JSON.stringify(body.system); return m.create(body); } };
  await ph.draftForPost('9 days in Phuket with my boys, any suggestions of what to do?', { client: spy, now: () => now }, { leadsOnly: true, maxSearches: 1 });
  assert.match(system, /Waydidi Travel can help plan and arrange it for them, not only drive them/);
  assert.match(system, /never the same fixed sentence twice/);
  assert.match(system, /this is not one fixed line to reuse, write it the way a different staff member would each time/);
  // The transfer-specific wording (door to door, luggage) is still there for a plain point-to-point ask.
  assert.match(system, /door to door, luggage, several stops, comfort/);
});
