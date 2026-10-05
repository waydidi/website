import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
await db.exec('CREATE TABLE staff_accounts(id TEXT PRIMARY KEY,display_name TEXT,active INTEGER,role TEXT);');
await db.exec('CREATE TABLE security_rate_windows(fingerprint TEXT,window INTEGER,attempts INTEGER,PRIMARY KEY(fingerprint,window));');
for(const file of ['0061_website_chat.sql','0069_chat_telegram.sql','0070_support_reviews.sql','0071_chat_country.sql','0072_cee_bot.sql','0073_cee_knowledge_channels.sql','0074_non_scaling.sql','0075_chat_read_receipts.sql','0076_chat_idle.sql','0077_telegram_prompt_user.sql'])for(const sql of (await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();
await db.prepare("INSERT INTO staff_accounts VALUES('alice','Alice',1,'support'),('bob','Bob',1,'support')").run();
globalThis.__chatTest={env:{DB:db},user:{id:'alice',displayName:'Alice',role:'support'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'chat-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0chat-env';if(id==='@/lib/admin'||id===root+'/lib/admin')return '\0chat-admin';},load(id){if(id==='\0chat-env')return 'export const env=globalThis.__chatTest.env';if(id==='\0chat-admin')return 'export async function getWaydidiAdmin(){return globalThis.__chatTest.user}';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__chatTest;});
const admin=await vite.ssrLoadModule('/app/api/admin/chat/route.ts');
const customer=await vite.ssrLoadModule('/app/api/chat/route.ts');
const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
const now=new Date().toISOString(),expires=new Date(Date.now()+86400000).toISOString(),token='a'.repeat(48);
await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)').bind('chat-1',await sha256(token),expires,now,now).run();
await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)').bind('chat-2',await sha256('b'.repeat(48)),expires,now,now).run();
await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('visitor-1','chat-1','visitor','Can you help?',?)").bind(now).run();
const post=(body,origin='https://example.invalid')=>new Request('https://example.invalid/api/admin/chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('inbox shows customer messages and the first reply assigns the replying admin',async()=>{
 const data=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?id=chat-1'))).json();
 assert.equal(data.conversations.find(c=>c.id==='chat-1').preview,'Can you help?');assert.equal(data.messages[0].body,'Can you help?');
 assert.equal((await admin.POST(post({id:'chat-1',message:''}))).status,400);
 assert.equal((await admin.POST(post({id:'chat-1',message:'Hello'}))).status,200);
 const row=await db.prepare("SELECT assigned_staff_id,assigned_name FROM website_conversations WHERE id='chat-1'").first();assert.equal(row.assigned_staff_id,'alice');assert.equal(row.assigned_name,'Alice');
});
test('another admin cannot reply to an assigned chat without an explicit takeover',async()=>{
 globalThis.__chatTest.user={id:'bob',displayName:'Bob',role:'support'};
 assert.equal((await admin.POST(post({id:'chat-1',message:'Hi'}))).status,409);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE body='Hi'").first()).n,0);
 globalThis.__chatTest.user={id:'alice',displayName:'Alice',role:'support'};
});
test('assigned reply reaches the customer with the admin name and visitor isolation',async()=>{
 assert.equal((await admin.POST(post({id:'chat-1',action:'reply',message:'Hello, how can I help?'}))).status,200);
 const data=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:`waydidi_chat=${token}`}}))).json();
 assert.equal(data.conversation.agent,'Alice');assert.equal(data.messages.find(m=>m.sender==='staff').name,'Alice');assert.ok(!('staff_id' in data.messages[0]));assert.ok(data.messages.some(m=>m.body==='Hello, how can I help?'));
 const other=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:`waydidi_chat=${'b'.repeat(48)}`}}))).json();assert.equal(other.messages.length,0);assert.equal(other.conversation.agent,null);
});
test('assignment rejects expired conversations, unauthorized roles and cross-site requests',async()=>{
 await db.prepare("UPDATE website_conversations SET expires_at=? WHERE id='chat-2'").bind('2020-01-01T00:00:00.000Z').run();
 const expired=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?id=chat-2'))).json();assert.ok(expired.selectionError);assert.equal((await admin.POST(post({id:'chat-2',message:'Too late'}))).status,404);
 assert.equal((await admin.POST(post({id:'chat-1',message:'Blocked'},'https://other.invalid'))).status,403);
 globalThis.__chatTest.user={id:'bob',displayName:'Bob',role:'finance'};assert.equal((await admin.GET(new Request('https://example.invalid/api/admin/chat'))).status,403);
 globalThis.__chatTest.user=null;assert.equal((await admin.POST(post({id:'chat-1',action:'assign'}))).status,403);
});
test('new public website messages reach the inbox, notification and assigned reply flow',async()=>{
 globalThis.__chatTest.user={id:'alice',displayName:'Alice',role:'support'};
 const send=(message,cookie='')=>customer.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie,'cf-connecting-ip':'chat-delivery-test'},body:JSON.stringify({message,email:'guest@example.com'})}));
 const created=await send('New website customer message');assert.equal(created.status,200);
 const cookie=created.headers.get('set-cookie').split(';')[0];
 const inbox=await (await admin.GET(new Request('https://example.invalid/api/admin/chat'))).json();
 const chat=inbox.conversations.find(c=>c.preview==='New website customer message');assert.ok(chat);
 const summary=()=>admin.GET(new Request('https://example.invalid/api/admin/chat?summary=1')).then(r=>r.json());
 const alert=(await summary()).items.find(i=>i.href.endsWith(chat.id));assert.equal(alert.n,1);assert.match(alert.key,/^chat:/);
 const detail=await (await admin.GET(new Request(`https://example.invalid/api/admin/chat?id=${chat.id}`))).json();assert.equal(detail.messages[0].body,'New website customer message');
 assert.equal((await summary()).items.some(i=>i.href.endsWith(chat.id)),false); // opened = read
 assert.equal((await admin.POST(post({id:chat.id,action:'reply',message:'Hello customer'}))).status,200);
 const history=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie}}))).json();assert.ok(history.messages.some(m=>m.body==='Hello customer'&&m.name==='Alice'));
 assert.equal((await summary()).items.some(i=>i.href.endsWith(chat.id)),false);
 assert.equal((await send('Another customer question',cookie)).status,200);
 const next=(await summary()).items.find(i=>i.href.endsWith(chat.id));assert.equal(next.n,1);assert.notEqual(next.key,alert.key);
});

