import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
// Cee (chat quote bot): the tool loop with a scripted model, and the rules for when Cee speaks.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
await db.exec("CREATE TABLE attractions(id TEXT PRIMARY KEY,name TEXT,customer_name TEXT,area TEXT DEFAULT '',category TEXT DEFAULT 'sight',tags_json TEXT DEFAULT '[]',open_time TEXT,close_time TEXT,closed_days_json TEXT DEFAULT '[]',duration_min INTEGER DEFAULT 60,dress_code TEXT,description TEXT,status TEXT DEFAULT 'active');");
await db.exec('CREATE TABLE staff_accounts(id TEXT PRIMARY KEY,display_name TEXT,active INTEGER,role TEXT);');
for(const file of ['0061_website_chat.sql','0069_chat_telegram.sql','0070_support_reviews.sql','0071_chat_country.sql','0072_cee_bot.sql','0073_cee_knowledge_channels.sql'])for(const sql of (await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();
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
test('Cee stays quiet when the last message is not from the customer',async()=>{
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

test('Cee replies as "Cee", marked as a bot, without taking the chat',async()=>{
 const id=await conversation('How much from BKK to Pattaya?');
 await bot.runCee(id,scripted(say('Sure! What date and time?')));
 assert.deepEqual(await replies(id),[{sender_name:'Cee',is_bot:1,body:'Sure! What date and time?'}]);
 assert.equal((await row(id)).assigned_name,null);
});
test('a staff reply or assignment silences Cee in that chat',async()=>{
 const id=await conversation('hello');
 await chat.addStaffMessage(id,'Hi, Anna here',{name:'Anna'},'dashboard');
 assert.equal((await row(id)).bot_paused,1);
 const c=scripted(say('should not send'));await bot.runCee(id,c);assert.equal(c.calls.length,0);
 const id2=await conversation('hello');await chat.assign(id2,{name:'Ben'},true);assert.equal((await row(id2)).bot_paused,1);
});
test('asking for a person hands over without calling the model (English, Thai, Chinese)',async()=>{
 for(const text of ['Can I talk to a real person?','ขอคุยกับเจ้าหน้าที่','我要人工客服']){
  const id=await conversation(text);const c=scripted();await bot.runCee(id,c);
  assert.equal(c.calls.length,0);assert.equal((await row(id)).bot_paused,1);assert.equal((await replies(id))[0].sender_name,'Cee');
 }
});
test('a model error hands the chat to staff and says nothing wrong to the customer',async()=>{
 const id=await conversation('BKK to Pattaya');await bot.runCee(id,scripted());
 assert.equal((await row(id)).bot_paused,1);assert.equal((await replies(id)).length,0);
});
test('Cee is off without an API key or when switched off',async()=>{
 globalThis.__ceeTest.env.ANTHROPIC_API_KEY=undefined;assert.equal(await bot.ceeEnabled(),false);globalThis.__ceeTest.env.ANTHROPIC_API_KEY='test-key';
 await bot.setCeeEnabled(false);const id=await conversation('hi');const c=scripted(say('x'));await bot.runCee(id,c);assert.equal(c.calls.length,0);
 await bot.setCeeEnabled(true);assert.equal(await bot.ceeEnabled(),true);
});

test('auto mode answers simple messages with the fast model, without Opus-only options',async()=>{
 const c=scripted({...say('Hello! Where are you going?'),usage:{input_tokens:3000,output_tokens:100}});
 const out=await bot.ceeTurn([{sender:'visitor',body:'hi'}],c,{tools});
 assert.equal(c.calls[0].model,'claude-haiku-4-5');assert.equal(c.calls[0].fallbacks,undefined);assert.equal(c.calls[0].output_config,undefined);
 assert.ok(c.calls[0].tools.some((t)=>t.name==='escalate'));assert.equal(c.calls[0].system[0].cache_control.type,'ephemeral');
 assert.equal(out.model,'claude-haiku-4-5');assert.ok(Math.abs(out.usd-0.0035)<1e-9);
});
test('the fast model escalates trip planning to Opus, which starts the turn fresh',async()=>{
 const c=scripted(use('escalate',{why:'multi-day plan'}),say('Here is a plan…'));
 const out=await bot.ceeTurn([{sender:'visitor',body:questions.find((q)=>q.group==='Undecided').message}],c,{tools});
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

test('the website shows "Cee is typing…" while Cee works',async()=>{
 const customer=await vite.ssrLoadModule('/app/api/chat/route.ts');const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
 const token='c'.repeat(48);await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status) VALUES(?,?,?,?,?,?,?)').bind('typing-1',await sha256(token),later,now,now,'WD-77777','open').run();
 const get=async()=>(await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:`waydidi_chat=${token}`}}))).json()).conversation.typing;
 assert.equal(await get(),false);await chat.setBotThinking('typing-1',true);assert.equal(await get(),true);await chat.setBotThinking('typing-1',false);assert.equal(await get(),false);
});

// WhatsApp and LINE: signed webhooks in, replies out through the same conversation and Cee.
const sent=[];const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://graph.facebook.com')||u.startsWith('https://api.line.me')){sent.push({url:u,body:init?.body?JSON.parse(init.body):null});return new Response(JSON.stringify(u.includes('/profile/')?{displayName:'Nok'}:{messages:[{id:'wamid.out'}]}),{status:200});}return realFetch(url,init);};
after(()=>{globalThis.fetch=realFetch;});
const sign=async(secret,body,enc)=>{const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)));return enc==='hex'?[...mac].map((b)=>b.toString(16).padStart(2,'0')).join(''):btoa(String.fromCharCode(...mac));};
test('WhatsApp: verification, signature check, one conversation per number, Cee replies on WhatsApp',async()=>{
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
 await chat.addStaffMessage(c.id,'สวัสดีค่ะ Anna here',{name:'Anna'},'dashboard');
 const push=sent.filter((x)=>x.url.endsWith('/message/push')).at(-1);assert.deepEqual([push.body.to,push.body.messages[0].text],['U1','สวัสดีค่ะ Anna here']);
 await bot.setCeeEnabled(true);
});
