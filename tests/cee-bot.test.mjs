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
await db.exec('CREATE TABLE staff_accounts(id TEXT PRIMARY KEY,display_name TEXT,active INTEGER,role TEXT);');
for(const file of ['0061_website_chat.sql','0069_chat_telegram.sql','0070_support_reviews.sql','0071_chat_country.sql','0072_cee_bot.sql'])for(const sql of (await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();
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
const tools={quoteTransfer:async()=>({ok:true,kind:'transfer',summary:'BKK → Pattaya',cars:[car],notes:[]}),quoteHourly:async()=>({ok:false,reason:'Ask for the city.',handover:false}),findPackages:async()=>[]};

test('the request uses Opus 5.5, server-side fallback, low effort and strict tools',async()=>{
 const c=scripted(say('Hi! When are you travelling?'));
 const out=await bot.ceeTurn([{sender:'visitor',body:'How much from BKK to Pattaya?'}],c,tools,'Sunday 4 October 2026');
 assert.equal(out.reply,'Hi! When are you travelling?');assert.equal(out.handover,null);
 const b=c.calls[0];assert.equal(b.model,'claude-opus-5-5');assert.equal(b.fallbacks,'default');assert.deepEqual(b.betas,['server-side-fallback-2026-07-01']);
 assert.equal(b.output_config.effort,'low');assert.ok(b.tools.every((t)=>t.strict===true));assert.equal(b.tool_choice.type,'auto');
 assert.match(b.system,/Sunday 4 October 2026/);assert.match(b.system,/never invent/i);
});
test('history alternates roles, merges repeats and drops a leading staff greeting',async()=>{
 const c=scripted(say('ok'));
 await bot.ceeTurn([{sender:'staff',body:'Welcome'},{sender:'visitor',body:'a'},{sender:'visitor',body:'b'},{sender:'staff',body:'c'},{sender:'visitor',body:'d'}],c,tools);
 assert.deepEqual(c.calls[0].messages.map((m)=>[m.role,m.content]),[['user','a\n\nb'],['assistant','c'],['user','d']]);
});
test('Cee stays quiet when the last message is not from the customer',async()=>{
 const c=scripted();assert.deepEqual(await bot.ceeTurn([{sender:'visitor',body:'hi'},{sender:'staff',body:'hello'}],c,tools),{reply:null,handover:null});assert.equal(c.calls.length,0);
});
test('prices come only from the quote tool result',async()=>{
 const c=scripted(use('quote_transfer',{pickup:'Suvarnabhumi',dropoff:'Hilton Pattaya',date:'2026-10-05',time:'10:00',passengers:2,bags:2}),say('Economy sedan ฿1,800'));
 const out=await bot.ceeTurn([{sender:'visitor',body:questions[1].message}],c,tools);
 assert.equal(out.reply,'Economy sedan ฿1,800');
 const result=c.calls[1].messages.at(-1).content[0];assert.equal(result.type,'tool_result');assert.equal(JSON.parse(result.content).cars[0].price,1800);
});
test('a pricing failure becomes a handover instruction, not a guess',async()=>{
 const c=scripted(use('quote_transfer',{pickup:'x',dropoff:'y',date:'2026-10-05',time:'10:00',passengers:2,bags:2}),say('Let me pass you to the team.'));
 await bot.ceeTurn([{sender:'visitor',body:'x to y'}],c,{...tools,quoteTransfer:async()=>{throw new Error('maps down');}});
 assert.equal(JSON.parse(c.calls[1].messages.at(-1).content[0].content).handover,true);
});
test('the handover tool and a refusal both hand over',async()=>{
 const h=await bot.ceeTurn([{sender:'visitor',body:'I want a refund'}],scripted(use('handover',{reason:'refund',summary:'Refund for WD-1'}),say('A team member will reply soon.')),tools);
 assert.deepEqual(h.handover,{reason:'refund',summary:'Refund for WD-1'});assert.equal(h.reply,'A team member will reply soon.');
 const r=await bot.ceeTurn([{sender:'visitor',body:'?'}],scripted({stop_reason:'refusal',content:[]}),tools);assert.equal(r.reply,null);assert.ok(r.handover);
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