test('an expired or missing selected chat does not hide the active inbox',async()=>{
 globalThis.__chatTest.user={id:'alice',displayName:'Alice',role:'support'};
 const response=await admin.GET(new Request('https://example.invalid/api/admin/chat?id=missing-chat'));
 assert.equal(response.status,200);const data=await response.json();assert.ok(data.conversations.length>0);assert.equal(data.conversation,null);assert.deepEqual(data.messages,[]);assert.ok(data.selectionError);
});
test('customer messages sent in the same millisecond as a reply remain visible and notify admins',async()=>{
 const stamp='2026-10-04T00:00:00.000Z';
 await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)').bind('same-time-chat',await sha256('c'.repeat(48)),expires,stamp,stamp).run();
 await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at) VALUES('z-staff','same-time-chat','staff','Staff reply','alice',?)").bind(stamp).run();
 await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('a-visitor','same-time-chat','visitor','Customer follow-up',?)").bind(stamp).run();
 const summary=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?summary=1'))).json();assert.equal(summary.items.find(i=>i.href.endsWith('same-time-chat'))?.n,1);
 const inbox=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?id=same-time-chat'))).json();assert.equal(inbox.conversations.find(c=>c.id==='same-time-chat').preview,'Customer follow-up');assert.deepEqual(inbox.messages.map(m=>m.body),['Staff reply','Customer follow-up']);
});

