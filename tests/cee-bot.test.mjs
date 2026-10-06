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
for(const file of ['0061_website_chat.sql','0069_chat_telegram.sql','0070_support_reviews.sql','0071_chat_country.sql','0072_cee_bot.sql','0073_cee_knowledge_channels.sql','0074_non_scaling.sql','0075_chat_read_receipts.sql','0076_chat_idle.sql','0077_telegram_prompt_user.sql','0078_telegram_dm.sql','0079_chat_payment_links.sql','0080_chat_cards.sql','0081_telegram_booking_tasks.sql','0082_telegram_request_cards.sql','0084_chat_alerts_limits.sql','0085_booking_links.sql','0086_flight_status.sql','0087_flight_stats.sql','0088_flight_tracked.sql','0089_flight_watch.sql'])for(const sql of (await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();
globalThis.__ceeTest={env:{DB:db,ANTHROPIC_API_KEY:'test-key'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'cee-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0cee-env';},load(id){if(id==='\0cee-env')return 'export const env=globalThis.__ceeTest.env';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__ceeTest;});
const bot=await vite.ssrLoadModule('/lib/cee/bot.ts');
const chat=await vite.ssrLoadModule('/lib/website-chat.ts');
const {bookingLink}=await vite.ssrLoadModule('/lib/cee/quotes.ts');
const questions=JSON.parse(await readFile(root+'/tests/fixtures/cee-questions.json','utf8'));

/** A fake Claude that plays back scripted responses and records what it was sent. */
function scripted(...responses){const calls=[];return {calls,beta:{messages:{create:async(body)=>{calls.push(structuredClone(body));const r=responses.shift();if(!r)throw new Error('no more responses');return r;}}}};}
const say=(text)=>({stop_reason:'end_turn',content:[{type:'text',text}]});
const use=(name,input,id='t1')=>({stop_reason:'tool_use',content:[{type:'tool_use',id,name,input}]});
const car={vehicle:'economy_sedan',name:'Economy sedan',seats:2,bags:2,price:1800,bookUrl:'https://waydidi.com/?rebook=chat'};
const tools={searchKnowledge:async()=>({notes:[],places:[]}),quoteTransfer:async()=>({ok:true,kind:'transfer',summary:'BKK → Pattaya',cars:[car],notes:[]}),quoteHourly:async()=>({ok:false,reason:'Ask for the city.',handover:false}),findPackages:async()=>[]};

test('smart mode uses Opus 5.5, server-side fallback, low effort and strict tools',async()=>{
 const c=scripted(say('Hi! When are you travelling?'));
 const out=await bot.ceeTurn([{sender:'visitor',body:'How much from BKK to Pattaya?'}],c,{tools,now:'Sunday 4 October 2026',mode:'smart'});
 assert.equal(out.reply,'Hi! When are you travelling?');assert.equal(out.handover,null);
 const b=c.calls[0];assert.equal(b.model,'claude-opus-5-5');assert.equal(b.fallbacks,'default');assert.deepEqual(b.betas,['server-side-fallback-2026-07-01']);
 assert.equal(b.output_config.effort,'low');assert.ok(b.tools.every((t)=>t.strict===true));assert.equal(b.tool_choice.type,'auto');
 assert.match(b.system[0].text,/Sunday 4 October 2026/);assert.match(b.system[0].text,/never invent/i);
});
test('history alternates roles, merges repeats and drops a leading staff greeting',async()=>{
 const c=scripted(say('ok'));
 await bot.ceeTurn([{sender:'staff',body:'Welcome'},{sender:'visitor',body:'a'},{sender:'visitor',body:'b'},{sender:'staff',body:'c'},{sender:'visitor',body:'d'}],c,{tools});
 assert.deepEqual(c.calls[0].messages.map((m)=>[m.role,m.content]),[['user','a\n\nb'],['assistant','c'],['user','d']]);
});
test('Non stays quiet when the last message is not from the customer',async()=>{
 const c=scripted();assert.equal((await bot.ceeTurn([{sender:'visitor',body:'hi'},{sender:'staff',body:'hello'}],c,{tools})).reply,null);assert.equal(c.calls.length,0);
});
test('prices come only from the quote tool result',async()=>{
 const c=scripted(use('quote_transfer',{pickup:'Suvarnabhumi',dropoff:'Hilton Pattaya',date:'2026-10-05',time:'10:00',passengers:2,bags:2}),say('Economy sedan ฿1,800'));
 const out=await bot.ceeTurn([{sender:'visitor',body:questions[1].message}],c,{tools});
 assert.equal(out.reply,'Economy sedan ฿1,800');
 const result=c.calls[1].messages.at(-1).content[0];assert.equal(result.type,'tool_result');assert.equal(JSON.parse(result.content).cars[0].price,1800);
});
test('a pricing failure becomes a handover instruction, not a guess',async()=>{
 const c=scripted(use('quote_transfer',{pickup:'x',dropoff:'y',date:'2026-10-05',time:'10:00',passengers:2,bags:2}),say('Let me pass you to the team.'));
 await bot.ceeTurn([{sender:'visitor',body:'x to y'}],c,{tools:{...tools,quoteTransfer:async()=>{throw new Error('maps down');}}});
 assert.equal(JSON.parse(c.calls[1].messages.at(-1).content[0].content).handover,true);
});
test('the handover tool and a refusal both hand over',async()=>{
 const h=await bot.ceeTurn([{sender:'visitor',body:'I want a refund'}],scripted(use('handover',{reason:'refund',summary:'Refund for WD-1'}),say('A team member will reply soon.')),{tools});
 assert.deepEqual(h.handover,{reason:'refund',summary:'Refund for WD-1'});assert.equal(h.reply,'A team member will reply soon.');
 const r=await bot.ceeTurn([{sender:'visitor',body:'?'}],scripted({stop_reason:'refusal',content:[]}),{tools});assert.equal(r.reply,null);assert.ok(r.handover);
});
test('booking links carry rebook=chat with date and time',()=>{
 const u=new URL(bookingLink({service:'transfer',pickup:'BKK',dropoff:'Pattaya',date:'2026-10-05',time:'10:00',passengers:2,luggage:2,vehicle:'economy_sedan'}));
 assert.equal(u.searchParams.get('rebook'),'chat');assert.equal(u.searchParams.get('date'),'2026-10-05');assert.equal(u.searchParams.get('time'),'10:00');assert.equal(u.hash,'#booking-search');
});
test('all 100 planned questions are in the fixture',()=>{
 assert.equal(questions.length,100);assert.deepEqual(questions.map((q)=>q.n),Array.from({length:100},(_,i)=>i+1));assert.ok(questions.every((q)=>q.message&&q.expect));
});

const now=new Date().toISOString(),later=new Date(Date.now()+86400000).toISOString();
let n=0;
async function conversation(text){const id=`cee-${++n}`;await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status) VALUES(?,?,?,?,?,?,?)').bind(id,id,later,now,now,`WD-1000${n}`,'open').run();await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES(?,?,'visitor',?,?)").bind(id+'-m',id,text,now).run();return id;}
const row=(id)=>db.prepare('SELECT assigned_name,bot_paused,bot_state FROM website_conversations WHERE id=?').bind(id).first();
const replies=(id)=>db.prepare("SELECT sender_name,is_bot,body FROM website_chat_messages WHERE conversation_id=? AND sender='staff' ORDER BY rowid").bind(id).all().then((r)=>r.results);

test('Non replies as "Non", marked as a bot, without taking the chat',async()=>{
 const id=await conversation('How much from BKK to Pattaya?');
 await bot.runCee(id,{client:scripted(say('Sure! What date and time?'))});
 assert.deepEqual(await replies(id),[{sender_name:'Non',is_bot:1,body:'Sure! What date and time?'}]);
 assert.equal((await row(id)).assigned_name,null);
});
test('a staff reply or assignment silences Non in that chat',async()=>{
 const id=await conversation('hello');
 await chat.addStaffMessage(id,'Hi, Anna here',{name:'Anna',staffId:'anna'},'dashboard');
 assert.equal((await row(id)).bot_paused,1);
 const c=scripted(say('should not send'));await bot.runCee(id,{client:c});assert.equal(c.calls.length,0);
 const id2=await conversation('hello');await chat.assign(id2,{name:'Ben'},true);assert.equal((await row(id2)).bot_paused,1);
});
test('asking for a person hands over without calling the model (English, Thai, Chinese)',async()=>{
 for(const text of ['Can I talk to a real person?','ขอคุยกับเจ้าหน้าที่','我要人工客服']){
  const id=await conversation(text);const c=scripted();await bot.runCee(id,{client:c});
  assert.equal(c.calls.length,0);const r=await row(id);assert.equal(r.bot_paused,0);assert.match(r.bot_state,/Customer asked for a person/);assert.equal((await replies(id))[0].sender_name,'Non');
 }
});
test('a model error alerts staff, says nothing wrong to the customer, and Non keeps answering until someone assigns',async()=>{
 const id=await conversation('BKK to Pattaya');await bot.runCee(id,{client:scripted()});
 const r=await row(id);assert.equal(r.bot_paused,0);assert.match(r.bot_state,/Non error/);assert.equal((await replies(id)).length,0);
});
test('Non is off without an API key or when switched off',async()=>{
 globalThis.__ceeTest.env.ANTHROPIC_API_KEY=undefined;assert.equal(await bot.ceeEnabled(),false);globalThis.__ceeTest.env.ANTHROPIC_API_KEY='test-key';
 await bot.setCeeEnabled(false);const id=await conversation('hi');const c=scripted(say('x'));await bot.runCee(id,{client:c});assert.equal(c.calls.length,0);
 await bot.setCeeEnabled(true);assert.equal(await bot.ceeEnabled(),true);
});

test('auto mode answers simple messages with the fast model, without Opus-only options',async()=>{
 const c=scripted({...say('Hello! Where are you going?'),usage:{input_tokens:3000,output_tokens:100}});
 const out=await bot.ceeTurn([{sender:'visitor',body:'hi'}],c,{tools,mode:'auto'});
 assert.equal(c.calls[0].model,'claude-haiku-4-5');assert.equal(c.calls[0].fallbacks,undefined);assert.equal(c.calls[0].output_config,undefined);
 assert.ok(c.calls[0].tools.some((t)=>t.name==='escalate'));assert.equal(c.calls[0].system[0].cache_control.type,'ephemeral');
 assert.equal(out.model,'claude-haiku-4-5');assert.ok(Math.abs(out.usd-0.0035)<1e-9);
});
test('the fast model escalates trip planning to Opus, which starts the turn fresh',async()=>{
 const c=scripted(use('escalate',{why:'multi-day plan'}),say('Here is a plan…'));
 const out=await bot.ceeTurn([{sender:'visitor',body:questions.find((q)=>q.group==='Undecided').message}],c,{tools,mode:'auto'});
 assert.equal(c.calls[1].model,'claude-opus-5-5');assert.ok(!c.calls[1].tools.some((t)=>t.name==='escalate'));assert.equal(c.calls[1].messages.length,1);
 assert.equal(out.reply,'Here is a plan…');assert.equal(out.model,'claude-opus-5-5');
});
test('the "checking prices" line is sent before the quote runs',async()=>{
 const order=[];const c=scripted({stop_reason:'tool_use',content:[{type:'text',text:'Checking prices for Marriott Thong Lor → Suvarnabhumi…'},{type:'tool_use',id:'t1',name:'quote_transfer',input:{pickup:'Marriott Thong Lor',dropoff:'Suvarnabhumi',date:'2026-10-05',time:'09:00',passengers:2,bags:2}}]},say('Economy sedan ฿1,800'));
 await bot.ceeTurn([{sender:'visitor',body:'we live in marriott thong lor how much to airport tomorrow 9am 2 people 2 bags'}],c,{tools:{...tools,quoteTransfer:async(i)=>{order.push('quote');return tools.quoteTransfer(i);}},onProgress:async(t)=>order.push(t)});
 assert.deepEqual(order,['Checking prices for Marriott Thong Lor → Suvarnabhumi…','quote']);
});

const know=await vite.ssrLoadModule('/lib/cee/knowledge.ts');
test('Markdown / Obsidian import splits notes by heading and reads kind and city',()=>{
 const notes=know.parseMarkdown('---\ntags: x\n---\n# Child seats\nkind: rule\n฿300 each, ask age.\n\n## Cafés in [[Thong Lor|Thonglor]]\ncity: Bangkok\nkind: place\nRoots at The Commons.\n');
 assert.deepEqual(notes.map((n)=>[n.title,n.kind,n.city,n.body]),[['Child seats','rule',null,'฿300 each, ask age.'],['Cafés in [[Thong Lor|Thonglor]]','place','bangkok','Roots at The Commons.']]);
 assert.equal(know.parseMarkdown('No heading here','My file')[0].title,'My file');
});
test('search_knowledge finds live notes and attractions, never drafts',async()=>{
 await know.saveNote({title:'Child seats',kind:'rule',body:'Baby and child seats cost ฿300 each.'});
 await know.saveNote({title:'Secret draft',kind:'rule',body:'baby seat draft text',active:false});
 await know.saveNote({title:'Cafes in Thong Lor',kind:'place',city:'bangkok',body:'Roots coffee at The Commons'});
 await db.prepare("INSERT INTO attractions(id,name,area,category,description) VALUES('a1','Grand Palace','bangkok','temple','Dress code: covered shoulders and knees.')").run();
 const seat=await know.searchKnowledge('baby seat');assert.equal(seat.notes[0].title,'Child seats');assert.ok(!seat.notes.some((n)=>n.title==='Secret draft'));
 assert.equal((await know.searchKnowledge('cafe thong lor','bangkok')).notes[0].title,'Cafes in Thong Lor');
 assert.equal((await know.searchKnowledge('grand palace dress code')).places[0].name,'Grand Palace');
 assert.deepEqual(await know.searchKnowledge('zzzz'),{notes:[],places:[]});
});

test('the website shows "Non is typing…" while Non works',async()=>{
 const customer=await vite.ssrLoadModule('/app/api/chat/route.ts');const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
 const token='c'.repeat(48);await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status) VALUES(?,?,?,?,?,?,?)').bind('typing-1',await sha256(token),later,now,now,'WD-77777','open').run();
 const get=async()=>(await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:`waydidi_chat=${token}`}}))).json()).conversation.typing;
 assert.equal(await get(),false);await chat.setBotThinking('typing-1',true);assert.equal(await get(),true);await chat.setBotThinking('typing-1',false);assert.equal(await get(),false);
});

