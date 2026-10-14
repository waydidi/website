import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// A round trip the customer pays in two parts: the price to collect for the first trip and for the second trip.
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__legp={env:{DB:d1},admin:{id:'a1',displayName:'Admin A',email:'a@example.invalid',role:'owner'}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'legp-boundaries',enforce:'pre',resolveId(id){
 if(id==='cloudflare:workers')return '\0lp-env';
 if(id==='@/lib/admin'||id===root+'lib/admin'||id===root+'/lib/admin'||id.endsWith('/lib/admin.ts'))return '\0lp-admin';
},load(id){
 if(id==='\0lp-env')return 'export const env=globalThis.__legp.env';
 if(id==='\0lp-admin')return 'export async function getWaydidiAdmin(){return globalThis.__legp.admin}';
}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__legp;});
const rules=await vite.ssrLoadModule('/lib/leg-price-rules.ts');
const prices=await vite.ssrLoadModule('/lib/leg-prices.ts');
const route=await vite.ssrLoadModule('/app/api/admin/bookings/[reference]/leg-prices/route.ts');
const at='2026-10-13T00:00:00Z';
async function booking(ref,{total=2500,roundtrip=true,status='confirmed'}={}){
 await d1.prepare("INSERT INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,return_date,return_time,passengers,luggage,vehicle,payment_method,total,status,created_at,access_token_hash,updated_at) VALUES(?,'Mansi','m@example.com','+66811112222','Trat Airport','Koh Chang','2099-10-14','12:45',?,?,2,2,'economy_sedan','cash',?,?,?,?,?)").bind(ref,roundtrip?'2099-10-18':null,roundtrip?'09:00':null,total,status,at,'tok-'+ref,at).run();
}
const post=(ref,body)=>route.POST(new Request('https://example.invalid/x',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({reference:ref})});
const rowsOf=(ref)=>d1.prepare("SELECT first_minor f,second_minor s,total_minor t,set_by FROM booking_leg_prices WHERE booking_reference=? ORDER BY created_at,id").bind(ref).all().then(r=>r.results);

test('the two prices must both be filled and add up to the booking total (satang, no floats)',()=>{
 assert.equal(rules.bahtToMinor('1,500'),150000);assert.equal(rules.bahtToMinor('1500.50'),150050);assert.equal(rules.bahtToMinor(1000),100000);
 for(const bad of ['','0',-5,'abc',NaN,null,'10.005',20_000_000])assert.equal(rules.bahtToMinor(bad),null);
 assert.deepEqual(rules.parseLegPrices({first:'1500',second:'1000'},250000),{ok:true,value:{firstMinor:150000,secondMinor:100000}});
 assert.match(rules.parseLegPrices({first:'',second:'1000'},250000).error,/first trip/);
 assert.match(rules.parseLegPrices({first:'1500',second:'0'},250000).error,/second trip/);
 assert.match(rules.parseLegPrices({first:'1500',second:'900'},250000).error,/add up to the booking total \(THB 2,500\)/);
 assert.equal(rules.parseLegPrices({first:'0.10',second:'0.20'},30).ok,true); // 0.1 + 0.2 is exactly 30 satang
 for(const role of ['owner','operations','finance'])assert.ok(rules.mayEditLegPrices(role));
 for(const role of ['support','editor','','x'])assert.ok(!rules.mayEditLegPrices(role));
});

test('saving records both prices once; the booking then shows them, first and second',async()=>{
 await booking('LP0001');
 assert.equal((await post('LP0001',{first:'1500',second:'1000'})).status,200);
 assert.deepEqual(await rowsOf('LP0001'),[{f:150000,s:100000,t:250000,set_by:'Admin A'}]);
 assert.deepEqual([...(await prices.legSplits(['LP0001','NOPE'])).entries()],[['LP0001',{first:1500,second:1000}]]);
 // The same values again (a retry or two taps): nothing new is recorded.
 const again=await post('LP0001',{first:1500,second:1000});assert.equal((await again.json()).changed,false);
 await Promise.all([post('LP0001',{first:1000,second:1500}),post('LP0001',{first:1000,second:1500})]);
 assert.equal((await rowsOf('LP0001')).length,2);
 assert.deepEqual((await prices.legSplits(['LP0001'])).get('LP0001'),{first:1000,second:1500}); // the newest counts; the earlier one stays on record
});

test('wrong totals, one-way trips, finished or cancelled bookings and unknown bookings are refused and nothing is saved',async()=>{
 await booking('LP0002');await booking('LP0003',{roundtrip:false});await booking('LP0004',{status:'cancelled'});await booking('LP0005',{status:'completed'});
 const r1=await post('LP0002',{first:'1500',second:'900'});assert.equal(r1.status,400);assert.match((await r1.json()).error,/add up/);
 assert.equal((await post('LP0002',{first:'',second:'2500'})).status,400);
 assert.equal((await post('LP0002',{})).status,400);
 assert.equal((await post('LP0003',{first:1000,second:1500})).status,409);
 assert.equal((await post('LP0004',{first:1000,second:1500})).status,409);
 assert.equal((await post('LP0005',{first:1000,second:1500})).status,409);
 assert.equal((await post('NOPE99',{first:1000,second:1500})).status,404);
 for(const ref of ['LP0002','LP0003','LP0004','LP0005'])assert.equal((await rowsOf(ref)).length,0);
});

test('only the owner, operations or finance, signed in, from this site',async()=>{
 await booking('LP0006');
 const admin=globalThis.__legp.admin;
 globalThis.__legp.admin=null;
 try{assert.equal((await post('LP0006',{first:1000,second:1500})).status,401);}finally{globalThis.__legp.admin=admin;}
 for(const role of ['support','editor']){globalThis.__legp.admin={...admin,role};try{assert.equal((await post('LP0006',{first:1000,second:1500})).status,403);}finally{globalThis.__legp.admin=admin;}}
 const other=await route.POST(new Request('https://example.invalid/x',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({first:1000,second:1500})}),{params:Promise.resolve({reference:'LP0006'})});
 assert.equal(other.status,403);
 assert.equal((await rowsOf('LP0006')).length,0);
 for(const role of ['operations','finance']){globalThis.__legp.admin={...admin,role};try{assert.equal((await post('LP0006',{first:1000,second:1500})).status,200);}finally{globalThis.__legp.admin=admin;}}
});

test('a split that no longer adds up to the booking total (the price was changed) is ignored',async()=>{
 await booking('LP0007');
 await post('LP0007',{first:1500,second:1000});
 assert.ok((await prices.legSplits(['LP0007'])).has('LP0007'));
 await d1.prepare("UPDATE bookings SET total=3000 WHERE reference='LP0007'").run();
 assert.equal((await prices.legSplits(['LP0007'])).size,0); // shows the booking's normal price until it is split again
 assert.equal((await post('LP0007',{first:1500,second:1500})).status,200);
 assert.deepEqual((await prices.legSplits(['LP0007'])).get('LP0007'),{first:1500,second:1500});
});