test('telegram replies reach only the mapped conversation, once, and only from approved admins',async()=>{
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24),TELEGRAM_CHAT_ID:'-100'});
 await db.prepare("UPDATE website_conversations SET telegram_message_id=900,expires_at=? WHERE id='chat-2'").bind(expires).run();
 await db.prepare("INSERT INTO telegram_admins(id,telegram_user_id,display_name,enabled,created_at,updated_at) VALUES('t1','777','Alex',1,?,?)").bind(now,now).run();
 const call=(update,secret='s'.repeat(24))=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify(update)}));
 const reply=(update_id,from,text,chat=-100)=>({update_id,message:{message_id:update_id,chat:{id:chat},from:{id:from},text,reply_to_message:{message_id:900,chat:{id:chat}}}});
 assert.equal((await call(reply(1,777,'x'),'wrong-secret-wrong-secret')).status,403);
 await call(reply(2,777,'From Telegram'));await call(reply(2,777,'From Telegram'));
 await call(reply(3,999,'Not approved'));await call(reply(4,777,'Wrong group',-555));
 const bodies=(await db.prepare("SELECT body,sender_name FROM website_chat_messages WHERE conversation_id='chat-2' AND sender='staff'").all()).results;
 assert.deepEqual(bodies,[{body:'From Telegram',sender_name:'Alex'}]);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id='chat-1' AND body='From Telegram'").first()).n,0);
 assert.equal((await db.prepare("SELECT assigned_name FROM website_conversations WHERE id='chat-2'").first()).assigned_name,'Alex');
 await call({update_id:5,callback_query:{id:'q',from:{id:999},data:'chat_close:chat-2',message:{message_id:900,chat:{id:-100}}}});
 assert.equal((await db.prepare("SELECT status FROM website_conversations WHERE id='chat-2'").first()).status,'open');
 await call({update_id:6,callback_query:{id:'q',from:{id:777},data:'chat_close:chat-2',message:{message_id:900,chat:{id:-100}}}});
 assert.equal((await db.prepare("SELECT status FROM website_conversations WHERE id='chat-2'").first()).status,'closed');
});

test('a new chat cannot start without a valid email address',async()=>{
 const start=(body)=>customer.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','cf-connecting-ip':'email-check'},body:JSON.stringify(body)}));
 assert.equal((await start({message:'Hello'})).status,400);
 assert.equal((await start({message:'Hello',email:'not-an-email'})).status,400);
 const ok=await start({message:'Hello',email:'guest@example.com'});assert.equal(ok.status,200);
 assert.equal((await db.prepare("SELECT customer_email FROM website_conversations ORDER BY created_at DESC,rowid DESC LIMIT 1").first()).customer_email,'guest@example.com');
});

test('support rating: only the owner of a closed chat can rate it, once, and every rating gets the Google link',async()=>{
 const review=await vite.ssrLoadModule('/app/api/chat/review/route.ts');
 Object.assign(globalThis.__chatTest.env,{GOOGLE_BUSINESS_REVIEW_URL:'https://g.page/r/waydidi/review'});
 const owner='d'.repeat(48);
 await db.prepare("INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status,customer_email,assigned_name) VALUES('rate-1',?,?,?,?,'WD-90001','open','r@example.com','Alice')").bind(await sha256(owner),expires,now,now).run();
 const rate=(body,cookie=`waydidi_chat=${owner}`)=>review.POST(new Request('https://example.invalid/api/chat/review',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie,'cf-connecting-ip':'rate-test'},body:JSON.stringify(body)}));
 assert.equal((await rate({rating:5})).status,409); // still open
 await db.prepare("UPDATE website_conversations SET status='closed' WHERE id='rate-1'").run();
 assert.equal((await rate({rating:5},'')).status,404); // no chat cookie
 assert.equal((await rate({rating:5},`waydidi_chat=${'e'.repeat(48)}`)).status,404); // made-up chat token
 for(const bad of [0,6,2.5,'5'])assert.equal((await rate({rating:bad})).status,400);
 assert.equal((await rate({rating:3,feedback:'x'.repeat(1001)})).status,400);
 const first=await rate({rating:1,feedback:'<script>alert(1)</script> slow reply'});assert.equal(first.status,200);
 const body=await first.json();assert.equal(body.googleUrl,'https://g.page/r/waydidi/review');assert.equal(body.duplicate,false);
 const again=await (await rate({rating:5})).json();assert.equal(again.duplicate,true);assert.equal(again.rating,1);
 const rows=(await db.prepare("SELECT rating,feedback,needs_attention,admin_name,publication_status FROM support_reviews WHERE conversation_id='rate-1'").all()).results;
 assert.equal(rows.length,1);assert.equal(rows[0].needs_attention,1);assert.equal(rows[0].admin_name,'Alice');assert.equal(rows[0].publication_status,'private');
 const state=await (await customer.GET(new Request('https://example.invalid/api/chat',{headers:{cookie:`waydidi_chat=${owner}`}}))).json();
 assert.equal(state.conversation.review.submitted,true);assert.equal(state.conversation.review.googleUrl,'https://g.page/r/waydidi/review');
 await rate({action:'event',event:'google_cta_clicked'});assert.ok((await db.prepare("SELECT google_cta_clicked_at FROM support_reviews WHERE conversation_id='rate-1'").first()).google_cta_clicked_at);
 // A new message after closing starts a fresh conversation (email carried over) and leaves the rated one untouched.
 const res=await customer.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie:`waydidi_chat=${owner}`,'cf-connecting-ip':'rate-new'},body:JSON.stringify({message:'One more question'})}));
 assert.equal(res.status,200);assert.ok(res.headers.get('set-cookie'));
 assert.equal((await db.prepare("SELECT status FROM website_conversations WHERE id='rate-1'").first()).status,'closed');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id='rate-1' AND body='One more question'").first()).n,0);
 assert.equal((await db.prepare("SELECT customer_email FROM website_conversations c JOIN website_chat_messages m ON m.conversation_id=c.id WHERE m.body='One more question'").first()).customer_email,'r@example.com');
});

