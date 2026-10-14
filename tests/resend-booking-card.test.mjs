import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// Admin → booking details → Telegram → Re-send card: the booking's card is posted to the team group again.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__resend={env:{DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100111'},admin:{email:'owner@example.invalid'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'resend-boundaries',enforce:'pre',resolveId(id){
 if(id==='cloudflare:workers')return '\0r-env';
 if(id==='@/lib/admin'||id===root+'lib/admin'||id===root+'/lib/admin'||id.endsWith('/lib/admin.ts'))return '\0r-admin';
},load(id){
 if(id==='\0r-env')return 'export const env=globalThis.__resend.env';
 if(id==='\0r-admin')return 'export async function getWaydidiAdmin(){return globalThis.__resend.admin}';
}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[];let mode='ok',nextId=700;
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 const method=String(url).split('/').pop(),body=typeof init.body==='string'?JSON.parse(init.body):init.body;
 sent.push({method,body});
 if(mode==='down')return new Response(JSON.stringify({ok:false,error_code:429,description:'Too Many Requests',parameters:{retry_after:30}}),{status:429});
 return Response.json({ok:true,result:{message_id:nextId++,chat:{id:-100111}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__resend;});
const cards=await vite.ssrLoadModule('/lib/telegram/bookings.ts');
const route=await vite.ssrLoadModule('/app/api/admin/bookings/[reference]/telegram-card/route.ts');
const outbox=await vite.ssrLoadModule('/lib/telegram/outbox.ts');
const at='2026-10-13T00:00:00Z';
async function booking(ref,{status='confirmed',message=151,ack=null}={}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_surname,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,created_at,access_token_hash,updated_at) VALUES(?,'Mansi','Choksi','m@example.com','+66811112222','Koh Chang','Bangkok','2099-10-14','12:45',2,2,'economy_sedan','cash',2500,?,?,?,?)").bind(ref,status,at,'tok-'+ref,at).run();
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,acknowledged_by,created_at) VALUES(?,?,?,?)").bind(ref,message,ack,at).run();
}
const cardMessage=(ref)=>d1.prepare("SELECT telegram_message_id,acknowledged_by FROM telegram_booking_cards WHERE booking_reference=?").bind(ref).first();
const post=(ref)=>route.POST(new Request('https://example.invalid/x',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:'{}'}),{params:Promise.resolve({reference:ref})});

test('the card is posted again as a new message with its buttons, and the new message takes over',async()=>{
 await booking('RC0001',{ack:'Admin'});
 sent.length=0;
 const res=await post('RC0001');
 assert.equal(res.status,200);
 const msgs=sent.filter(s=>s.method==='sendMessage'&&s.body.chat_id==='-100111');
 assert.equal(msgs.length,1);
 assert.match(msgs[0].body.text,/RC0001/);assert.match(msgs[0].body.text,/Mansi/);
 assert.ok(msgs[0].body.reply_markup.inline_keyboard.length>0);
 assert.deepEqual(await cardMessage('RC0001'),{telegram_message_id:700,acknowledged_by:'Admin'}); // new message id, taken-by kept
 await cards.postMissingBookingCards(new Date('2026-10-13T01:00:00Z'));
 assert.equal(sent.filter(s=>s.method==='sendMessage').length,1); // the catch-up posts nothing more
});

test('a second tap posts another card (a deliberate re-send), and each has its own record',async()=>{
 await booking('RC0002');
 sent.length=0;
 assert.equal((await post('RC0002')).status,200);
 assert.equal((await post('RC0002')).status,200);
 assert.equal(sent.filter(s=>s.method==='sendMessage').length,2);
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM telegram_delivery_jobs WHERE booking_reference='RC0002'").first()).n,2);
});

test('only a confirmed, existing booking; only the admin',async()=>{
 await booking('RC0003',{status:'cancelled'});await booking('RC0004',{status:'binned'});await d1.prepare("UPDATE bookings SET binned_at=? WHERE reference='RC0004'").bind(at).run();
 assert.equal((await post('RC0003')).status,409);
 assert.equal((await post('RC0004')).status,404);
 assert.equal((await post('NOPE99')).status,404);
 globalThis.__resend.admin=null;
 try{assert.equal((await post('RC0001')).status,401);}finally{globalThis.__resend.admin={email:'owner@example.invalid'};}
 const before=sent.length;
 assert.equal((await route.POST(new Request('https://example.invalid/x',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'}),{params:Promise.resolve({reference:'RC0001'})})).status,403);
 assert.equal(sent.length,before);
});

test('when Telegram is busy the card stays queued for a retry and the catch-up does not post a second one',async()=>{
 await booking('RC0005');
 mode='down';
 try{await post('RC0005');}finally{mode='ok';}
 assert.equal((await cardMessage('RC0005')).telegram_message_id,0);
 const queued=await d1.prepare("SELECT id,status FROM telegram_delivery_jobs WHERE booking_reference='RC0005'").all();
 assert.equal(queued.results.length,1);assert.match(queued.results[0].id,/resend/);
 sent.length=0;
 await cards.postMissingBookingCards(new Date('2026-10-13T01:00:00Z'));
 assert.equal(sent.filter(s=>s.method==='sendMessage').length,0);
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM telegram_delivery_jobs WHERE booking_reference='RC0005'").first()).n,1);
});
