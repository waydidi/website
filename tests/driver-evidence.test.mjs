import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import jpeg from 'jpeg-js';
import { migrationStatements } from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__evidenceTest={env:{DB:d1},user:{id:'owner',role:'owner'},token:'',files:new Map(),notifications:0};
const state=globalThis.__evidenceTest;
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'evidence-boundaries',enforce:'pre',resolveId(id){
 if(id==='cloudflare:workers')return '\0e-env';
 if(id==='next/headers')return '\0e-cookies';
 for(const [name,key] of [['admin','admin'],['file-store','files'],['line','line']])if(id.endsWith('/lib/'+name))return '\0e-'+key;
},load(id){
 if(id==='\0e-env')return 'export const env=globalThis.__evidenceTest.env';
 if(id==='\0e-cookies')return 'export async function cookies(){return {get(){return {value:globalThis.__evidenceTest.token}}}}';
 if(id==='\0e-admin')return 'export async function getWaydidiAdmin(){return globalThis.__evidenceTest.user}';
 if(id==='\0e-files')return 'export async function putFile(k,body,contentType){globalThis.__evidenceTest.files.set(k,{body,contentType})};export async function getFile(k){return globalThis.__evidenceTest.files.get(k)};export async function deleteFile(k){globalThis.__evidenceTest.files.delete(k)}';
 if(id==='\0e-line')return 'export async function notifyLineTripStatus(){globalThis.__evidenceTest.notifications++}';
}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__evidenceTest;});
const {getDb}=await vite.ssrLoadModule('/db/index.ts'),db=getDb();
const schema=await vite.ssrLoadModule('/db/schema.ts');
const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
const rules=await vite.ssrLoadModule('/lib/evidence-rules.ts');
const images=await vite.ssrLoadModule('/lib/evidence-image.ts');
const uploads=await vite.ssrLoadModule('/app/api/driver/trips/[token]/evidence/route.ts');
const media=await vite.ssrLoadModule('/app/api/driver/trips/[token]/evidence/[id]/route.ts');
const admin=await vite.ssrLoadModule('/app/api/admin/evidence/route.ts');
const status=await vite.ssrLoadModule('/app/api/driver/trips/[token]/route.ts');
const retention=await vite.ssrLoadModule('/lib/trip-evidence.ts');
const photo=jpeg.encode({width:20,height:30,data:new Uint8Array(20*30*4).fill(180)},80).data;
const context=(id)=>({params:Promise.resolve({token:state.token,id})});
const req=(body,path='evidence')=>new Request('https://example.invalid/api/driver/trips/session/'+path,{method:'POST',headers:{origin:'https://example.invalid'},body});
let count=0;
async function seed(current='trip_started') {
 const reference='EVID'+(++count), now=new Date().toISOString();
 await db.insert(schema.bookings).values({reference,customerName:'Test',customerEmail:'test@example.invalid',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:'2026-11-01',pickupTime:'09:00',returnDate:'2026-11-02',returnTime:'10:00',passengers:2,luggage:1,vehicle:'economy_sedan',paymentMethod:'cash',total:1000,status:'confirmed',accessTokenHash:'test',createdAt:now,updatedAt:now});
 const rows=[];
 for(const leg of ['outbound','return']) {
  const id=crypto.randomUUID(),driverId=crypto.randomUUID(),token=crypto.randomUUID().replaceAll('-','')+'1234567890abcdef';
  await db.insert(schema.drivers).values({id:driverId,fullName:leg,phone:'000',createdAt:now,updatedAt:now});
  await db.insert(schema.bookingAssignments).values({id,bookingReference:reference,leg,driverId,tokenHash:await sha256(token),currentStatus:current,assignedBy:'owner',assignedAt:now,tokenExpiresAt:new Date(Date.now()+3600000).toISOString(),updatedAt:now});rows.push({id,token,leg});
 }
 state.token=rows[0].token;return {reference,rows};
}
function form(id=crypto.randomUUID(),type='dropoff',gps=true){const f=new FormData();f.set('id',id);f.set('eventType',type);f.set('deviceCapturedAt',new Date().toISOString());f.set('photo',new File([photo],'capture.jpg',{type:'image/jpeg'}));if(gps){f.set('latitude','13.75');f.set('longitude','100.5');f.set('accuracy','12');}return f;}
async function upload(f=form()){const res=await uploads.POST(req(f),context());const data=await res.json();assert.equal(res.status,200,JSON.stringify(data));return data.evidence;}
async function confirm(evidenceId=null,id=crypto.randomUUID(),step='completed'){const f=new FormData();f.set('status',step);f.set('clientEventId',id);if(evidenceId)f.set('evidenceId',evidenceId);return status.POST(req(f,''),context());}