// WhatsApp and LINE: signed webhooks in, replies out through the same conversation and Non.
const sent=[];const realFetch=globalThis.fetch;
const tgCalls=[];let tg429=0;
globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://api.telegram.org')){const m=u.split('/').pop();if(tg429>0){tg429--;return new Response(JSON.stringify({ok:false,description:'Too Many Requests',parameters:{retry_after:1}}),{status:429});}tgCalls.push({method:m,body:JSON.parse(init.body)});return new Response(JSON.stringify({ok:true,result:{message_id:900+tgCalls.length,chat:{id:1}}}));}if(u.startsWith('https://graph.facebook.com')||u.startsWith('https://api.line.me')){sent.push({url:u,body:init?.body?JSON.parse(init.body):null});return new Response(JSON.stringify(u.includes('/profile/')?{displayName:'Nok'}:{messages:[{id:'wamid.out'}]}),{status:200});}return realFetch(url,init);};
after(()=>{globalThis.fetch=realFetch;});
const sign=async(secret,body,enc)=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));return enc==='hex'?[...mac].map((b)=>b.toString(16).padStart(2,'0')).join(''):btoa(String.fromCharCode(...mac));};
test('WhatsApp: verification, signature check, one conversation per number, Non replies on WhatsApp',async()=>{
 Object.assign(globalThis.__ceeTest.env,{WHATSAPP_TOKEN:'t',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_APP_SECRET:'shh',WHATSAPP_VERIFY_TOKEN:'verify-me'});
 const wa=await vite.ssrLoadModule('/app/api/integrations/whatsapp/webhook/route.ts');
 assert.equal(await (await wa.GET(new Request('https://x/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42'))).text(),'42');
 assert.equal((await wa.GET(new Request('https://x/api/integrations/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42'))).status,403);
 await bot.setCeeEnabled(false); // inbound only first
 const payload=(id,text)=>JSON.stringify({entry:[{changes:[{value:{contacts:[{wa_id:'66812345678',profile:{name:'Somchai'}}],messages:[{from:'66812345678',id,type:'text',text:{body:text}}]}}]}]});
 const post=async(body,sig)=>wa.POST(new Request('https://x/api/integrations/whatsapp/webhook',{method:'POST',headers:{'x-hub-signature-256':sig},body}));
 assert.equal((await post(payload('wamid.1','hi'),'sha256=bad')).status,401);
 let b=payload('wamid.1','How much BKK to Pattaya?');assert.equal((await post(b,'sha256='+await sign('shh',b,'hex'))).status,200);
 assert.equal((await post(b,'sha256='+await sign('shh',b,'hex'))).status,200); // Meta retry: no duplicate
 b=payload('wamid.2','tomorrow 10am');await post(b,'sha256='+await sign('shh',b,'hex'));
 const convs=(await db.prepare("SELECT id,customer_name,customer_phone,source_title FROM website_conversations WHERE channel='whatsapp' AND channel_user_id='66812345678'").all()).results;
 assert.equal(convs.length,1);assert.equal(convs[0].customer_name,'Somchai');assert.equal(convs[0].customer_phone,'+66812345678');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id=?").bind(convs[0].id).first()).n,2);
 await chat.addBotMessage(convs[0].id,'Sure! How many people?');
 const out=sent.filter((x)=>x.body?.type==='text').at(-1);assert.equal(out.url,'https://graph.facebook.com/v21.0/123/messages');assert.deepEqual([out.body.to,out.body.text.body],['66812345678','Sure! How many people?']);
 await bot.setCeeEnabled(true);
});
test('LINE: signature check, display name, staff replies pushed to LINE',async()=>{
 Object.assign(globalThis.__ceeTest.env,{LINE_CHANNEL_ACCESS_TOKEN:'lt',LINE_CHANNEL_SECRET:'ls'});
 await bot.setCeeEnabled(false);
 const ln=await vite.ssrLoadModule('/app/api/integrations/line/webhook/route.ts');
 const body=JSON.stringify({events:[{type:'message',source:{type:'user',userId:'U1'},message:{id:'m1',type:'text',text:'สวัสดีค่ะ'}},{type:'message',source:{type:'group',userId:'U2'},message:{id:'m2',type:'text',text:'group chat'}}]});
 assert.equal((await ln.POST(new Request('https://x/api/integrations/line/webhook',{method:'POST',headers:{'x-line-signature':'bad'},body}))).status,401);
 assert.equal((await ln.POST(new Request('https://x/api/integrations/line/webhook',{method:'POST',headers:{'x-line-signature':await sign('ls',body,'b64')},body}))).status,200);
 const c=await db.prepare("SELECT id,customer_name FROM website_conversations WHERE channel='line' AND channel_user_id='U1'").first();assert.equal(c.customer_name,'Nok');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_conversations WHERE channel_user_id='U2'").first()).n,0);
 await chat.addStaffMessage(c.id,'สวัสดีค่ะ Anna here',{name:'Anna',staffId:'anna'},'dashboard');
 const push=sent.filter((x)=>x.url.endsWith('/message/push')).at(-1);assert.deepEqual([push.body.to,push.body.messages[0].text],['U1','สวัสดีค่ะ Anna here']);
 await bot.setCeeEnabled(true);
});
test('by default every message uses Haiku 4.5, with no escalation',async()=>{
 const c=scripted(say('Hi, I am Non!'));await bot.ceeTurn([{sender:'visitor',body:'hello'}],c,{tools});
 assert.equal(c.calls[0].model,'claude-haiku-4-5');assert.ok(!c.calls[0].tools.some((t)=>t.name==='escalate'));assert.match(c.calls[0].system[0].text,/^You are Non,/);
 assert.equal(await bot.modelMode(),'fast');
});

