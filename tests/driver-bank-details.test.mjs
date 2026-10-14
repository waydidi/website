import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { migrationStatements } from './helpers/migrations.mjs';

// The driver's bank details ("กรอกข้อมูลบัญชี"), sent from the trip link after the Drop: only with the link's
// token, only once the Drop is done, only in the assigned driver's own name; the Admin group is told once.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__bankTest={env:{DB:d1,TELEGRAM_BOT_TOKEN:'test-token',TELEGRAM_CHAT_ID:'-100111'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'bank-boundaries',enforce:'pre',resolveId(id){
 if(id==='cloudflare:workers')return '\0b-env';
 if(id==='next/headers')return '\0b-headers';
},load(id){
 if(id==='\0b-env')return 'export const env=globalThis.__bankTest.env';
 if(id==='\0b-headers')return 'export async function cookies(){return {get(){return undefined}}};export async function headers(){return new Headers()}';
}}],server:{middlewareMode:true}});
const realFetch=globalThis.fetch, sent=[];
globalThis.fetch=async(url,init)=>{
 if(!String(url).startsWith('https://api.telegram.org'))return realFetch(url,init);
 sent.push(JSON.parse(init.body));
 return Response.json({ok:true,result:{message_id:900+sent.length,chat:{id:-100111}}});
};
after(async()=>{globalThis.fetch=realFetch;await vite.close();await mf.dispose();delete globalThis.__bankTest;});

const rules=await vite.ssrLoadModule('/lib/driver-bank-rules.ts');
const route=await vite.ssrLoadModule('/app/api/driver/bank/route.ts');
const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
const now='2026-10-13T00:00:00Z';
let count=0;
async function seed(status='completed',method='card'){
 const reference='BANK'+(++count);
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,access_token_hash,created_at,updated_at) VALUES(?,'Test','t@example.invalid','Bangkok','Pattaya','2026-11-01','09:00',2,1,'economy_sedan',?,1000,'confirmed','h',?,?)").bind(reference,method,now,now).run();
 await d1.prepare("INSERT INTO telegram_booking_cards(booking_reference,telegram_message_id,created_at) VALUES(?,4400,?)").bind(reference,now).run();
 const driverId='drv-'+count, token=crypto.randomUUID().replaceAll('-','')+'1234567890abcdef';
 await d1.prepare("INSERT INTO drivers(id,full_name,phone,status,created_at,updated_at) VALUES(?,?,'0812345678','active',?,?)").bind(driverId,'สมชาย ใจดี',now,now).run();
 await d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,updated_at) VALUES(?,?,'outbound',?,?,?,'owner',?,?,?)")
  .bind('as-'+count,reference,driverId,await sha256(token),status,now,new Date(Date.now()+3600000).toISOString(),now).run();
 return {reference,driverId,token,assignmentId:'as-'+count};
}
const post=(body,{origin='https://example.invalid',type='application/json'}={})=>route.POST(new Request('https://example.invalid/api/driver/bank',{method:'POST',headers:{...(origin?{origin}:{}),'content-type':type},body:typeof body==='string'?body:JSON.stringify(body)}));
const good={bankCode:'KBANK',accountNumber:'123-4-56789-0',accountName:'สมชาย ใจดี'};
const rows=async(ref)=>({payout:await d1.prepare('SELECT COUNT(*) n FROM driver_payout_details WHERE booking_reference=?').bind(ref).first('n'),events:await d1.prepare("SELECT COUNT(*) n FROM booking_events WHERE booking_reference=? AND event_type='driver_bank_details_submitted'").bind(ref).first('n')});

