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
await db.exec("CREATE TABLE drivers(id TEXT PRIMARY KEY,full_name TEXT,phone TEXT,vehicle TEXT,car_plate TEXT,driver_type TEXT,status TEXT,base_location TEXT DEFAULT '',created_at TEXT,updated_at TEXT);");
await db.exec('CREATE TABLE security_rate_windows(fingerprint TEXT,window INTEGER,attempts INTEGER,PRIMARY KEY(fingerprint,window));');
for(const file of ['0061_website_chat.sql','0069_chat_telegram.sql','0070_support_reviews.sql','0071_chat_country.sql','0072_cee_bot.sql','0073_cee_knowledge_channels.sql','0074_non_scaling.sql','0075_chat_read_receipts.sql','0076_chat_idle.sql','0077_telegram_prompt_user.sql','0078_telegram_dm.sql','0079_chat_payment_links.sql','0080_chat_cards.sql','0081_telegram_booking_tasks.sql','0082_telegram_request_cards.sql','0083_site_translations.sql','0084_chat_alerts_limits.sql','0085_booking_links.sql'])for(const sql of (await readFile(root+'/drizzle/'+file,'utf8')).split('--> statement-breakpoint')) await db.prepare(sql).run();
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
test('assigning in Telegram announces it in the group, then the chat continues in the assignee\'s private chat',async()=>{
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');const chat=await vite.ssrLoadModule('/lib/website-chat.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24),TELEGRAM_CHAT_ID:'-100',TELEGRAM_BOT_TOKEN:'t'});
 const sent=[];const real=globalThis.fetch;let id=5000;
 globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://api.telegram.org')){const body=JSON.parse(init.body);sent.push({method:u.split('/').pop(),...body});return new Response(JSON.stringify({ok:true,result:{message_id:++id,chat:{id:body.chat_id}}}));}return real(url,init);};
 try{
  const t=new Date().toISOString();
  await db.prepare("INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status,telegram_message_id) VALUES('dm-1','dm-h',?,?,?,'WD-22222','open',4000)").bind(expires,t,t).run();
  await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('dm-m1','dm-1','visitor','How much to Pattaya?',?)").bind(t).run();
  const call=(update)=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify(update)}));
  await call({update_id:300,callback_query:{id:'q',from:{id:777},data:'chat_assign:dm-1',message:{message_id:4000,chat:{id:-100}}}});
  const group=sent.filter((m)=>m.method==='sendMessage'&&m.chat_id==='-100').map((m)=>m.text);
  assert.ok(group.some((x)=>/Chat <b>WD-22222<\/b> has been assigned to <b>Alex<\/b>/.test(x)));
  const dm=sent.filter((m)=>m.method==='sendMessage'&&m.chat_id==='777');assert.equal(dm.length,1);assert.match(dm[0].text,/How much to Pattaya/);
  // New customer message goes to the private chat, not the group
  sent.length=0;await db.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('dm-m2','dm-1','visitor','Tomorrow 9am',?)").bind(t).run();
  await chat.deliverVisitorMessage('dm-1','dm-m2');
  assert.deepEqual(sent.filter((m)=>m.method==='sendMessage').map((m)=>[m.chat_id,m.text]),[['777','Tomorrow 9am']]);
  // Typing in the private chat answers the customer
  await call({update_id:301,message:{message_id:77,chat:{id:777,type:'private'},from:{id:777},text:'800 THB, see you tomorrow'}});
  assert.equal((await db.prepare("SELECT sender_name FROM website_chat_messages WHERE conversation_id='dm-1' AND body='800 THB, see you tomorrow'").first()).sender_name,'Alex');
  // Someone not on the team can't answer in private
  await call({update_id:302,message:{message_id:78,chat:{id:999,type:'private'},from:{id:999},text:'hack'}});
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM website_chat_messages WHERE body='hack'").first()).n,0);
 }finally{globalThis.fetch=real;delete globalThis.__chatTest.env.TELEGRAM_BOT_TOKEN;}
});
test('"Let other assign" in Telegram lists the team and assigns the person picked',async()=>{
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24),TELEGRAM_CHAT_ID:'-100',TELEGRAM_BOT_TOKEN:'t'});
 const sent=[];const real=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://api.telegram.org')){sent.push({method:u.split('/').pop(),...JSON.parse(init.body)});return new Response(JSON.stringify({ok:true,result:{message_id:6000,chat:{id:-100}}}));}return real(url,init);};
 try{
  const t=new Date().toISOString();
  await db.prepare("INSERT INTO telegram_admins(id,telegram_user_id,display_name,enabled,created_at,updated_at) VALUES('t2','888','Bea',1,?,?)").bind(t,t).run();
  await db.prepare("INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at,public_id,status,telegram_message_id) VALUES('pick-1','pick-h',?,?,?,'WD-33333','open',4100)").bind(expires,t,t).run();
  const call=(data,from=777)=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify({update_id:Math.floor(Math.random()*1e9),callback_query:{id:'q',from:{id:from},data,message:{message_id:4100,chat:{id:-100}}}})}));
  await call('chat_pick:pick-1');
  const kb=sent.find((m)=>m.method==='editMessageReplyMarkup').reply_markup.inline_keyboard.flat().map((b)=>b.callback_data);
  assert.ok(kb.includes('ct:pick-1:888')&&kb.includes('ct:pick-1:777'));
  await call('ct:pick-1:888');
  const row=await db.prepare("SELECT assigned_name,assigned_telegram_user_id FROM website_conversations WHERE id='pick-1'").first();
  assert.deepEqual([row.assigned_name,row.assigned_telegram_user_id],['Bea','888']);
  assert.ok(sent.some((m)=>m.method==='sendMessage'&&/assigned to <b>Bea<\/b>/.test(m.text)));
 }finally{globalThis.fetch=real;delete globalThis.__chatTest.env.TELEGRAM_BOT_TOKEN;}
});
test('conversation ids read as WD_chat_DDMMYYYYHHMM in Bangkok time, with _2 for a second chat in the same minute',async()=>{
 const chat=await vite.ssrLoadModule('/lib/website-chat.ts');
 assert.equal(chat.chatIdFor('2026-08-18T03:24:00.000Z'),'WD_chat_180820261024');
 const a=await chat.createConversation('id-a',{email:'a@b.co'});const b=await chat.createConversation('id-b',{email:'a@b.co'});
 assert.match(a.public_id,/^WD_chat_\d{12}(_\d+)?$/);assert.match(b.public_id,/^WD_chat_\d{12}(_\d+)?$/);assert.notEqual(a.public_id,b.public_id);
});
test('Telegram booking: assign → Set cost → Add driver information step by step → Thai job post with one trip link',async()=>{
 await db.exec("CREATE TABLE IF NOT EXISTS bookings(reference TEXT PRIMARY KEY,customer_name TEXT,customer_surname TEXT,customer_email TEXT,customer_phone TEXT,pickup TEXT,dropoff TEXT,pickup_date TEXT,pickup_time TEXT,passengers INTEGER,luggage INTEGER,vehicle TEXT,payment_method TEXT,total INTEGER,amount_paid INTEGER DEFAULT 0,flight_number TEXT,status TEXT);");
 await db.exec("CREATE TABLE IF NOT EXISTS booking_costs(booking_reference TEXT PRIMARY KEY,accepted_offer_id TEXT,agreed_driver_cost INTEGER NOT NULL DEFAULT 0,additional_costs INTEGER NOT NULL DEFAULT 0,total_driver_cost INTEGER NOT NULL DEFAULT 0,payment_status TEXT NOT NULL DEFAULT 'unpaid',paid_at TEXT,payment_reference TEXT,notes TEXT,updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);");
 await db.exec("CREATE TABLE IF NOT EXISTS drivers(id TEXT PRIMARY KEY,full_name TEXT,phone TEXT,vehicle TEXT,car_plate TEXT,driver_type TEXT,status TEXT,base_location TEXT DEFAULT '',created_at TEXT,updated_at TEXT);");
 await db.exec("CREATE TABLE IF NOT EXISTS booking_assignments(id TEXT PRIMARY KEY,booking_reference TEXT,leg TEXT,driver_id TEXT,token_hash TEXT,current_status TEXT,assigned_by TEXT,assigned_at TEXT,token_expires_at TEXT,revoked_at TEXT,updated_at TEXT);");
 try{await db.exec("ALTER TABLE drivers ADD COLUMN license_number TEXT;");}catch{}
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_WEBHOOK_SECRET:'s'.repeat(24),TELEGRAM_CHAT_ID:'-100',TELEGRAM_BOT_TOKEN:'t'});
 const sent=[];const real=globalThis.fetch;let mid=7000;
 globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://api.telegram.org')){const body=JSON.parse(init.body);sent.push({method:u.split('/').pop(),...body});return new Response(JSON.stringify({ok:true,result:{message_id:++mid,chat:{id:-100}}}));}return real(url,init);};
 try{
  await db.prepare("INSERT INTO bookings VALUES('MC7Q2P','Mansi','Choksi Choksi','m@x.co','','Trat airport','Dinso Resort & Villas Ko Chang','2026-10-14','12:45',2,2,'economy_sedan','card',2400,2400,'PG305','confirmed')").run();
  for(const c of ['created_at TEXT','return_date TEXT'])try{await db.exec(`ALTER TABLE bookings ADD COLUMN ${c};`);}catch{}
  await db.prepare("UPDATE bookings SET created_at=? WHERE reference='MC7Q2P'").bind(new Date().toISOString()).run();
  await db.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES('MC7Q2P',6999,?)").bind(new Date().toISOString()).run();
  let u=500;const call=(update)=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify({update_id:++u,...update})}));
  const tap=(data)=>call({callback_query:{id:'q',from:{id:777,first_name:'Alex'},data,message:{message_id:6999,chat:{id:-100}}}});
  const say=(text,replyTo)=>call({message:{message_id:++mid,chat:{id:-100},from:{id:777},text,...(replyTo?{reply_to_message:{message_id:replyTo,chat:{id:-100}}}:{})}});
  const lastPrompt=()=>[...sent].reverse().find((m)=>m.reply_markup?.force_reply);
  await tap('bk_cost:MC7Q2P');assert.equal(lastPrompt(),undefined); // must be assigned first
  await tap('booking_assign:MC7Q2P');
  const kb=sent.filter((m)=>m.method==='editMessageText').at(-1).reply_markup.inline_keyboard.flat().map((b)=>b.text);assert.deepEqual(kb,['Set cost','Assign driver','Add outsource driver','Open booking']);
  await tap('bk_cost:MC7Q2P');assert.match(lastPrompt().text,/Driver cost/);
  await say('abc');assert.match(sent.filter((m)=>m.method==='sendMessage').at(-2).text,/number/); // asked again
  await say('900');
  assert.equal((await db.prepare("SELECT total_driver_cost FROM booking_costs WHERE booking_reference='MC7Q2P'").first()).total_driver_cost,900);
  assert.deepEqual(sent.filter((m)=>m.method==='editMessageText').at(-1).reply_markup.inline_keyboard.flat().map((b)=>b.text),['Assign driver','Add outsource driver','Open booking']);
  await tap('bk_drv:MC7Q2P');
  for(const [q,a] of [[/full name/,'Somchai Jaidee'],[/phone/,'081 234 5678'],[/plate/,'1กข 1234'],[/model/,'Toyota Camry, black'],[/licence/,'12345678']]){assert.match(lastPrompt().text,q);await say(a);}
  const d=await db.prepare("SELECT full_name,phone,car_plate,vehicle,license_number FROM drivers WHERE full_name='Somchai Jaidee'").first();
  assert.deepEqual([d.phone,d.car_plate,d.vehicle,d.license_number],['081 234 5678','1กข 1234','Toyota Camry, black','12345678']);
  const job=sent.filter((m)=>m.method==='sendMessage').map((m)=>m.text).find((t)=>t.startsWith('Economy sedan🚗'));
  assert.ok(job,'job posted');
  for(const line of ['ชื่อลูกค้า: Mansi Choksi','จำนวน: 2 คน, 2 กระเป๋า','วันที่/เวลา: 14/10/2026 12:45','ไฟลท์: PG305','รับ: Trat airport','ส่ง: Dinso Resort &amp; Villas Ko Chang','ราคา: -']) assert.ok(job.includes(line),line);
  assert.match(job,/\/driver\/trip\/[a-f0-9]{48}/);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_assignments WHERE booking_reference='MC7Q2P' AND revoked_at IS NULL").first()).n,1);
  assert.deepEqual(sent.filter((m)=>m.method==='editMessageText').at(-1).reply_markup.inline_keyboard.flat().map((b)=>b.text),['Open booking']);
 }finally{globalThis.fetch=real;delete globalThis.__chatTest.env.TELEGRAM_BOT_TOKEN;}
});
test('Telegram booking: Assign driver lists our own drivers (not outsource) and assigns the one tapped',async()=>{
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_BOT_TOKEN:'t'});
 const sent=[];const real=globalThis.fetch;let mid=8000;
 globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://api.telegram.org')){const body=JSON.parse(init.body);sent.push({method:u.split('/').pop(),...body});return new Response(JSON.stringify({ok:true,result:{message_id:++mid,chat:{id:-100}}}));}return real(url,init);};
 try{
  await db.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,amount_paid,flight_number,status,created_at) VALUES('PK4D7R','Ann','Lee','a@x.co','','BKK','Pattaya','2026-10-20','09:00',2,1,'economy_sedan','card',1800,1800,'','confirmed',?)").bind(new Date().toISOString()).run();
  await db.prepare("INSERT INTO drivers(id,full_name,phone,vehicle,car_plate,driver_type,status) VALUES('d-staff','Prasit Staff','0811111111','Camry','1กก 1','staff','active'),('d-out','Temp Outsource','0822222222','Vios','2ขข 2','outsource','active'),('d-off','Old Driver','0833333333','Altis','3คค 3','staff','inactive')").run();
  await db.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES('PK4D7R',7999,?)").bind(new Date().toISOString()).run();
  let u=900;const tap=(data)=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify({update_id:++u,callback_query:{id:'q',from:{id:777,first_name:'Alex'},data,message:{message_id:7999,chat:{id:-100}}}})}));
  await tap('booking_assign:PK4D7R');
  await tap('bk_dl:PK4D7R');
  const list=sent.filter((m)=>m.method==='editMessageReplyMarkup').at(-1).reply_markup.inline_keyboard.flat();
  const names=list.map((b)=>b.text);assert.ok(names.includes('Prasit Staff'));assert.ok(!names.includes('Temp Outsource'));assert.ok(!names.includes('Old Driver'));assert.equal(names.at(-1),'Back');
  await tap('bk_dp:PK4D7R:d-out');
  assert.equal((await db.prepare("SELECT driver_done FROM telegram_booking_cards WHERE booking_reference='PK4D7R'").first()).driver_done,0);
  await tap(list.find((b)=>b.text==='Prasit Staff').callback_data);
  const card=await db.prepare("SELECT driver_done,driver_form_json FROM telegram_booking_cards WHERE booking_reference='PK4D7R'").first();
  assert.equal(card.driver_done,1);assert.equal(JSON.parse(card.driver_form_json).driverId,'d-staff');
  assert.deepEqual(sent.filter((m)=>m.method==='editMessageText').at(-1).reply_markup.inline_keyboard.flat().map((b)=>b.text),['Set cost','Open booking']);
 }finally{globalThis.fetch=real;delete globalThis.__chatTest.env.TELEGRAM_BOT_TOKEN;}
});
test('Telegram cancellation and change requests: cards with buttons, booking updated, driver told in Thai',async()=>{
 for(const c of ['cancelled_at TEXT','updated_at TEXT','booking_version INTEGER NOT NULL DEFAULT 1'])try{await db.exec(`ALTER TABLE bookings ADD COLUMN ${c};`);}catch{}
 await db.exec("CREATE TABLE IF NOT EXISTS booking_change_requests(id TEXT PRIMARY KEY,booking_reference TEXT,status TEXT DEFAULT 'pending',pickup TEXT,dropoff TEXT,pickup_date TEXT,pickup_time TEXT,vehicle_id TEXT,original_total INTEGER,revised_total INTEGER,price_difference INTEGER,reason TEXT,booking_version INTEGER,created_at TEXT,resolved_at TEXT);");
 const hook=await vite.ssrLoadModule('/app/api/integrations/telegram/webhook/route.ts');
 const ch=await vite.ssrLoadModule('/lib/telegram/booking-changes.ts');
 Object.assign(globalThis.__chatTest.env,{TELEGRAM_BOT_TOKEN:'t'});
 const sent=[];const real=globalThis.fetch;let mid=9000;
 globalThis.fetch=async(url,init)=>{const u=String(url);if(u.startsWith('https://api.telegram.org')){const body=JSON.parse(init.body);sent.push({method:u.split('/').pop(),...body});return new Response(JSON.stringify({ok:true,result:{message_id:++mid,chat:{id:-100}}}));}return real(url,init);};
 const tap=(data)=>hook.POST(new Request('https://example.invalid/api/integrations/telegram/webhook',{method:'POST',headers:{'content-type':'application/json','x-telegram-bot-api-secret-token':'s'.repeat(24)},body:JSON.stringify({update_id:Math.floor(Math.random()*1e9),callback_query:{id:'q',from:{id:777,first_name:'Alex'},data,message:{message_id:1,chat:{id:-100}}}})}));
 const msgs=()=>sent.filter((m)=>m.method==='sendMessage').map((m)=>m.text);
 try{
  // Change request on MC7Q2P (driver already has the job from the previous test).
  await db.prepare("INSERT INTO booking_change_requests VALUES('chg-1','MC7Q2P','pending','Trat airport','KC Grande Resort, Ko Chang','2026-10-14','15:00','comfort_suv',2400,2900,500,'Flight moved',1,?,NULL)").bind(new Date().toISOString()).run();
  assert.equal(await ch.notifyChangeRequest('chg-1'),true);assert.equal(await ch.notifyChangeRequest('chg-1'),false);
  const card=msgs().at(-1);console.log('\n'+card+'\n');
  assert.match(card,/คำขอเปลี่ยนแปลงการจอง MC7Q2P/);assert.match(card,/\+THB 500/);
  assert.deepEqual(sent.at(-1).reply_markup.inline_keyboard.flat().map((b)=>b.callback_data),['chg_ok:chg-1','chg_no:chg-1']);
  await tap('chg_ok:chg-1');
  const b=await db.prepare("SELECT pickup_time,dropoff,vehicle,total,booking_version FROM bookings WHERE reference='MC7Q2P'").first();
  assert.deepEqual([b.pickup_time,b.dropoff,b.vehicle,b.total,b.booking_version],['15:00','KC Grande Resort, Ko Chang','comfort_suv',2900,2]);
  const update=msgs().find((t)=>t.includes('แก้ไขงาน MC7Q2P'));assert.ok(update);console.log(update+'\n');assert.match(update,/15:00/);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_assignments WHERE booking_reference='MC7Q2P' AND revoked_at IS NULL").first()).n,1);
  await tap('chg_ok:chg-1');assert.equal(msgs().filter((t)=>t.includes('แก้ไขงาน')).length,1); // once only
  // Cancellation request → Cancel booking.
  assert.equal(await ch.notifyCancellationRequest('MC7Q2P'),true);
  const cancel=msgs().at(-1);console.log(cancel+'\n');assert.match(cancel,/คำขอยกเลิกการจอง MC7Q2P/);
  await tap('bk_cancel:MC7Q2P');
  assert.equal((await db.prepare("SELECT status FROM bookings WHERE reference='MC7Q2P'").first()).status,'cancelled');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_assignments WHERE booking_reference='MC7Q2P' AND revoked_at IS NULL").first()).n,0);
  const gone=msgs().at(-1);console.log(gone+'\n');assert.match(gone,/ยกเลิกงาน MC7Q2P/);assert.match(gone,/คนขับไม่ต้องไปรับ/);
  assert.match(sent.filter((m)=>m.method==='editMessageText').at(-1).text,/ยกเลิกแล้ว โดย/);
 }finally{globalThis.fetch=real;delete globalThis.__chatTest.env.TELEGRAM_BOT_TOKEN;}
});
test('site translation: cached lines come from D1, new lines are translated once by AI, staff corrections are kept',async()=>{
 const tr=await vite.ssrLoadModule('/app/api/translate/route.ts');
 const lib=await vite.ssrLoadModule('/lib/site-translate.ts');
 globalThis.__chatTest.env.ANTHROPIC_API_KEY='k';
 const real=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,init)=>{if(String(url).includes('anthropic.com')){calls++;const texts=JSON.parse(JSON.parse(init.body).messages[0].content);return new Response(JSON.stringify({id:'m',type:'message',role:'assistant',model:'x',content:[{type:'text',text:JSON.stringify(Object.fromEntries(Object.entries(texts).map(([k,t])=>[k,'[ko] '+t])))}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10}}),{headers:{'content-type':'application/json'}});}return real(url,init);};
 const ask=(body)=>tr.POST(new Request('https://example.invalid/api/translate',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','cf-connecting-ip':'tx-test'},body:JSON.stringify(body)})).then((r)=>r.json());
 try{
  const a=await ask({lang:'ko',path:'/help',texts:['Book a ride','Free cancellation']});
  assert.deepEqual(a.translations,{'Book a ride':'[ko] Book a ride','Free cancellation':'[ko] Free cancellation'});assert.equal(calls,1);
  await ask({lang:'ko',path:'/help',texts:['Book a ride']});assert.equal(calls,1); // cached
  assert.deepEqual((await ask({lang:'ko',path:'/admin/bookings',texts:['Book a ride']})).translations,{}); // staff pages never
  assert.equal((await ask({lang:'xx',texts:['Hi']})).error,'Unsupported language.');
  await env().DB.prepare("UPDATE site_translations SET text='예약하기',status='reviewed' WHERE lang='ko' AND hash=?").bind(await lib.textHash('Book a ride')).run();
  assert.equal((await ask({lang:'ko',texts:['Book a ride']})).translations['Book a ride'],'예약하기');
 }finally{globalThis.fetch=real;delete globalThis.__chatTest.env.ANTHROPIC_API_KEY;}
});
const env=()=>globalThis.__chatTest.env;
