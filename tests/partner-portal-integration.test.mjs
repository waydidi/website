import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){const statements=(await readFile(root+'/drizzle/'+name,'utf8')).replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));}
globalThis.__portalEnv={DB:d1};globalThis.__portalStaff={id:'owner-test',role:'owner'};
const vite=await createServer({root,configFile:false,appType:'custom',esbuild:{jsx:'automatic'},resolve:{alias:{'@':root}},plugins:[{name:'portal-boundaries',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0portal-env';if(id.endsWith('/lib/admin'))return '\0portal-admin';},load(id){if(id==='\0portal-env')return 'export const env=globalThis.__portalEnv';if(id==='\0portal-admin')return 'export async function getWaydidiAdmin(){return globalThis.__portalStaff}';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__portalEnv;delete globalThis.__portalStaff;});
const {getDb}=await vite.ssrLoadModule('/db/index.ts');const schema=await vite.ssrLoadModule('/db/schema.ts');const db=getDb();const {eq}=await import('drizzle-orm');
const auth=await vite.ssrLoadModule('/lib/customer-auth.ts'),account=await vite.ssrLoadModule('/lib/customer-account.ts');const agency=await vite.ssrLoadModule('/lib/agency.ts');const portal=await vite.ssrLoadModule('/lib/partner-portal.ts');const staffRoute=await vite.ssrLoadModule('/app/api/admin/partners/route.ts');const forms=await vite.ssrLoadModule('/app/api/agency/forms/route.ts');const team=await vite.ssrLoadModule('/app/api/agency/team/route.ts');
const now=new Date().toISOString();
for(const [id,email] of [['hotel','hotel@example.invalid'],['agency','agency@example.invalid']]){await db.insert(schema.agencyApplications).values({id,agencyName:id==='hotel'?'Riverside Hotel':'Travel Co',contactName:'Primary Contact',email,phone:'+660000000',country:'Thailand',monthlyTransfers:'11-50',status:'approved',message:id==='hotel'?'[Waydidi partner type: hotel]\n':null,createdAt:now});}
const cookies={};for(const email of ['hotel@example.invalid','agency@example.invalid','viewer@example.invalid','booker@example.invalid','finance@example.invalid']){await db.insert(schema.customers).values({id:email,email,createdAt:now,updatedAt:now,lastSeenAt:now});cookies[email]=`${account.ACCOUNT_COOKIE}=${await auth.createCustomerSession(email,null)}`;}
const request=(url,body,email='hotel@example.invalid',method='POST')=>new Request('https://example.invalid'+url,{method,headers:{origin:'https://example.invalid','content-type':'application/json',cookie:cookies[email]??''},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const staffPost=(action,data,agencyId='hotel')=>staffRoute.POST(request('/api/admin/partners',{agencyId,action,data}));
const rateData={label:'Airport to hotel',pickup:'Suvarnabhumi Airport',dropoff:'Riverside Hotel Bangkok',vehicle:'economy_sedan',serviceType:'transfer',priceMinor:123456,validFrom:'2027-01-01',validUntil:'2027-12-31'};
let rate,formToken,booking;
test('approved partners and verified team memberships are isolated and revocable',async()=>{
 assert.equal((await agency.agencyForCustomer({email:'hotel@example.invalid'})).portalRole,'admin');assert.equal((await portal.partnerProfile(await agency.agencyForCustomer({email:'hotel@example.invalid'}))).partner_kind,'hotel');
 for(const role of ['viewer','booker','finance']){assert.equal((await team.POST(request('/api/agency/team',{email:`${role}@example.invalid`,role,active:true}))).status,200);assert.equal((await agency.agencyForCustomer({email:`${role}@example.invalid`})).portalRole,role);}
 assert.equal((await team.POST(request('/api/agency/team',{email:'viewer@example.invalid',role:'booker',active:true},'agency@example.invalid'))).status,409);
 assert.equal((await team.POST(request('/api/agency/team',{email:'guest@example.invalid',role:'admin',active:true},'viewer@example.invalid'))).status,403);
 assert.equal((await team.POST(request('/api/agency/team',{email:'hotel@example.invalid',role:'viewer',active:false}))).status,400);
 assert.equal((await team.POST(request('/api/agency/team',{email:'booker@example.invalid',role:'booker',active:false}))).status,200);assert.equal(await agency.agencyForCustomer({email:'booker@example.invalid'}),null);
 await team.POST(request('/api/agency/team',{email:'booker@example.invalid',role:'booker',active:true}));
});
test('finance staff configure exact satang rates; partner request terms are snapshotted',async()=>{
 assert.equal((await staffPost('profile',{partnerKind:'hotel',billingName:'Riverside Hotel Ltd',billingAddress:'Bangkok Thailand',taxId:'test-only',commissionBps:1000})).status,200);
 assert.equal((await staffPost('rate',rateData)).status,200);rate=(await portal.partnerRates('hotel'))[0];assert.equal(rate.price_minor,123456);
 assert.equal((await forms.POST(request('/api/agency/forms',{serviceType:'transfer',rateId:rate.id},'viewer@example.invalid'))).status,403);
 assert.equal((await forms.POST(request('/api/agency/forms',{serviceType:'transfer',rateId:rate.id},'agency@example.invalid'))).status,400);
 const r=await forms.POST(request('/api/agency/forms',{serviceType:'transfer',rateId:rate.id,note:'Room 201'},'booker@example.invalid'));assert.equal(r.status,200);formToken=(await r.json()).token;
 const row=await d1.prepare('SELECT * FROM booking_forms WHERE token=?').bind(formToken).first();assert.equal(JSON.parse(row.prefill).price,1234.56);assert.equal(row.agency_id,'hotel');
 await staffPost('profile',{partnerKind:'hotel',billingName:'Riverside Hotel Ltd',billingAddress:'Bangkok Thailand',taxId:'test-only',commissionBps:2000});assert.equal((await d1.prepare('SELECT commission_bps FROM partner_request_terms WHERE form_token=?').bind(formToken).first()).commission_bps,1000);
 globalThis.__portalStaff={id:'ops',role:'operations'};assert.equal((await staffPost('rate',rateData)).status,403);globalThis.__portalStaff={id:'owner-test',role:'owner'};
});
test('negotiated fare and commission survive request-to-booking without client price tampering',async()=>{
 const manual=await vite.ssrLoadModule('/lib/manual-booking.ts');const b=manual.manualBookingSchema.parse({serviceType:'transfer',pickup:rate.pickup,dropoff:rate.dropoff,pickupDate:'2027-03-20',pickupTime:'10:00',customerName:'Guest',customerSurname:'Smith',customerEmail:'guest@example.invalid',customerPhone:'+660000000',passengers:2,luggage:2,vehicle:rate.vehicle,fare:1234.56,paid:false,sendEmail:false,agencyId:'hotel',partnerFormToken:formToken});
 await assert.rejects(()=>manual.createManualBooking({...b,fare:100},'https://example.invalid'),/exact negotiated fare/);
 await assert.rejects(()=>manual.createManualBooking({...b,pickupDate:'2028-01-01'},'https://example.invalid'),/unavailable/);
 const result=await manual.createManualBooking(b,'https://example.invalid');booking=(await db.select().from(schema.bookings).where(eq(schema.bookings.reference,result.reference)))[0];assert.equal(booking.total,1234.56);
 const terms=await d1.prepare('SELECT * FROM partner_booking_terms WHERE booking_reference=?').bind(booking.reference).first();assert.equal(terms.commission_base_minor,123456);assert.equal(terms.commission_bps,1000);assert.equal(JSON.parse(terms.rate_snapshot).price_minor,123456);
 assert.ok(await d1.prepare('SELECT * FROM booking_policy_snapshots WHERE booking_reference=?').bind(booking.reference).first());
 const detail=await vite.ssrLoadModule('/app/api/agency/bookings/[reference]/route.ts');const context={params:Promise.resolve({reference:booking.reference})};
 assert.equal((await detail.GET(request('/api/agency/bookings/'+booking.reference,null,'agency@example.invalid','GET'),context)).status,404);
 const response=await detail.GET(request('/api/agency/bookings/'+booking.reference,null,'viewer@example.invalid','GET'),context);assert.equal(response.status,200);const text=await response.text();assert.ok(!text.includes('accessTokenHash'));assert.ok(!text.includes('paymentIntentId'));assert.ok(text.includes('More than 48 hours'));
});
test('commission uses receipts, completed service and refunds; concurrent payout records cannot duplicate',async()=>{
 await d1.prepare("UPDATE bookings SET status='completed',payment_status='paid' WHERE reference=?").bind(booking.reference).run();
 assert.equal((await portal.commissionStatement('hotel','2027-03')).earnedMinor,0);
 await d1.prepare("INSERT INTO cash_receipts(id,booking_reference,amount_minor,collected_by,created_at) VALUES(?,?,?,?,?)").bind('cash-test',booking.reference,123456,'staff-test',now).run();
 assert.equal((await portal.commissionStatement('hotel','2027-03')).earnedMinor,12345);
 const responses=await Promise.all([staffPost('payout',{period:'2027-03',paymentReference:'bank-test-1'}),staffPost('payout',{period:'2027-03',paymentReference:'bank-test-2'})]);assert.equal(responses.filter(r=>r.status===200).length,1);
 await d1.prepare('UPDATE bookings SET refund_amount=? WHERE reference=?').bind(617.28,booking.reference).run();const adjusted=await portal.commissionStatement('hotel','2027-03');assert.equal(adjusted.earnedMinor,6172);assert.equal(adjusted.balanceMinor,-6173);
 const statementRoute=await vite.ssrLoadModule('/app/api/agency/statement/route.ts');assert.equal((await statementRoute.GET(request('/api/agency/statement?period=2027-03',null,'viewer@example.invalid','GET'))).status,403);const csv=await statementRoute.GET(request('/api/agency/statement?period=2027-03&format=csv',null,'finance@example.invalid','GET'));assert.equal(csv.status,200);assert.match(await csv.text(),/Commission satang/);
});
test('invoice issuance is idempotent and invoice access requires tenant finance permissions',async()=>{
 assert.equal((await staffPost('invoice',{reference:booking.reference})).status,409);
 Object.assign(globalThis.__portalEnv,{WAYDIDI_INVOICE_LEGAL_NAME:'Waydidi Test Company',WAYDIDI_INVOICE_ADDRESS:'Thailand test address'});
 assert.equal((await staffPost('invoice',{reference:booking.reference})).status,200);assert.equal((await staffPost('invoice',{reference:booking.reference})).status,200);
 const invoices=await portal.partnerInvoices('hotel');assert.equal(invoices.length,1);assert.equal(invoices[0].amount_minor,123456);const id=invoices[0].id;
 const invoiceRoute=await vite.ssrLoadModule('/app/api/agency/invoices/[id]/route.ts');globalThis.__portalStaff=null;
 assert.equal((await invoiceRoute.GET(request('/api/agency/invoices/'+id,null,'agency@example.invalid','GET'),{params:Promise.resolve({id})})).status,404);
 assert.equal((await invoiceRoute.GET(request('/api/agency/invoices/'+id,null,'viewer@example.invalid','GET'),{params:Promise.resolve({id})})).status,403);
 const r=await invoiceRoute.GET(request('/api/agency/invoices/'+id,null,'finance@example.invalid','GET'),{params:Promise.resolve({id})});assert.equal(r.status,200);assert.match(await r.text(),/Commercial invoice/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);globalThis.__portalStaff={id:'owner-test',role:'owner'};
});
test('portal render hides finance, team management and request tokens from viewer roles',async()=>{
 const {PartnerWorkspace}=await vite.ssrLoadModule('/components/agency/partner-workspace.tsx');const html=renderToStaticMarkup(createElement(PartnerWorkspace,{name:'Hotel',email:'viewer@example.invalid',role:'viewer',kind:'hotel',rates:[],bookings:[],requests:[],profile:null,statement:null,invoices:[]}));assert.match(html,/Hotel &amp; concierge/);assert.ok(!html.includes('Team access'));assert.ok(!html.includes('Commission statement'));assert.ok(!html.includes('New ride request'));
});

test('request conversion claims once and captures the original commission agreement',async()=>{
 const r=await forms.POST(request('/api/agency/forms',{serviceType:'transfer',rateId:rate.id,note:'Second guest'},'booker@example.invalid'));const token=(await r.json()).token;
 await d1.prepare("UPDATE booking_forms SET status='submitted',answers=? WHERE token=?").bind(JSON.stringify({name:'Another Guest',phone:'+660000000',email:'guest2@example.invalid',pickup:rate.pickup,dropoff:rate.dropoff,date:'2027-04-10',time:'09:00',passengers:2,luggage:1,vehicle:rate.vehicle,childSeats:0,exchangeStop:false,ferryPeople:0,returnTrip:false}),token).run();
 const manualRoute=await vite.ssrLoadModule('/app/api/admin/manual-booking/route.ts');
 const input={serviceType:'transfer',pickup:rate.pickup,dropoff:rate.dropoff,pickupDate:'2027-04-10',pickupTime:'09:00',customerName:'Another Guest',customerEmail:'guest2@example.invalid',customerPhone:'+660000000',passengers:2,luggage:1,vehicle:rate.vehicle,fare:1234.56,paid:false,sendEmail:false,agencyId:'agency',partnerFormToken:token};
 const results=await Promise.all([manualRoute.POST(request('/api/admin/manual-booking',input)),manualRoute.POST(request('/api/admin/manual-booking',input))]);assert.equal(results.filter(r=>r.status===200).length,1);const form=await d1.prepare('SELECT * FROM booking_forms WHERE token=?').bind(token).first();assert.equal(form.status,'booked');const terms=await d1.prepare('SELECT * FROM partner_booking_terms WHERE booking_reference=?').bind(form.booking_reference).first();assert.equal(terms.agency_id,'hotel');assert.equal(terms.commission_bps,2000);
});
test('disabling a partner rate blocks new requests and declining an organization revokes all members',async()=>{
 await staffPost('disable_rate',{id:rate.id});assert.equal((await forms.POST(request('/api/agency/forms',{serviceType:'transfer',rateId:rate.id},'booker@example.invalid'))).status,400);
 await d1.prepare("UPDATE agency_applications SET status='declined' WHERE id='hotel'").run();assert.equal(await agency.agencyForCustomer({email:'hotel@example.invalid'}),null);assert.equal(await agency.agencyForCustomer({email:'finance@example.invalid'}),null);await d1.prepare("UPDATE agency_applications SET status='approved' WHERE id='hotel'").run();
});

test('uncertain refunds hold back commission until reconciliation releases the reservation',async()=>{
 await db.insert(schema.bookingRefunds).values({id:'held-refund',bookingReference:booking.reference,provider:'cash',idempotencyKey:'held-refund-key',reason:'goodwill',policyVersion:'test',cancellationRequestedAt:now,noticeHours:72,refundPercent:100,originalMinor:123456,customerRefundMinor:30864,status:'processing',requestedBy:'staff-test',createdAt:now,updatedAt:now});
 assert.equal((await portal.commissionStatement('hotel','2027-03')).earnedMinor,3086);
 await d1.prepare("UPDATE booking_refunds SET status='failed' WHERE id='held-refund'").run();assert.equal((await portal.commissionStatement('hotel','2027-03')).earnedMinor,6172);
});