test('the account name must be the assigned driver\'s name; the rules check bank, number and name',()=>{
 assert.equal(rules.normalizePersonName('นาย  สมชาย ใจดี'),'สมชายใจดี');
 assert.equal(rules.normalizePersonName('Mr. Somchai  JAIDEE'),'somchaijaidee');
 assert.ok(rules.accountNameMatches('นางสาว สมหญิง รักดี','สมหญิง รักดี'));
 assert.ok(rules.accountNameMatches('SOMCHAI JAIDEE','Somchai Jaidee'));
 assert.ok(!rules.accountNameMatches('สมชาย','สมชาย ใจดี'));
 assert.ok(!rules.accountNameMatches('สมศักดิ์ ใจดี','สมชาย ใจดี'));
 assert.ok(!rules.accountNameMatches('','')); // an empty driver name never matches
 const p=(o)=>rules.parseBankDetails({...good,...o},'สมชาย ใจดี');
 assert.deepEqual(p({}),{ok:true,value:{bankCode:'KBANK',accountNumber:'1234567890',accountName:'สมชาย ใจดี'}});
 assert.deepEqual(p({bankCode:'kbank'}).value.bankCode,'KBANK');
 assert.equal(p({bankCode:'XYZ'}).field,'bank');assert.equal(p({bankCode:''}).error,'กรุณาเลือกธนาคาร');
 assert.equal(p({accountNumber:'12345'}).field,'number');assert.equal(p({accountNumber:'1'.repeat(17)}).field,'number');
 assert.equal(p({accountName:'x'}).field,'name');
 assert.deepEqual([p({accountName:'ใครสักคน ใจดี'}).field,p({accountName:'ใครสักคน ใจดี'}).error],['name','ชื่อบัญชีต้องตรงกับชื่อคนขับ (สมชาย ใจดี)']);
 assert.equal(rules.maskAccount('1234567890'),'xxxxxx7890');
});

test('after the Drop, the details are saved with the job and as the driver\'s account, and the Admin group gets them once',async()=>{
 const t=await seed();sent.length=0;
 const res=await post({token:t.token,...good,accountName:'นาย สมชาย  ใจดี'});
 assert.equal(res.status,200);
 const payout=await d1.prepare('SELECT bank_code,account_number,account_name,driver_id FROM driver_payout_details WHERE assignment_id=?').bind(t.assignmentId).first();
 assert.deepEqual(payout,{bank_code:'KBANK',account_number:'1234567890',account_name:'นาย สมชาย ใจดี',driver_id:t.driverId});
 assert.deepEqual(await d1.prepare('SELECT bank_code,bank_account_number,bank_account_name FROM drivers WHERE id=?').bind(t.driverId).first(),{bank_code:'KBANK',bank_account_number:'1234567890',bank_account_name:'นาย สมชาย ใจดี'});
 assert.equal(sent.length,1);
 assert.equal(sent[0].chat_id,'-100111');
 assert.equal(sent[0].reply_parameters.message_id,4400);
 assert.equal(sent[0].text,['💳 <b>ข้อมูลบัญชีคนขับ</b> · '+t.reference,'คนขับ: สมชาย ใจดี','ธนาคาร: ธนาคารกสิกรไทย','เลขบัญชี: <code>1234567890</code>','ชื่อบัญชี: นาย สมชาย ใจดี'].join('\n'));
 // Sending the same details again (a retry) changes nothing and announces nothing.
 assert.equal((await post({token:t.token,...good})).status,200);
 assert.deepEqual(await rows(t.reference),{payout:1,events:1});
 assert.equal(sent.length,1);
});

test('a different account from the saved one replaces it and is flagged with the old one partly hidden',async()=>{
 const t=await seed();
 await d1.prepare("UPDATE drivers SET bank_code='SCB',bank_account_number='9876543210',bank_account_name='สมชาย ใจดี' WHERE id=?").bind(t.driverId).run();
 sent.length=0;
 assert.equal((await post({token:t.token,...good})).status,200);
 assert.equal(await d1.prepare('SELECT bank_account_number FROM drivers WHERE id=?').bind(t.driverId).first('bank_account_number'),'1234567890');
 assert.match(sent[0].text,/\n\n⚠️ เปลี่ยนจากบัญชีเดิม: ธนาคารไทยพาณิชย์ xxxxxx3210 — ตรวจสอบก่อนโอนเงิน$/);
 assert.ok(!sent[0].text.includes('9876543210'),'the old account number is never shown in full');
 // The same account as already saved is not a change.
 const again=await seed();
 await d1.prepare("UPDATE drivers SET bank_code='KBANK',bank_account_number='1234567890' WHERE id=?").bind(again.driverId).run();
 sent.length=0;
 await post({token:again.token,...good});
 assert.doesNotMatch(sent[0].text,/⚠️/);
});