test('Bangkok time crosses UTC dates and truthful stamp has no confirmation label',()=>{
 assert.match(rules.ictTime('2026-10-08T18:30:00Z'),/09\/10\/2026, 01:30:00 ICT/);
 const clean=images.sanitizeEvidence(photo);assert.equal(clean.width,20);assert.equal(clean.height,30);
 const svg=new TextDecoder().decode(images.stampEvidence(clean,{reference:'A<&',leg:'return',type:'dropoff',receivedAt:'2026-10-08T18:30:00Z',deviceCapturedAt:'2026-10-08T18:29:00Z',latitude:null,longitude:null,accuracy:null}));
 assert.match(svg,/Address unavailable/);assert.match(svg,/Location unavailable/);assert.match(svg,/Device capture \(unverified\)/);assert.match(svg,/A&lt;&amp;/);assert.doesNotMatch(svg,/TRIP COMPLETED|CONFIRMED/);
 assert.throws(()=>images.sanitizeEvidence(new Uint8Array([255,216,255,0])));
 assert.throws(()=>images.sanitizeEvidence(new Uint8Array(3*1024*1024)));
 assert.equal(rules.validEvidenceGps(null,null,null),false);assert.equal(rules.validEvidenceGps(0,0,10),true);assert.equal(rules.validEvidenceGps(999,100,5),false);
});
test('pickup capture does not advance status; optional confirmation works without photo or fabricated GPS',async()=>{
 const trip=await seed('going_to_standby');const saved=await upload(form(undefined,'pickup',false));
 assert.equal(saved.latitude,null);assert.equal(saved.confirmed_at,null);assert.equal(saved.leg,'outbound');
 assert.equal((await d1.prepare('SELECT current_status FROM booking_assignments WHERE id=?').bind(trip.rows[0].id).first()).current_status,'going_to_standby');
 assert.equal((await confirm(null,undefined,'standby')).status,200);
 assert.equal((await d1.prepare('SELECT latitude FROM driver_status_events WHERE assignment_id=?').bind(trip.rows[0].id).first()).latitude,null);
});
test('upload retry is idempotent and photos cannot be read, listed or confirmed by the return driver',async()=>{
 const trip=await seed(),id=crypto.randomUUID();const saved=await upload(form(id));await upload(form(id));
 assert.equal((await d1.prepare('SELECT COUNT(*) n FROM driver_trip_evidence WHERE id=?').bind(id).first()).n,1);
 assert.equal(saved.original_key,undefined);
 state.token=trip.rows[1].token;
 assert.equal((await media.GET(new Request('https://example.invalid'),context(id))).status,404);
 assert.deepEqual((await (await uploads.GET(new Request('https://example.invalid'),context())).json()).evidence,[]);
 assert.equal((await confirm(id)).status,409);
 state.token=trip.rows[0].token;const response=await media.GET(new Request('https://example.invalid'),context(id));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
});
test('mandatory photo/GPS rejects missing evidence; audited operations override unblocks only its assignment',async()=>{
 const trip=await seed();await d1.prepare('UPDATE driver_evidence_policy SET dropoff_required=1,gps_required=1').run();
 assert.equal((await confirm()).status,409);const saved=await upload(form(undefined,'dropoff',false));assert.equal((await confirm(saved.id)).status,409);
 const response=await admin.POST(new Request('https://example.invalid/api/admin/evidence',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({assignmentId:trip.rows[0].id,eventType:'dropoff',reason:'Phone location permission unavailable'})}));assert.equal(response.status,200);
 assert.equal((await confirm(saved.id)).status,200);state.token=trip.rows[1].token;assert.equal((await confirm()).status,409);
 await d1.prepare('UPDATE driver_evidence_policy SET dropoff_required=0,gps_required=0').run();
});
test('concurrent retries produce one transition and preserve return status and private evidence',async()=>{
 const trip=await seed(),saved=await upload(),id=crypto.randomUUID();
 const results=await Promise.all([confirm(saved.id,id),confirm(saved.id,id)]);assert.ok(results.every(r=>r.status===200));
 assert.equal((await d1.prepare('SELECT COUNT(*) n FROM driver_status_events WHERE assignment_id=?').bind(trip.rows[0].id).first()).n,1);
 const ev=await d1.prepare('SELECT * FROM driver_trip_evidence WHERE id=?').bind(saved.id).first();assert.equal(ev.status_event_id,id);assert.ok(ev.confirmed_at);
 assert.equal((await d1.prepare('SELECT current_status FROM booking_assignments WHERE id=?').bind(trip.rows[1].id).first()).current_status,'trip_started');assert.equal(state.notifications,0);
 assert.equal((await confirm(saved.id,id)).status,200);
});
test('expired/revoked links cannot upload/list/view/confirm; retention removes media and GPS',async()=>{
 const trip=await seed(),saved=await upload();await d1.prepare('UPDATE booking_assignments SET token_expires_at=? WHERE id=?').bind('2020-01-01',trip.rows[0].id).run();
 assert.equal((await uploads.POST(req(form()),context())).status,401);assert.equal((await uploads.GET(new Request('https://example.invalid'),context())).status,401);assert.equal((await media.GET(new Request('https://example.invalid'),context(saved.id))).status,401);assert.equal((await confirm()).status,404);
 await d1.prepare('UPDATE driver_trip_evidence SET expires_at=? WHERE id=?').bind('2020-01-01',saved.id).run();await retention.cleanupTripEvidence();
 const row=await d1.prepare('SELECT * FROM driver_trip_evidence WHERE id=?').bind(saved.id).first();assert.ok(row.deleted_at);assert.equal(row.latitude,null);assert.equal(state.files.has(row.original_key),false);assert.equal(state.files.has(row.stamped_key),false);
});
test('role permissions and upload validation fail closed',async()=>{
 await seed();state.user={id:'support',role:'support'};assert.equal((await admin.GET(new Request('https://example.invalid'))).status,403);state.user={id:'owner',role:'owner'};
 const invalid=form();invalid.set('photo',new File(['not a photo'],'x.jpg',{type:'image/jpeg'}));assert.equal((await uploads.POST(req(invalid),context())).status,400);
 assert.equal((await uploads.POST(new Request('https://example.invalid',{method:'POST',headers:{origin:'https://evil.invalid'},body:form()}),context())).status,403);
 for(let i=0;i<12;i++)await uploads.POST(req(invalid),context());assert.equal((await uploads.POST(req(form()),context())).status,429);
});

 test('different concurrent event IDs cannot complete an assignment twice',async()=>{
  const trip=await seed(),saved=await upload();
  const responses=await Promise.all([confirm(saved.id),confirm(saved.id)]);
  assert.ok(responses.some(r=>r.status===200));
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM driver_status_events WHERE assignment_id=?').bind(trip.rows[0].id).first()).n,1);
 });
 test('revoked assignments cannot persist new evidence',async()=>{
  const trip=await seed();await d1.prepare('UPDATE booking_assignments SET revoked_at=? WHERE id=?').bind(new Date().toISOString(),trip.rows[0].id).run();
  assert.equal((await uploads.POST(req(form()),context())).status,401);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM driver_trip_evidence WHERE assignment_id=?').bind(trip.rows[0].id).first()).n,0);
 });

