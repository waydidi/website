import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { migrationStatements } from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("audit")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const n of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {
 const statements=migrationStatements(await readFile(root+'/drizzle/'+n,'utf8')).filter(Boolean);
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__auditEnv={DB:d1};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false},plugins:[{name:'audit-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0audit-env';if(id.endsWith('/lib/booking-quote-check'))return '\0audit-valid-quote';},load(id){if(id==='\0audit-env')return 'export const env=globalThis.__auditEnv';if(id==='\0audit-valid-quote')return 'export async function validTransferPrice(){return true}';}}]});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__auditEnv;});
test('journey changes retain add-ons, synchronize routes and ledger atomically, reject backwards returns, and approve once', async()=>{
 const {getDb}=await vite.ssrLoadModule('/db/index.ts'); const db=getDb();
 const s=await vite.ssrLoadModule('/db/schema.ts');
 const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
 const at=new Date().toISOString(), date=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const reference='AUDIT1';
 await db.insert(s.bookings).values({reference,accessTokenHash:'audit-only',customerName:'Audit Passenger',customerEmail:'audit@example.invalid',pickup:'Old A',dropoff:'Old B',pickupDate:date,pickupTime:'10:00',passengers:1,luggage:0,vehicle:'Economy sedan',paymentMethod:'cash',total:2300,status:'confirmed',childSeats:1,outboundTotal:1000,returnTotal:1000,returnPickup:'Old B',returnDropoff:'Old A',returnDate:date,returnTime:'16:00',fareQuoteId:'old-out',returnFareQuoteId:'old-back',pickupLatitude:13,pickupLongitude:100,dropoffLatitude:12,dropoffLongitude:101,expectedRoutePolyline:'old-route',createdAt:at,updatedAt:at});
 await db.insert(s.bookingPayments).values({id:'primary:'+reference,bookingReference:reference,provider:'cash',status:'cash_due',amountExpected:2300,amountExpectedMinor:230000,createdAt:at,updatedAt:at});
 const token='audit-session';
 await db.insert(s.bookingManagementSessions).values({id:'audit-session',bookingReference:reference,tokenHash:await sha256(token),expiresAt:new Date(Date.now()+900000).toISOString(),createdAt:at,lastUsedAt:at});
 const common={areaId:'audit-area',areaName:'Audit',distanceMeters:5000,durationSeconds:600,vehiclePricesJson:JSON.stringify({economy_sedan:{total:1000}}),pricingVersion:1,departureDate:date,timezone:'Asia/Bangkok',expiresAt:new Date(Date.now()+1800000).toISOString(),createdAt:at};
 await db.insert(s.fareQuotes).values([{...common,id:'new-out',pickupPlaceId:'new-a',dropoffPlaceId:'new-b',pickupText:'New A',dropoffText:'New B',departureTime:'10:00',pickupLatitude:14,pickupLongitude:99,dropoffLatitude:15,dropoffLongitude:98,routePolyline:'new-route'},{...common,id:'new-back',pickupPlaceId:'new-b',dropoffPlaceId:'new-a',pickupText:'New B',dropoffText:'New A',departureTime:'16:00'}]);
 const route=await vite.ssrLoadModule('/app/api/bookings/manage/change-request/route.ts');
 const response=await route.POST(new Request('https://example.invalid/api/bookings/manage/change-request',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie:'waydidi_manage='+token},body:JSON.stringify({fareQuoteId:'new-out',returnFareQuoteId:'new-back',vehicleId:'economy_sedan',bookingVersion:1})}));
 const result=await response.json(); assert.equal(response.status,200,JSON.stringify(result));
 assert.equal(result.revisedTotal,2300);assert.equal(result.priceDifference,0);

 const changes=await vite.ssrLoadModule('/lib/telegram/booking-changes.ts');
 assert.equal(await changes.approveChange(result.requestId,'Audit'),'Change approved.');
 const b=await d1.prepare('SELECT pickup,dropoff,total,child_seats,fare_quote_id,return_fare_quote_id,return_pickup,return_dropoff,pickup_latitude,expected_route_polyline FROM bookings WHERE reference=?').bind(reference).first();
 const p=await d1.prepare('SELECT amount_expected FROM booking_payments WHERE booking_reference=?').bind(reference).first();
 assert.equal(b.pickup,'New A'); assert.equal(b.fare_quote_id,'new-out');assert.equal(b.return_fare_quote_id,'new-back');assert.equal(b.return_pickup,'New B');assert.equal(b.return_dropoff,'New A');assert.equal(b.pickup_latitude,14);assert.equal(b.expected_route_polyline,'new-route');assert.equal(b.total,2300);assert.equal(p.amount_expected,2300);assert.equal(await changes.approveChange(result.requestId,'Audit'),'Already handled.');
 const firstHistory=await d1.prepare("SELECT status,original_minor,revised_minor FROM booking_change_history WHERE request_id=? ORDER BY status").bind(result.requestId).all();
 assert.deepEqual(firstHistory.results.map(e=>e.status),['approved','submitted']);
 assert.ok(firstHistory.results.every(e=>e.original_minor===230000&&e.revised_minor===230000));

 await d1.prepare('UPDATE fare_quotes SET vehicle_prices_json=? WHERE id=?').bind(JSON.stringify({economy_sedan:{total:1200}}),'new-out').run();
 const changedRequest=()=>route.POST(new Request('https://example.invalid/api/bookings/manage/change-request',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie:'waydidi_manage='+token},body:JSON.stringify({fareQuoteId:'new-out',returnFareQuoteId:'new-back',vehicleId:'economy_sedan',bookingVersion:2})}));
 const higher=await changedRequest();assert.equal(higher.status,200);const higherBody=await higher.json();assert.equal(higherBody.revisedTotal,2500);
 await d1.prepare("CREATE TRIGGER audit_fail_ledger BEFORE UPDATE ON booking_payments BEGIN SELECT RAISE(ABORT,'audit rollback'); END").run();
 await assert.rejects(changes.approveChange(higherBody.requestId,'Audit'));
 assert.equal((await d1.prepare('SELECT total FROM bookings WHERE reference=?').bind(reference).first()).total,2300);
 assert.equal((await d1.prepare('SELECT status FROM booking_change_requests WHERE id=?').bind(higherBody.requestId).first()).status,'pending');
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM booking_change_history WHERE request_id=? AND status='approved'").bind(higherBody.requestId).first()).n,0);
 await d1.prepare('DROP TRIGGER audit_fail_ledger').run();
 const approvals=await Promise.all([changes.approveChange(higherBody.requestId,'Audit'),changes.approveChange(higherBody.requestId,'Audit')]);
 assert.equal(approvals.filter(r=>r==='Change approved.').length,1);
 assert.equal((await d1.prepare("SELECT COUNT(*) n FROM booking_change_history WHERE request_id=? AND status='approved'").bind(higherBody.requestId).first()).n,1);
 assert.equal((await d1.prepare('SELECT amount_expected_minor FROM booking_payments WHERE booking_reference=?').bind(reference).first()).amount_expected_minor,250000);
 assert.equal((await d1.prepare('SELECT amount_paid FROM bookings WHERE reference=?').bind(reference).first()).amount_paid,0);
 await d1.prepare("UPDATE fare_quotes SET departure_time='17:00' WHERE id='new-out'").run();
 const backwards=await route.POST(new Request('https://example.invalid/api/bookings/manage/change-request',{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json',cookie:'waydidi_manage='+token},body:JSON.stringify({fareQuoteId:'new-out',returnFareQuoteId:'new-back',vehicleId:'economy_sedan',bookingVersion:3})}));
 const backwardsBody=await backwards.json();assert.equal(backwards.status,409,JSON.stringify(backwardsBody));

});
