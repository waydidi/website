import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){const sql=migrationStatements((await readFile(root+'/drizzle/'+name,'utf8'))).map(s=>s.trim()).filter(Boolean);if(sql.length)await d1.batch(sql.map(s=>d1.prepare(s)));}
globalThis.__staffTestEnv={DB:d1,WAYDIDI_ADMIN_SESSION_SECRET:'test-only-staff-secret-with-at-least-32-characters'};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'staff-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0staff-env';},load(id){if(id==='\0staff-env')return 'export const env=globalThis.__staffTestEnv';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__staffTestEnv;});
const security=await vite.ssrLoadModule('/lib/staff-security.ts');
const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
const {POST}=await vite.ssrLoadModule('/app/api/admin/session/route.ts');
const request=(body,cookie='')=>new Request('https://example.invalid/api/admin/session',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie},body:JSON.stringify(body)});
const password='test-only-long-password';
const hash=await security.hashStaffPassword(password);
await d1.prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,created_at) VALUES('alice','alice','alice@example.invalid','Alice',?,'owner',?)").bind(hash,new Date().toISOString()).run();
test('staff passwords use salted PBKDF2 and MFA ciphertext rejects tampering',async()=>{
 assert.notEqual(hash,await security.hashStaffPassword(password));assert.equal(await security.verifyStaffPassword(password,hash),true);assert.equal(await security.verifyStaffPassword('wrong',hash),false);
 const secret=security.newTotpSecret(),key=globalThis.__staffTestEnv.WAYDIDI_ADMIN_SESSION_SECRET,encrypted=await security.encryptMfa(secret,key);assert.equal(await security.decryptMfa(encrypted,key),secret);assert.notEqual(encrypted,secret);await assert.rejects(()=>security.decryptMfa(encrypted.slice(0,-2)+'00',key));
});
test('TOTP follows the RFC 6238 vector and rejects malformed codes',async()=>{assert.equal(await security.totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1),'287082');assert.equal(await security.acceptedTotpStep(security.newTotpSecret(),'not-a-code'),null);});
test('password-only and legacy bare-key login never create a session',async()=>{
 const legacy=await POST(request({key:password}));assert.equal(legacy.status,400);assert.equal(legacy.headers.get('set-cookie'),null);
 const response=await POST(request({username:'alice',password}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.mfaRequired,true);assert.ok(data.enrollmentSecret);assert.ok(!response.headers.get('set-cookie').includes('waydidi_admin_session='));
 const challenge=response.headers.get('set-cookie').split(';')[0];const code=await security.totpCode(data.enrollmentSecret,Math.floor(Date.now()/30000));
 const results=await Promise.all([POST(request({code},challenge)),POST(request({code},challenge))]);assert.equal(results.filter(r=>r.status===200).length,1);
 const signed=results.find(r=>r.status===200);const token=/waydidi_admin_session=([^;]+)/.exec(signed.headers.get('set-cookie'))[1];assert.equal((await security.staffForToken(d1,token)).username,'alice');
 await d1.prepare('UPDATE staff_sessions SET revoked_at=? WHERE token_hash=?').bind(new Date().toISOString(),await sha256(token)).run();assert.equal(await security.staffForToken(d1,token),null);
});
test('sessions are individually revocable, expire when idle, and ignore old signed cookies',async()=>{
 const a=await security.newStaffSession(d1,'alice'),b=await security.newStaffSession(d1,'alice');
 await d1.prepare('UPDATE staff_sessions SET revoked_at=? WHERE token_hash=?').bind(new Date().toISOString(),await sha256(a)).run();assert.equal(await security.staffForToken(d1,a),null);assert.ok(await security.staffForToken(d1,b));
 await d1.prepare('UPDATE staff_sessions SET last_used_at=? WHERE token_hash=?').bind(new Date(Date.now()-31*60000).toISOString(),await sha256(b)).run();assert.equal(await security.staffForToken(d1,b),null);assert.equal(await security.staffForToken(d1,'old.payload.signature'),null);
});
test('staff permissions deny finance operations, writes by support, and unknown routes',()=>{
 assert.equal(security.allowedStaffRoute('operations','/api/admin/refunds','POST'),false);assert.equal(security.allowedStaffRoute('finance','/api/admin/refunds','POST'),true);assert.equal(security.allowedStaffRoute('support','/api/admin/bookings','POST'),false);assert.equal(security.allowedStaffRoute('support','/api/admin/chat','POST'),true);assert.equal(security.allowedStaffRoute('editor','/api/admin/blog','POST'),true);assert.equal(security.allowedStaffRoute('operations','/api/admin/new-secret-route','GET'),false);
});
test('parallel code guesses claim at most five allowed attempts',async()=>{
 const now=new Date().toISOString();await d1.prepare('INSERT INTO customer_login_codes(id,email,code_hash,attempts,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind('parallel-code','parallel@example.invalid','invalid',0,new Date(Date.now()+60000).toISOString(),now).run();
 const verifier=await vite.ssrLoadModule('/app/api/account/verify/route.ts');
 const responses=await Promise.all(Array.from({length:12},()=>verifier.POST(new Request('https://example.invalid/api/account/verify',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.invalid'},body:JSON.stringify({email:'parallel@example.invalid',code:'123456'})}))));
 assert.ok(responses.every(r=>r.status===400));assert.equal((await d1.prepare("SELECT attempts FROM customer_login_codes WHERE id='parallel-code'").first()).attempts,5);
});

const {getDb}=await vite.ssrLoadModule('/db/index.ts');const schema=await vite.ssrLoadModule('/db/schema.ts');const db=getDb();
const bookingRef='ABCD23',created=new Date().toISOString();
await db.insert(schema.bookings).values({reference:bookingRef,customerName:'Traveller Smith',customerSurname:'Smith',customerEmail:'traveller@example.invalid',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:'2026-12-01',pickupTime:'09:00',passengers:2,luggage:1,vehicle:'economy_sedan',paymentMethod:'cash',total:1000,status:'confirmed',paymentStatus:'cash_due',accessTokenHash:await sha256('permanent-confirmation-token'),createdAt:created,updatedAt:created});
test('reference and surname alone do not grant management; a verified matching account does',async()=>{
 const route=await vite.ssrLoadModule('/app/api/bookings/manage/session/route.ts');
 const request=(cookie='')=>new Request('https://example.invalid/api/bookings/manage/session',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie},body:JSON.stringify({reference:bookingRef,surname:'Smith'})});
 const guest=await route.POST(request());assert.equal(guest.status,401);assert.equal((await guest.json()).verificationRequired,true);
 await db.insert(schema.customers).values({id:'traveller',email:'traveller@example.invalid',createdAt:created,updatedAt:created,lastSeenAt:created});
 const auth=await vite.ssrLoadModule('/lib/customer-auth.ts');const token=await auth.createCustomerSession('traveller',null);const account=await vite.ssrLoadModule('/lib/customer-account.ts');
 const verified=await route.POST(request(`${account.ACCOUNT_COOKIE}=${token}`));assert.equal(verified.status,200);assert.match(verified.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
});
test('owner trip keys expire and exchanged cookies obey revocation',async()=>{
 const trip=await vite.ssrLoadModule('/lib/trip-access.ts');globalThis.__staffTestEnv.TRIP_PIN_SECRET='test-only-trip-secret-with-at-least-32-characters';
 const key=await trip.tripOwnerKey(bookingRef);assert.match(key,/^[a-z0-9]+\.[a-f0-9]{32}$/);
 const link=new Request(`https://example.invalid/api/trip/${bookingRef}?key=${key}`);assert.equal((await trip.resolveTripAccess(link,bookingRef)).access,'owner');
 const exchange=await vite.ssrLoadModule('/app/api/trip/access/route.ts');const response=await exchange.POST(new Request('https://example.invalid/api/trip/access',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify({reference:bookingRef,query:`key=${key}`})}));assert.equal(response.status,200);
 const cookie=response.headers.get('set-cookie').split(';')[0];assert.ok(await trip.resolveTripAccess(new Request(`https://example.invalid/api/trip/${bookingRef}`,{headers:{cookie}}),bookingRef));
 const realNow=Date.now;Date.now=()=>realNow()+25*3600000;try{assert.equal(await trip.resolveTripAccess(link,bookingRef),null);}finally{Date.now=realNow;}
 await db.insert(schema.bookingEvents).values({bookingReference:bookingRef,eventType:'trip_owner_revoked',createdAt:new Date(Date.now()+1).toISOString()});
 assert.equal(await trip.resolveTripAccess(link,bookingRef),null);assert.equal(await trip.resolveTripAccess(new Request(`https://example.invalid/api/trip/${bookingRef}`,{headers:{cookie}}),bookingRef),null);
});

test('website chat isolates visitor sessions and rejects cross-site posting',async()=>{
 const chat=await vite.ssrLoadModule('/app/api/chat/route.ts');
 const response=await chat.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.invalid'},body:JSON.stringify({message:'Where is pickup?',email:'guest@example.com'})}));assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];
 assert.equal((await (await chat.GET(new Request('https://example.invalid/api/chat',{headers:{cookie}}))).json()).messages.length,1);assert.equal((await (await chat.GET(new Request('https://example.invalid/api/chat'))).json()).messages.length,0);
 const blocked=await chat.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.invalid'},body:JSON.stringify({message:'bad'})}));assert.equal(blocked.status,403);
});

test('confirmation, customer email, office email and PDF retry independently',async()=>{
 const reference='EFGH24';await db.insert(schema.bookings).values({reference,customerName:'Traveller Smith',customerSurname:'Smith',customerEmail:'delivery@example.invalid',customerPhone:'+66 630000000',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:'2026-12-01',pickupTime:'09:00',passengers:2,luggage:1,vehicle:'economy_sedan',paymentMethod:'cash',total:1000,status:'pending_payment',paymentStatus:'cash_due',accessTokenHash:'test',fulfillmentStatus:'pending',createdAt:created,updatedAt:created});
 const {eq}=await import('drizzle-orm');const [b]=await db.select().from(schema.bookings).where(eq(schema.bookings.reference,reference));
 const flow=await vite.ssrLoadModule('/lib/booking-fulfillment.ts');let phase=1;const sent=[];const originalFetch=globalThis.fetch;
 Object.assign(globalThis.__staffTestEnv,{RESEND_API_KEY:'test_only',BOOKING_FROM_EMAIL:'noreply@example.invalid',BOOKING_ALERT_EMAIL:'office@example.invalid',BUCKET:{async put(){if(phase===1)throw new Error('storage unavailable');}}});
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);const recipient=Array.isArray(body.to)?body.to[0]:body.to;sent.push(recipient);return phase===1&&recipient==='delivery@example.invalid'?Response.json({error:'temporary'},{status:503}):Response.json({id:'test-email'});};
 try{
  await flow.fulfillBooking(b);
  const first=(await d1.prepare('SELECT channel,status,attempts FROM booking_deliveries WHERE booking_reference=?').bind(reference).all()).results;
  assert.equal(first.find(r=>r.channel==='confirmation').status,'sent');assert.equal(first.find(r=>r.channel==='office_email').status,'sent');assert.equal(first.find(r=>r.channel==='customer_email').status,'failed');assert.equal(first.find(r=>r.channel==='pdf').status,'failed');assert.equal((await db.select().from(schema.bookings).where(eq(schema.bookings.reference,reference)))[0].status,'confirmed');
  phase=2;await d1.prepare("UPDATE booking_deliveries SET next_attempt_at=? WHERE booking_reference=? AND status='failed'").bind(new Date(Date.now()-60000).toISOString(),reference).run();await flow.runDeliveryRecovery();
  const second=(await d1.prepare('SELECT channel,status,attempts FROM booking_deliveries WHERE booking_reference=?').bind(reference).all()).results;
  assert.ok(second.every(r=>r.status==='sent'));assert.equal(second.find(r=>r.channel==='office_email').attempts,1);assert.equal(second.find(r=>r.channel==='customer_email').attempts,2);assert.equal(second.find(r=>r.channel==='pdf').attempts,2);assert.equal(sent.filter(to=>to==='office@example.invalid').length,1);
 }finally{globalThis.fetch=originalFetch;}
});

test('owner provisioning produces a compatible salted hash and refuses a second bootstrap account',async()=>{
 const {execFileSync}=await import('node:child_process');const password='test-only-long-owner-password';const sql=execFileSync(process.execPath,[root+'/scripts/provision-staff-owner.mjs','owner-test','owner@example.invalid'],{input:password+'\n',encoding:'utf8',stdio:['pipe','pipe','pipe']});assert.ok(!sql.includes(password));const hash=/pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}/.exec(sql)[0];assert.equal(await security.verifyStaffPassword(password,hash),true);assert.equal((await d1.prepare(sql).run()).meta.changes,0);
});

test('parallel login requests cannot exceed IP or email-code issuance limits',async()=>{
 const auth=await vite.ssrLoadModule('/lib/customer-auth.ts');const request=new Request('https://example.invalid/api/account/code',{headers:{'cf-connecting-ip':'test-atomic-ip'}});const claimed=await Promise.all(Array.from({length:12},()=>auth.overRateLimit(request,'atomic-test',5,15,'test-only-salt')));assert.equal(claimed.filter(over=>!over).length,5);
 const route=await vite.ssrLoadModule('/app/api/account/code/route.ts');const originalFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'test-only-email'});
 try{const responses=await Promise.all(Array.from({length:12},(_,i)=>route.POST(new Request('https://example.invalid/api/account/code',{method:'POST',headers:{'cf-connecting-ip':`test-code-${i}`,'content-type':'application/json',origin:'https://example.invalid'},body:JSON.stringify({email:'issuance@example.invalid'})}))));assert.equal(responses.filter(r=>r.status===200).length,5);assert.equal(responses.filter(r=>r.status===429).length,7);assert.equal((await d1.prepare("SELECT COUNT(*) count FROM customer_login_codes WHERE email='issuance@example.invalid'").first()).count,5);}finally{globalThis.fetch=originalFetch;}
});
