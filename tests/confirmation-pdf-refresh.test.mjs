import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// Admin → booking card → PDF → Download, and the stored PDF made again after an edit (same reference, same key).
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
const files=new Map();
const state=globalThis.__pdfTest={admin:{email:'owner@example.invalid'},env:{DB:d1,BUCKET:{put:async(key,body)=>{files.set(key,new Uint8Array(body instanceof Uint8Array?body:await new Response(body).arrayBuffer()));},get:async(key)=>files.has(key)?{arrayBuffer:async()=>files.get(key)}:null}}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'pdf-boundaries',enforce:'pre',resolveId(id){
 if(id==='cloudflare:workers')return '\0p-env';
 if(id==='@/lib/admin'||id===root+'lib/admin'||id===root+'/lib/admin'||id.endsWith('/lib/admin.ts'))return '\0p-admin';
},load(id){
 if(id==='\0p-env')return 'export const env=globalThis.__pdfTest.env';
 if(id==='\0p-admin')return 'export async function getWaydidiAdmin(){return globalThis.__pdfTest.admin}';
}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__pdfTest;});
const refresh=await vite.ssrLoadModule('/lib/confirmation-refresh.ts');
const download=await vite.ssrLoadModule('/app/api/admin/bookings/[reference]/confirmation/route.ts');
const at='2026-10-13T00:00:00Z';
async function booking(ref,{status='confirmed',pdfKey=`confirmations/${ref}.pdf`,method='card',pay=null}={}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,created_at,access_token_hash,updated_at,pdf_key) VALUES(?,'Jessica','jess@example.com','+66811112222','Chiang Mai Airport','Nimman Hotel','2099-11-24','14:30',2,0,'economy_sedan',?,2500,?,?,?,?,?)").bind(ref,method,status,at,'tok-'+ref,at,pdfKey).run();
 if(pay)await d1.prepare("UPDATE bookings SET payment_status=? WHERE reference=?").bind(pay,ref).run();
}
const get=(ref)=>download.GET(new Request('https://example.invalid/x'),{params:Promise.resolve({reference:ref})});
const bytes=async(res)=>new Uint8Array(await res.arrayBuffer());
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

test('the admin download is the current booking as a PDF named by its reference, and only for the admin',async()=>{
 await booking('PD0001');
 const res=await get('PD0001');
 assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/pdf');
 assert.match(res.headers.get('content-disposition'),/PD0001/);
 const before=await bytes(res);assert.equal(new TextDecoder().decode(before.slice(0,5)),'%PDF-');
 await d1.prepare("UPDATE bookings SET pickup='New hotel, Chiang Mai',pickup_time='16:00' WHERE reference='PD0001'").run();
 const after=await get('PD0001');
 assert.match(after.headers.get('content-disposition'),/PD0001/); // the same reference
 assert.equal(same(before,await bytes(after)),false); // a new PDF with the new details
 state.admin=null;
 try{assert.equal((await get('PD0001')).status,401);}finally{state.admin={email:'owner@example.invalid'};}
 assert.equal((await get('NOPE99')).status,404);
});

test('after an edit the stored PDF is made again under the same key; nothing else is stored',async()=>{
 await booking('PD0002');
 assert.equal(await refresh.refreshStoredConfirmationPdf('PD0002'),true);
 const first=files.get('confirmations/PD0002.pdf');assert.ok(first);
 await d1.prepare("UPDATE bookings SET dropoff='Airport Plaza Hotel',passengers=3 WHERE reference='PD0002'").run();
 assert.equal(await refresh.refreshStoredConfirmationPdf('PD0002'),true);
 assert.equal(same(first,files.get('confirmations/PD0002.pdf')),false);
 assert.deepEqual([...files.keys()].filter(k=>k.includes('PD0002')),['confirmations/PD0002.pdf']); // same key, no copies
 assert.equal((await d1.prepare("SELECT pdf_key FROM bookings WHERE reference='PD0002'").first()).pdf_key,'confirmations/PD0002.pdf');
});

test('no stored PDF to refresh (never stored, not confirmed, or no storage) is quietly skipped',async()=>{
 await booking('PD0003',{pdfKey:null});await booking('PD0004',{status:'cancelled'});
 assert.equal(await refresh.refreshStoredConfirmationPdf('PD0003'),false);
 assert.equal(await refresh.refreshStoredConfirmationPdf('PD0004'),false);
 assert.equal(await refresh.refreshStoredConfirmationPdf('MISSING'),false);
 const bucket=state.env.BUCKET;state.env.BUCKET=undefined;
 try{assert.equal(await refresh.refreshStoredConfirmationPdf('PD0002'),false);}finally{state.env.BUCKET=bucket;}
});

test('a bank-transfer booking marked paid downloads a different PDF from the "waiting for payment" one (it states what was paid)',async()=>{
 await booking('PD0010',{method:'transfer',pay:'pending'});
 const waiting=await bytes(await get('PD0010'));
 await d1.prepare("UPDATE bookings SET payment_status='paid' WHERE reference='PD0010'").run();
 const paid=await bytes(await get('PD0010'));
 assert.equal(same(waiting,paid),false);
 assert.equal(same(paid,await bytes(await get('PD0010'))),true); // and it is stable
 // The stored copy follows too.
 assert.equal(await refresh.refreshStoredConfirmationPdf('PD0010'),true);
 assert.equal(same(files.get('confirmations/PD0010.pdf'),paid),true);
});