test('stale and future GPS fixes are rejected; empty coordinates never become zero',async()=>{
 assert.equal(rules.freshEvidenceGps(10000,10001),true);
 assert.equal(rules.freshEvidenceGps(0,10001),false);
 assert.equal(rules.freshEvidenceGps(20000,10001),false);
 await seed();const f=form();f.set('latitude','');assert.equal((await uploads.POST(req(f),context())).status,400);
});
test('retention deletes fallback files after a later R2 binding is enabled',async()=>{
 const actualStore=await vite.ssrLoadModule('/lib/file-store.ts');
 const key='test-evidence-fallback-retention';
 await actualStore.putFile(key,new Uint8Array([1,2,3]),'image/jpeg');
 const deleted=[];state.env.BUCKET={delete:async k=>deleted.push(k),get:async()=>null};
 try {await actualStore.deleteFile(key);assert.deepEqual(deleted,[key]);assert.equal(await actualStore.getFile(key),null);}finally{delete state.env.BUCKET;}
});

test('the link this tab opened (header) wins over an older trip still in the session cookie',async()=>{
 const {sessionDriverToken}=await vite.ssrLoadModule('/lib/driver-operations.ts');
 assert.equal(sessionDriverToken('new-tab-token','old-cookie-token'),'new-tab-token');
 assert.equal(sessionDriverToken(null,'old-cookie-token'),'old-cookie-token'); // no header (storage blocked): cookie
 assert.equal(sessionDriverToken('',undefined),'');
});