// ---- Scaling: 5 s wait, one run per chat, Telegram volume, LINE free replies ----
const visitor=async(id,body)=>{await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES(?,?,'visitor',?,?)").bind(crypto.randomUUID(),id,body,new Date().toISOString()).run();return bot.latestVisitorSeq(id);};
const slow=(ms,...responses)=>{const c=scripted(...responses);const create=c.beta.messages.create;c.beta.messages.create=async(b)=>{await new Promise((r)=>setTimeout(r,ms));return create(b);};return c;};

test('quick messages in a row get one reply: older scheduled runs stand down',async()=>{
 const id=await conversation('hi');const s1=await bot.latestVisitorSeq(id);const s2=await visitor(id,'to Pattaya');const s3=await visitor(id,'tomorrow 10am');
 const c=scripted(say('Got it: Pattaya tomorrow at 10:00. How many people?'));
 await Promise.all([bot.runCee(id,{client:c,expectSeq:s1}),bot.runCee(id,{client:c,expectSeq:s2}),bot.runCee(id,{client:c,expectSeq:s3})]);
 assert.equal(c.calls.length,1);assert.equal(c.calls[0].messages.at(-1).content,'hi\n\nto Pattaya\n\ntomorrow 10am');assert.equal((await replies(id)).length,1);
});
test('only one Non run per chat at a time',async()=>{
 const id=await conversation('BKK to Pattaya');const c=slow(150,say('When?'),say('second'));
 await Promise.all([bot.runCee(id,{client:c}),bot.runCee(id,{client:c})]);
 assert.equal(c.calls.length,1);assert.equal((await replies(id)).length,1);
 assert.equal((await db.prepare('SELECT bot_lock_until,bot_thinking_at FROM website_conversations WHERE id=?').bind(id).first()).bot_lock_until,null);
});
test('a message that arrives while Non is answering is answered next',async()=>{
 const id=await conversation('BKK to Pattaya');const c=scripted(say('When are you travelling?'),say('Thanks! How many bags?'));
 const create=c.beta.messages.create;let first=true;c.beta.messages.create=async(b)=>{if(first){first=false;await visitor(id,'tomorrow 9am, 3 people');}return create(b);};
 await bot.runCee(id,{client:c});
 assert.deepEqual((await replies(id)).map((r)=>r.body),['When are you travelling?','Thanks! How many bags?']);
});
test('scheduling hands the chat to its Durable Object and shows typing at once',async()=>{
 const schedule=await vite.ssrLoadModule('/lib/cee/schedule.ts');const seen=[];
 globalThis.__ceeTest.env.NON_AGENT={idFromName:(n)=>n,get:(n)=>({fetch:async(u,init)=>{seen.push([n,init.body]);return new Response('scheduled');}})};
 const id=await conversation('hello');await schedule.scheduleNon(id);
 assert.deepEqual(seen,[[id,id]]);assert.ok((await db.prepare('SELECT bot_thinking_at t FROM website_conversations WHERE id=?').bind(id).first()).t);
 delete globalThis.__ceeTest.env.NON_AGENT;assert.equal(schedule.WAIT_MS,5000);
});
test('while Non answers, the group gets nothing (no customer messages, no Non replies); staff replies are still mirrored; waits out a short 429',async()=>{
 Object.assign(globalThis.__ceeTest.env,{TELEGRAM_BOT_TOKEN:'x',TELEGRAM_CHAT_ID:'-100'});
 const id=await conversation('hi');tgCalls.length=0;
 await chat.addVisitorMessage(await db.prepare('SELECT * FROM website_conversations WHERE id=?').bind(id).first(),'How much to Pattaya?','c-skip-1');
 assert.equal(tgCalls.filter((c)=>c.method==='sendMessage').length,0);
 assert.equal((await db.prepare("SELECT telegram_status FROM website_chat_messages WHERE client_id='c-skip-1'").first()).telegram_status,'skipped');
 await chat.addBotMessage(id,'Hello from Non');assert.equal(tgCalls.filter((c)=>c.method==='sendMessage').length,0);
 await db.prepare('UPDATE website_conversations SET telegram_message_id=500 WHERE id=?').bind(id).run();
 tg429=1;await chat.addStaffMessage(id,'Anna here',{name:'Anna',staffId:'anna'},'dashboard');
 assert.ok(tgCalls.some((c)=>c.method==='sendMessage'&&/Anna here/.test(c.body.text)));
 delete globalThis.__ceeTest.env.TELEGRAM_BOT_TOKEN;delete globalThis.__ceeTest.env.TELEGRAM_CHAT_ID;
});
test('the Telegram card is refreshed at most every 30 s, except for status and assignment changes',async()=>{
 Object.assign(globalThis.__ceeTest.env,{TELEGRAM_BOT_TOKEN:'x',TELEGRAM_CHAT_ID:'-100'});
 const id=await conversation('hi');await db.prepare('UPDATE website_conversations SET telegram_message_id=501 WHERE id=?').bind(id).run();
 tgCalls.length=0;await chat.refreshCard(id);await chat.refreshCard(id);await chat.refreshCard(id);
 assert.equal(tgCalls.filter((c)=>c.method==='editMessageText').length,1);
 await chat.setStatus(id,'pending');assert.equal(tgCalls.filter((c)=>c.method==='editMessageText').length,2);
 delete globalThis.__ceeTest.env.TELEGRAM_BOT_TOKEN;delete globalThis.__ceeTest.env.TELEGRAM_CHAT_ID;
});
test('LINE: the free reply token is used once, then push',async()=>{
 Object.assign(globalThis.__ceeTest.env,{LINE_CHANNEL_ACCESS_TOKEN:'lt',LINE_CHANNEL_SECRET:'ls'});await bot.setCeeEnabled(false);
 const ln=await vite.ssrLoadModule('/app/api/integrations/line/webhook/route.ts');
 const body=JSON.stringify({events:[{type:'message',replyToken:'rt-1',source:{type:'user',userId:'U9'},message:{id:'m9',type:'text',text:'hi'}}]});
 await ln.POST(new Request('https://x/api/integrations/line/webhook',{method:'POST',headers:{'x-line-signature':await sign('ls',body,'b64')},body}));
 const c=await db.prepare("SELECT id FROM website_conversations WHERE channel_user_id='U9'").first();
 sent.length=0;await chat.addBotMessage(c.id,'Hello! Where to?');await chat.addBotMessage(c.id,'Second message');
 assert.deepEqual(sent.filter((x)=>x.url.includes('/message/')).map((x)=>[x.url.split('/').pop(),x.body.replyToken??x.body.to]),[['reply','rt-1'],['push','U9']]);
 await bot.setCeeEnabled(true);
});
test('website send limit is 60 messages per 15 minutes per connection',async()=>{
 const src=await readFile(root+'/app/api/chat/route.ts','utf8');assert.match(src,/attempts<60/);
});
test('load: 60 chats (20 each on website, WhatsApp, LINE), 3 quick messages each, one reply per chat',async()=>{
 const chats=[];for(let i=0;i<60;i++)chats.push(await conversation(`chat ${i}: hi`));
 const channels=['web','whatsapp','line'];for(let i=0;i<60;i++)await db.prepare('UPDATE website_conversations SET channel=? WHERE id=?').bind(channels[i%3],chats[i]).run();
 let calls=0;const client={beta:{messages:{create:async(b)=>{calls++;await new Promise((r)=>setTimeout(r,20+Math.random()*80));return say(`Answer to: ${b.messages.at(-1).content.split('\n\n').length} messages`);}}}};
 const jobs=[];const t0=Date.now();
 for(const id of chats){const s1=await bot.latestVisitorSeq(id);jobs.push(bot.runCee(id,{client,expectSeq:s1}));const s2=await visitor(id,'to Pattaya');jobs.push(bot.runCee(id,{client,expectSeq:s2}));const s3=await visitor(id,'tomorrow');jobs.push(bot.runCee(id,{client,expectSeq:s3}));}
 await Promise.all(jobs);const ms=Date.now()-t0;
 for(const id of chats){const r=await replies(id);assert.equal(r.length,1,`chat ${id}`);assert.equal(r[0].body,'Answer to: 3 messages');}
 assert.equal(calls,60);console.log(`# load: 60 chats × 3 messages → 60 replies, ${calls} model calls, ${ms} ms total (model simulated at 20–100 ms)`);
});

// ---- Booking in the chat: payment link with the server's price, then a confirmed booking ----
test('website chat booking: summary → yes → payment link at the server price → test payment → confirmed booking in chat',async()=>{
 await db.exec("CREATE TABLE IF NOT EXISTS bookings(reference TEXT PRIMARY KEY,customer_name TEXT,customer_email TEXT,customer_phone TEXT,pickup TEXT,dropoff TEXT,pickup_date TEXT,pickup_time TEXT,passengers INTEGER,luggage INTEGER,vehicle TEXT,payment_method TEXT,total INTEGER,status TEXT,payment_status TEXT,amount_paid INTEGER,access_token_hash TEXT,service_type TEXT,booked_hours INTEGER,created_at TEXT,updated_at TEXT);");
 await db.exec("CREATE TABLE IF NOT EXISTS booking_sources(booking_reference TEXT PRIMARY KEY,source TEXT,created_at TEXT);");
 const pay=await vite.ssrLoadModule('/lib/chat-pay.ts');const route=await vite.ssrLoadModule('/app/api/chat-pay/[id]/route.ts');
 const id=await conversation('Hello, how much for BKK airport to Sheraton Grande Asok tomorrow 10am, 2 people 2 bags?');
 await db.prepare("UPDATE website_conversations SET customer_email='guest@example.com' WHERE id=?").bind(id).run();
 // Payments off: Non doesn't get the booking tool at all
 delete globalThis.__ceeTest.env.PAYSO_TEST_MODE;assert.equal(pay.chatPaymentsEnabled(),false);
 const off=scripted(say('ok'));await bot.ceeTurn([{sender:'visitor',body:'book it'}],off,{tools});assert.ok(!off.calls[0].tools.some((t)=>t.name==='send_payment_link'));
 globalThis.__ceeTest.env.PAYSO_TEST_MODE='1';
 const quotes={quoteTransfer:async()=>({ok:true,kind:'transfer',summary:'Suvarnabhumi → Sheraton Grande Asok',cars:[{vehicle:'economy_sedan',name:'Economy sedan',seats:2,bags:2,price:1100,bookUrl:'x'},{vehicle:'comfort_suv',name:'Comfort SUV',seats:4,bags:4,price:1700,bookUrl:'y'}],notes:[]}),quoteHourly:async()=>({ok:false,reason:'n/a',handover:true})};
 const history=[{sender:'visitor',body:'Hello, how much for BKK airport to Sheraton Grande Asok tomorrow 10am, 2 people 2 bags?'},{sender:'staff',body:'Economy sedan ฿1,100 · Comfort SUV ฿1,700'},
  {sender:'visitor',body:'I want to book the Comfort SUV. Anna Lee, +66 81 234 5678'},{sender:'staff',body:'Summary: BKK → Sheraton Grande Asok, 2026-10-06 10:00, 2 people, 2 bags, Comfort SUV ฿1,700. Shall I send the payment link?'},{sender:'visitor',body:'Yes please'}];
 // The model even claims a lower price; the link uses the server's quote.
 const c=scripted(use('send_payment_link',{kind:'transfer',pickup:'Suvarnabhumi Airport',dropoff:'Sheraton Grande Sukhumvit Asok',city:'',hours:0,date:'2026-10-06',time:'10:00',passengers:2,bags:2,vehicle:'comfort_suv',lead_name:'Anna Lee',lead_phone:'+66 81 234 5678',price:500}),say('Here is your payment link'));
 const turn=await bot.ceeTurn(history,c,{tools,payLink:(i)=>pay.createChatPaymentLink(id,i,quotes)});
 assert.match(c.calls[0].system[0].text,/send_payment_link/);assert.ok(c.calls[0].tools.some((t)=>t.name==='send_payment_link'));
 const result=JSON.parse(c.calls[1].messages.at(-1).content[0].content);
 assert.equal(result.ok,true);assert.equal(result.amount,1700);assert.match(result.url,/\/chat-pay\/[a-f0-9]{32}$/);assert.equal(turn.reply,'Here is your payment link');
 const linkId=result.url.split('/').pop();
 const post=(action)=>route.POST(new Request(`https://example.invalid/api/chat-pay/${linkId}`,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({action})}),{params:Promise.resolve({id:linkId})});
 // Customer pays (test mode)
 const paid=await post('test_pay');assert.equal(paid.status,200);const {reference}=await paid.json();
 const b=await db.prepare('SELECT * FROM bookings WHERE reference=?').bind(reference).first();
 assert.deepEqual([b.status,b.payment_status,b.total,b.amount_paid,b.vehicle,b.customer_name,b.customer_email],['confirmed','paid',1700,1700,'comfort_suv','Anna Lee','guest@example.com']);
 assert.equal((await db.prepare('SELECT source FROM booking_sources WHERE booking_reference=?').bind(reference).first()).source,'chat');
 const last=(await replies(id)).at(-1);assert.equal(last.sender_name,'Non');assert.match(last.body,new RegExp(`booking ${reference} is confirmed`));
 // Paying twice doesn't book twice
 assert.equal((await post('test_pay')).status,410);assert.equal((await db.prepare('SELECT COUNT(*) n FROM bookings').first()).n,1);
 // Missing details are asked for, not guessed
 const bad=await pay.createChatPaymentLink(id,{kind:'transfer',pickup:'a',dropoff:'b',city:'',hours:0,date:'2026-10-06',time:'10:00',passengers:2,bags:2,vehicle:'comfort_suv',leadName:'Anna',leadPhone:''},quotes);
 assert.equal(bad.ok,false);assert.match(bad.reason,/phone/);
 // Test payments are refused once test mode is off
 const again=await pay.createChatPaymentLink(id,{kind:'transfer',pickup:'a',dropoff:'b',city:'',hours:0,date:'2026-10-06',time:'10:00',passengers:2,bags:2,vehicle:'economy_sedan',leadName:'Anna Lee',leadPhone:'+66 81 234 5678'},quotes);
 delete globalThis.__ceeTest.env.PAYSO_TEST_MODE;
 const id2=again.url.split('/').pop();
 const r2=await route.POST(new Request(`https://example.invalid/api/chat-pay/${id2}`,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({action:'test_pay'})}),{params:Promise.resolve({id:id2})});
 assert.equal(r2.status,403);
});
test('website chat shows quotes, payment links and confirmations as rich cards (text kept for other channels)',async()=>{
 const cards=await vite.ssrLoadModule('/lib/chat-cards.ts');
 const id=await conversation('BKK to Pattaya tomorrow 10:00, 2 people 2 bags');
 const c=scripted(use('quote_transfer',{pickup:'BKK',dropoff:'Pattaya',date:'2026-10-06',time:'10:00',passengers:2,bags:2}),say('Here are your options:'));
 await bot.runCee(id,{client:c,tools});
 assert.match(c.calls[0].system[0].text,/cards with buttons/);
 const rows=(await db.prepare("SELECT body,card_json FROM website_chat_messages WHERE conversation_id=? AND sender='staff' ORDER BY rowid").bind(id).all()).results;
 assert.equal(rows[0].body,'Here are your options:');
 const card=cards.parseCard(rows[1].card_json);assert.equal(card.type,'quote');assert.equal(card.cars[0].price,1800);assert.match(rows[1].body,/Economy sedan: THB 1,800/);
 const customer=await vite.ssrLoadModule('/app/api/chat/route.ts');const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
 const tok='d'.repeat(48);await db.prepare('UPDATE website_conversations SET token_hash=? WHERE id=?').bind(await sha256(tok),id).run();
 const data=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:`waydidi_chat=${tok}`}}))).json();
 assert.equal(data.messages.find((m)=>m.card)?.card.type,'quote');
 // WhatsApp/LINE get no card (the text already has the prices and links)
 const wa=await conversation('BKK to Pattaya');await db.prepare("UPDATE website_conversations SET channel='whatsapp' WHERE id=?").bind(wa).run();
 await bot.runCee(wa,{client:scripted(use('quote_transfer',{pickup:'BKK',dropoff:'Pattaya',date:'2026-10-06',time:'10:00',passengers:2,bags:2}),say('Economy ฿1,800')),tools});
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id=? AND card_json IS NOT NULL").bind(wa).first()).n,0);
 // Unsafe or malformed cards are never shown
 assert.equal(cards.parseCard(JSON.stringify({type:'quote',title:'x',cars:[{name:'a',price:1,url:'javascript:alert(1)'}]})),null);
 assert.equal(cards.parseCard('not json'),null);
});