test('refused without a valid driver link, before the Drop, from another site, or in someone else\'s name: nothing is saved or sent',async()=>{
 const t=await seed('trip_started'), done=await seed(), cash=await seed('completed','cash');
 sent.length=0;
 const cases=[
  [await post({token:'f'.repeat(48),...good}),404],            // an unknown link
  [await post({token:'nope',...good}),404],                    // a malformed link
  [await post({...good}),404],                                 // no link at all
  [await post({token:t.token,...good}),409],                   // the Drop is not done yet
  [await post({token:cash.token,...good}),409],               // a cash job has no bank page
  [await post({token:done.token,...good},{origin:'https://evil.example'}),403],
  [await post(JSON.stringify({token:done.token,...good}),{type:'text/plain'}),403],
  [await post('not json'),400],
  [await post({token:done.token,...good,bankCode:'NOPE'}),400],
  [await post({token:done.token,...good,accountNumber:'12'}),400],
  [await post({token:done.token,...good,accountName:'ใครสักคน ใจดี'}),400],
 ];
 for(const [res,status] of cases)assert.equal(res.status,status);
 assert.deepEqual(await rows(t.reference),{payout:0,events:0});
 assert.deepEqual(await rows(done.reference),{payout:0,events:0});
 assert.deepEqual(await rows(cash.reference),{payout:0,events:0});
 assert.equal(await d1.prepare("SELECT COUNT(*) n FROM drivers WHERE bank_account_number<>'' AND id IN (?,?)").bind(t.driverId,done.driverId).first('n'),0);
 assert.equal(sent.length,0);
 const wrongName=await (await post({token:done.token,...good,accountName:'ใครสักคน ใจดี'})).json();
 assert.deepEqual(wrongName,{error:'ชื่อบัญชีต้องตรงกับชื่อคนขับ (สมชาย ใจดี)',field:'name'});
});

test('a link only changes its own driver, and two requests at once announce once',async()=>{
 const a=await seed(), b=await seed();
 sent.length=0;
 const [r1,r2]=await Promise.all([post({token:a.token,...good}),post({token:a.token,...good})]);
 assert.deepEqual([r1.status,r2.status],[200,200]);
 assert.equal(sent.length,1);
 assert.deepEqual(await rows(a.reference),{payout:1,events:1});
 assert.equal(await d1.prepare('SELECT bank_account_number FROM drivers WHERE id=?').bind(b.driverId).first('bank_account_number'),'');
});

test('after the Drop the job just completes: the trip link only asks for bank details when DRIVER_BANK_DETAILS=1 (and never for cash)',async()=>{
 const trips=await vite.ssrLoadModule('/app/api/driver/trips/[token]/route.ts');
 const needed=async(s)=>(await (await trips.GET(new Request('https://example.invalid/api/driver/trips/'+s.token),{params:Promise.resolve({token:s.token})})).json()).payoutNeeded;
 const card=await seed('completed','card'),cash=await seed('completed','cash');
 assert.equal(await needed(card),false); // off by default
 globalThis.__bankTest.env.DRIVER_BANK_DETAILS='1';
 try{
  assert.equal(await needed(card),true);
  assert.equal(await needed(cash),false);
 }finally{delete globalThis.__bankTest.env.DRIVER_BANK_DETAILS;}
});