test('the visitor country from Cloudflare is saved with a new chat; unknown codes are not',async()=>{
 const start=(country,ip)=>customer.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','cf-connecting-ip':ip,'cf-ipcountry':country},body:JSON.stringify({message:`From ${country}`,email:'c@example.com'})}));
 assert.equal((await start('DE','country-1')).status,200);assert.equal((await start('XX','country-2')).status,200);
 const row=(body)=>db.prepare("SELECT c.customer_country FROM website_conversations c JOIN website_chat_messages m ON m.conversation_id=c.id WHERE m.body=?").bind(body).first();
 assert.equal((await row('From DE')).customer_country,'DE');assert.equal((await row('From XX')).customer_country,null);
 const {conversationCard}=await vite.ssrLoadModule('/lib/telegram/cards.ts');
 assert.match(conversationCard({id:'x',public_id:'WD-1',status:'open',customer_name:null,customer_email:null,customer_phone:null,source_title:null,source_url:null,topic:null,assigned_name:null,created_at:now,customer_country:'DE'},null,true),/Germany/);
});
test('opening a chat marks it read for every admin and shows who read it',async()=>{
 const t=new Date().toISOString();
 await db.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id) VALUES(?,?,?,?,?,?)').bind('chat-read','read-hash',expires,t,t,'WD-55555').run();
 await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('read-1','chat-read','visitor','Hello',?)").bind(t).run();
 globalThis.__chatTest.user={id:'bob',displayName:'Bob',role:'support'};
 const list=async()=>(await (await admin.GET(new Request('https://example.invalid/api/admin/chat'))).json()).conversations.find((c)=>c.id==='chat-read');
 const bell=async()=>(await (await admin.GET(new Request('https://example.invalid/api/admin/chat?summary=1'))).json()).items.some((i)=>i.href.includes('chat-read'));
 assert.equal((await list()).unread,1);assert.equal(await bell(),true);
 globalThis.__chatTest.user={id:'alice',displayName:'Alice',role:'support'};
 const opened=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?id=chat-read'))).json();
 assert.equal(opened.conversation.read_by,'Alice');
 globalThis.__chatTest.user={id:'bob',displayName:'Bob',role:'support'};
 const row=await list();assert.equal(row.unread,0);assert.equal(row.read_by,'Alice');assert.equal(await bell(),false);
 await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('read-2','chat-read','visitor','Are you there?',?)").bind(t).run();
 assert.equal((await list()).unread,1);
 globalThis.__chatTest.user={id:'alice',displayName:'Alice',role:'support'};
});
test('a quiet customer gets one polite check-in after 10 minutes; quiet chats can be completed or kept for follow-up',async()=>{
 const idle=await vite.ssrLoadModule('/lib/chat-idle.ts');const t0=Date.now();const iso=(m)=>new Date(t0-m*60000).toISOString();
 await db.prepare("INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status) VALUES('idle-1','idle-hash',?,?,?,'WD-11111','open')").bind(expires,iso(30),iso(30)).run();
 await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('i1','idle-1','visitor','How much to Pattaya?',?)").bind(iso(14)).run();
 await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at,sender_name) VALUES('i2','idle-1','staff','When are you travelling?',?,'Alice')").bind(iso(12)).run();
 const count=async()=>(await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id='idle-1' AND body=?").bind(idle.NUDGE_TEXT).first()).n;
 await idle.sendIdleNudges(new Date(t0));assert.equal(await count(),1);
 await idle.sendIdleNudges(new Date(t0+11*60000));assert.equal(await count(),1); // never twice in a row
 await db.prepare("UPDATE website_chat_messages SET created_at=? WHERE conversation_id='idle-1' AND body=?").bind(iso(20),idle.NUDGE_TEXT).run();await db.prepare("UPDATE website_conversations SET last_message_at=? WHERE id='idle-1'").bind(iso(20)).run();
 const detail=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?id=idle-1'))).json();assert.equal(detail.conversation.quiet,true);
 assert.equal((await admin.POST(post({id:'idle-1',action:'follow_up'}))).status,200);
 let row=await db.prepare("SELECT status,follow_up_at FROM website_conversations WHERE id='idle-1'").first();assert.equal(row.status,'pending');assert.ok(row.follow_up_at);
 assert.equal((await admin.POST(post({id:'idle-1',action:'complete'}))).status,200);
 row=await db.prepare("SELECT status,follow_up_at FROM website_conversations WHERE id='idle-1'").first();assert.equal(row.status,'closed');assert.equal(row.follow_up_at,null);
});
test('website chats idle for 30 minutes end automatically and stay in the inbox; follow-ups are kept open',async()=>{
 const idle=await vite.ssrLoadModule('/lib/chat-idle.ts');const t0=Date.now();const iso=(m)=>new Date(t0-m*60000).toISOString();
 for(const [id,status,mins] of [['auto-1','open',31],['auto-2','open',20],['auto-3','pending',45]]){
  await db.prepare("INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status,last_message_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,id+'-h',expires,iso(mins),iso(mins),'WD-'+id,status,iso(mins)).run();
  await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES(?,?,'visitor','hi',?)").bind(id+'-m',id,iso(mins)).run();
 }
 assert.ok(await idle.closeIdleChats(new Date(t0))>=1);
 const st=async(id)=>(await db.prepare('SELECT status FROM website_conversations WHERE id=?').bind(id).first()).status;
 assert.equal(await st('auto-1'),'closed');assert.equal(await st('auto-2'),'open');assert.equal(await st('auto-3'),'pending');
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE conversation_id='auto-1'").first()).n,2); // history kept + closing note
 const closed=await (await admin.GET(new Request('https://example.invalid/api/admin/chat?status=closed'))).json();assert.ok(closed.conversations.some((c)=>c.id==='auto-1'));
});
test('after tapping Reply in Telegram, the next plain message (not a swipe-reply) reaches the customer, once',async()=>{
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24),TELEGRAM_CHAT_ID:'-100'});
 await db.prepare("UPDATE website_conversations SET status='open' WHERE id='chat-2'").run();
 await db.prepare("INSERT INTO telegram_reply_prompts(telegram_message_id,conversation_id,created_at,telegram_user_id) VALUES(950,'chat-2',?,'777')").bind(new Date().toISOString()).run();
 const call=(update)=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify(update)}));
 const plain=(update_id,from,text)=>({update_id,message:{message_id:update_id,chat:{id:-100},from:{id:from},text}});
 await call(plain(20,999,'Someone else chatting'));
 await call(plain(21,777,'Our price is 800 THB'));
 await call(plain(22,777,'Team talk, not for the customer'));
 const bodies=(await db.prepare("SELECT body FROM website_chat_messages WHERE conversation_id='chat-2' AND sender='staff' AND body IN ('Our price is 800 THB','Team talk, not for the customer','Someone else chatting')").all()).results.map((r)=>r.body);
 assert.deepEqual(bodies,['Our price is 800 THB']);
});