test('while Non answers, the Telegram card says so and offers Take over; after a handover it asks for a person',async()=>{
 const cards=await vite.ssrLoadModule('/lib/telegram/cards.ts');
 const c={id:'c1',public_id:'WD_chat_1',status:'open',customer_name:null,customer_email:'a@b.co',customer_phone:null,source_title:null,source_url:null,topic:null,assigned_name:null,created_at:new Date().toISOString()};
 assert.match(cards.conversationCard(c,null,true,true),/Non \(AI\) is answering/);
 assert.deepEqual(cards.conversationKeyboard(c,'https://x',true).flat().map((b)=>b.text),['Take over','Open in Admin']);
 assert.deepEqual(cards.conversationKeyboard(c,'https://x',false).flat().map((b)=>b.text),['Assign','Let other assign']);
});
test('handover: a "Needs a person" card with Assign and Wait; Wait tells the customer and the card comes back after 10 minutes',async()=>{
 Object.assign(globalThis.__ceeTest.env,{TELEGRAM_BOT_TOKEN:'x',TELEGRAM_CHAT_ID:'-100'});
 const ho=await vite.ssrLoadModule('/lib/telegram/handover.ts');
 const id=await conversation('Can I talk to a real person?');await db.prepare('UPDATE website_conversations SET telegram_message_id=700 WHERE id=?').bind(id).run();
 tgCalls.length=0;await bot.runCee(id,{client:scripted()});
 const card=tgCalls.find((c)=>c.method==='sendMessage'&&/Needs a person/.test(c.body.text));
 assert.ok(card);assert.deepEqual(card.body.reply_markup.inline_keyboard.flat().map((b)=>b.text),['Assign','Wait']);
 assert.equal((await row(id)).bot_paused,0); // Non keeps answering until someone assigns
 assert.match(await ho.waitHandover(id,'Alex'),/Reminder in 10 minutes/);
 const last=(await replies(id)).at(-1);assert.match(last.body,/Thanks for waiting/);
 tgCalls.length=0;assert.equal(await ho.remindWaiting(new Date()),0);
 assert.equal(await ho.remindWaiting(new Date(Date.now()+11*60_000)),1);
 assert.ok(tgCalls.some((c)=>c.method==='sendMessage'&&/reminder/.test(c.body.text)));
 delete globalThis.__ceeTest.env.TELEGRAM_BOT_TOKEN;delete globalThis.__ceeTest.env.TELEGRAM_CHAT_ID;
});
test('every message Non cannot answer posts its own Assign/Wait card',async()=>{
 Object.assign(globalThis.__ceeTest.env,{TELEGRAM_BOT_TOKEN:'x',TELEGRAM_CHAT_ID:'-100'});
 const id=await conversation('Can I talk to a real person?');await db.prepare('UPDATE website_conversations SET telegram_message_id=701 WHERE id=?').bind(id).run();
 tgCalls.length=0;await bot.runCee(id,{client:scripted()});
 await chat.addVisitorMessage(await db.prepare('SELECT * FROM website_conversations WHERE id=?').bind(id).first(),'I want a human please',null);
 await bot.runCee(id,{client:scripted()});
 const cards=tgCalls.filter((c)=>c.method==='sendMessage'&&/Needs a person/.test(c.body.text));
 assert.equal(cards.length,2);for(const c of cards)assert.deepEqual(c.body.reply_markup.inline_keyboard.flat().map((b)=>b.text),['Assign','Wait']);
 delete globalThis.__ceeTest.env.TELEGRAM_BOT_TOKEN;delete globalThis.__ceeTest.env.TELEGRAM_CHAT_ID;
});
test('restaurant recommendations: Non uses find_places and the chat gets a places card with ratings and map links',async()=>{
 const found={ok:true,places:[{name:'Baan Ice',kind:'Thai restaurant',rating:4.6,reviews:2100,price:'฿฿',address:'Sukhumvit 55, Bangkok',openNow:true,mapsUrl:'https://maps.google.com/?cid=1',photo:'/api/places/photo?n=x&s=y',summary:'Southern Thai home cooking'}]};
 const c=scripted({content:[{type:'tool_use',id:'t1',name:'find_places',input:{query:'authentic Thai restaurant',near:'CentralWorld Bangkok'}}],stop_reason:'tool_use'},say('My top pick is Baan Ice. Want a car there?'));
 const out=await bot.ceeTurn([{sender:'visitor',body:'Best authentic Thai restaurant near CentralWorld?'}],c,{tools:{...tools,findPlaces:async()=>found}});
 assert.equal(out.cards[0].type,'places');assert.equal(out.cards[0].items[0].rating,4.6);assert.match(out.reply,/Baan Ice/);
 const card=(await vite.ssrLoadModule('/lib/chat-cards.ts'));assert.ok(card.parseCard(JSON.stringify(out.cards[0])));assert.match(card.cardText(out.cards[0]),/Baan Ice \(4.6★/);
});
test('place searches: limited per chat, repeats are free from the 24 h cache',async()=>{
 const guard=await vite.ssrLoadModule('/lib/cee/guard.ts');
 await guard.saveLimits({perChat:2});
 let calls=0;const findPlaces=async()=>{calls++;return {ok:true,places:[{name:'A',kind:null,rating:4.5,reviews:100,price:null,address:'Sukhumvit',openNow:true,mapsUrl:'https://maps.google.com/?cid=9',photo:null,summary:null,distanceKm:0.4}]};};
 const ask=(q)=>bot.ceeTurn([{sender:'visitor',body:q}],scripted({content:[{type:'tool_use',id:'t',name:'find_places',input:{query:q,near:'Hilton Sukhumvit'}}],stop_reason:'tool_use'},say('ok')),{tools:{...tools,findPlaces},placeGuard:{conversationId:'lim-1',actor:'chat:lim-1'}});
 await ask('thai food');await ask('thai food');assert.equal(calls,1); // second is the saved result
 await ask('rooftop bar');assert.equal(calls,2);
 const blocked=await ask('night market');assert.equal(calls,2);assert.equal(blocked.cards.length,0); // limit of 2 paid searches
 await guard.saveLimits({perChat:20});
});
test('alerts come first: stop-selling areas are not quoted, warn areas get a note on the card and in places',async()=>{
 const now=new Date().toISOString();const alerts=[{id:'a1',title:'Flooding in Ayutthaya',message:'Roads near the old city are flooded.',areas:'Ayutthaya',effect:'stop',starts_at:now,ends_at:null,source_url:null,active:1},{id:'a2',title:'Songkran traffic',message:'Expect delays.',areas:'Pattaya',effect:'warn',starts_at:now,ends_at:null,source_url:null,active:1}];
 const q=(dropoff)=>({ok:true,kind:'transfer',summary:`BKK → ${dropoff}, 2026-12-01 at 10:00, 2 passengers, 2 bags`,cars:[{vehicle:'economy_sedan',name:'Economy sedan',seats:3,bags:2,price:1500,bookUrl:'/b'}],notes:[]});
 const run=(dropoff)=>{const c=scripted({content:[{type:'tool_use',id:'t',name:'quote_transfer',input:{pickup:'BKK',dropoff,date:'2026-12-01',time:'10:00',passengers:2,bags:2}}],stop_reason:'tool_use'},say('ok'));
  return bot.ceeTurn([{sender:'visitor',body:'price'}],c,{tools:{...tools,quoteTransfer:async()=>q(dropoff)},alerts}).then((out)=>({out,calls:c.calls}));};
 const stop=await run('Ayutthaya old city');assert.equal(stop.out.cards.length,0);assert.match(JSON.stringify(stop.calls.at(-1).messages.at(-1)),/Flooding in Ayutthaya/);
 const warn=await run('Pattaya');assert.match(warn.out.cards[0].notes[0],/⚠️ Songkran traffic/);
 assert.match(JSON.stringify(stop.calls[0].system),/ACTIVE WAYDIDI ALERTS/);
});
test('spam guard: too many messages in a few minutes pauses Non for that chat',async()=>{
 const guard=await vite.ssrLoadModule('/lib/cee/guard.ts');
 const id=await conversation('hi');for(let i=0;i<21;i++)await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES(?,?,'visitor','x',?)").bind('sp'+i+id,id,new Date().toISOString()).run();
 assert.equal(await guard.spamPaused(id),true);
});
test('"near me": on the website Non shows a Share my location button; on WhatsApp it asks for the location pin',async()=>{
 const ask=(channel)=>bot.ceeTurn([{sender:'visitor',body:'good coffee near me?'}],scripted({content:[{type:'tool_use',id:'t',name:'ask_location',input:{reason:'coffee shops near you'}}],stop_reason:'tool_use'},say('Tap the button to share your location.')),{tools,channel});
 const web=await ask('web');assert.equal(web.cards[0].type,'location');assert.match(web.cards[0].text,/coffee shops near you/);
 const wa=await ask('whatsapp');assert.equal(wa.cards.length,0);
 const cards=await vite.ssrLoadModule('/lib/chat-cards.ts');assert.ok(cards.parseCard(JSON.stringify(web.cards[0])));
});
test('check booking: reference + surname must both match; wrong guesses are limited per chat; card shows status, trip, payment, driver',async()=>{
 await db.exec("CREATE TABLE IF NOT EXISTS bookings(reference TEXT PRIMARY KEY,customer_name TEXT,customer_email TEXT,customer_phone TEXT,pickup TEXT,dropoff TEXT,pickup_date TEXT,pickup_time TEXT,passengers INTEGER,luggage INTEGER,vehicle TEXT,payment_method TEXT,total INTEGER,status TEXT,payment_status TEXT,amount_paid INTEGER,access_token_hash TEXT,service_type TEXT,booked_hours INTEGER,created_at TEXT,updated_at TEXT);");
 for(const c of ['customer_surname TEXT','return_date TEXT','return_time TEXT','flight_number TEXT'])try{await db.exec(`ALTER TABLE bookings ADD COLUMN ${c};`);}catch{}
 await db.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,amount_paid,service_type) VALUES('MC7Q2P','Mansi','Choksi','Trat airport','Dinso Resort','2026-12-14','12:45',2,2,'economy_sedan','cash',2400,'confirmed','pending',0,'transfer')").run();
 await db.exec('CREATE TABLE IF NOT EXISTS security_rate_windows(fingerprint TEXT,window INTEGER,attempts INTEGER,PRIMARY KEY(fingerprint,window));');
 const lk=await vite.ssrLoadModule('/lib/cee/booking-lookup.ts');
 const ok=await lk.checkBooking('look-1','mc7q2p',' choksi ');assert.equal(ok.ok,true);assert.equal(ok.booking.statusText,'Confirmed');assert.equal(ok.booking.cashDue,2400);
 assert.ok(ok.booking.rows.some(([k,v])=>k==='Date/Time'&&v==='14/12/2026 12:45'));
 const bad=await lk.checkBooking('look-2','MC7Q2P','Smith');assert.equal(bad.ok,false);assert.doesNotMatch(bad.reason,/surname is wrong/i);
 for(let i=0;i<5;i++)await lk.checkBooking('look-3','ABCDEF','x');
 const locked=await lk.checkBooking('look-3','MC7Q2P','Choksi');assert.equal(locked.ok,false);assert.match(locked.reason,/Too many tries/);
 const out=await bot.ceeTurn([{sender:'visitor',body:'check MC7Q2P Choksi'}],scripted({content:[{type:'tool_use',id:'t',name:'check_booking',input:{reference:'MC7Q2P',surname:'Choksi'}}],stop_reason:'tool_use'},say('Your booking is confirmed.')),{tools,placeGuard:{conversationId:'look-4',actor:'chat:look-4'}});
 assert.equal(out.cards[0].type,'booking');assert.equal(out.cards[0].reference,'MC7Q2P');
 globalThis.__ceeTest.env.WAYDIDI_ADMIN_SESSION_SECRET='s'.repeat(40);const signed=await lk.checkBooking('look-5','MC7Q2P','Choksi');assert.match(signed.booking.rideUrl,/\/trip\/MC7Q2P\?ride=[a-f0-9]{32}$/);delete globalThis.__ceeTest.env.WAYDIDI_ADMIN_SESSION_SECRET;
});
