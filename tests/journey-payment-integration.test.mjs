import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
    const source = await readFile(root + '/drizzle/' + name, 'utf8');
    const statements = source.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
    if (statements.length)
        await d1.batch(statements.map(s => d1.prepare(s)));
}
globalThis.__journeyTestEnv = { DB: d1 };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'test-worker-boundaries', enforce: 'pre', resolveId(id) { if (id === 'cloudflare:workers')
                return '\0test-env'; if (id.endsWith('/lib/booking-fulfillment'))
                return '\0test-fulfillment'; if (id.endsWith('/lib/admin'))
                return '\0test-admin'; }, load(id) { if (id === '\0test-env')
                return 'export const env=globalThis.__journeyTestEnv'; if (id === '\0test-fulfillment')
                return 'export async function fulfillBooking(){}'; if (id === '\0test-admin')
                return 'export async function getWaydidiAdmin(){return {email:"operations@example.invalid"}}'; } }], server: { middlewareMode: true } });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__journeyTestEnv; });
const { getDb } = await vite.ssrLoadModule('/db/index.ts');
const db = getDb();
const schema = await vite.ssrLoadModule('/db/schema.ts');
const { eq } = await import('drizzle-orm');
const payments = await vite.ssrLoadModule('/lib/payment-reconciliation.ts');
const legs = await vite.ssrLoadModule('/lib/journey-legs.ts');
const { bookingWindow, rangesOverlap } = await vite.ssrLoadModule('/lib/operations-calendar.ts');
const { flightAdjustment } = await vite.ssrLoadModule('/lib/flight-assistance.ts');
let sequence = 0;
async function seed(overrides = {}) {
    const reference = `TEST${++sequence}`;
    const now = new Date().toISOString();
    await db.insert(schema.bookings).values({ reference, customerName: 'Test Passenger', customerEmail: 'test@example.invalid', pickup: 'Suvarnabhumi Airport', dropoff: 'Pattaya', pickupDate: '2026-11-01', pickupTime: '09:00', passengers: 2, luggage: 1, vehicle: 'economy_sedan', paymentMethod: 'stripe', total: 1000, status: 'confirmed', paymentStatus: 'paid', amountPaid: 1000, checkoutSessionId: 'cs_test_' + reference, paymentIntentId: 'pi_' + reference, accessTokenHash: 'test', fulfillmentStatus: 'complete', createdAt: now, updatedAt: now, ...overrides });
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.reference, reference));
    await db.insert(schema.bookingPayments).values({ id: `primary:${reference}`, bookingReference: reference, provider: b.paymentMethod === 'cash' ? 'cash' : 'stripe', status: b.paymentStatus, amountExpected: b.total, amountPaid: b.amountPaid, createdAt: now, updatedAt: now });
    return b;
}
async function booking(b) { return (await db.select().from(schema.bookings).where(eq(schema.bookings.reference, b.reference)))[0]; }
async function payment(b) { return (await db.select().from(schema.bookingPayments).where(eq(schema.bookingPayments.id, `primary:${b.reference}`)))[0]; }
function session(b, status = 'paid') { return { provider: 'stripe', sessionId: b.checkoutSessionId, transactionId: b.paymentIntentId, status, currency: 'thb', amountMinor: b.total * 100, bookingReference: b.reference }; }
test('late failed and expired events cannot demote paid money', async () => {
    const b = await seed();
    await payments.markProviderFailure(b.reference, 'declined', 'Earlier attempt', 'old:' + b.reference);
    await payments.reconcilePaymentSession(b, session(b, 'expired'), 'webhook');
    assert.equal((await booking(b)).paymentStatus, 'paid');
    assert.equal((await payment(b)).status, 'paid');
});
test('checkout paid cannot erase a refund or dispute', async () => {
    for (const status of ['refunded', 'partially_refunded', 'disputed']) {
        const b = await seed({ paymentStatus: status });
        await payments.reconcilePaymentSession(b, session(b), 'admin');
        assert.equal((await booking(b)).paymentStatus, status);
        assert.equal((await payment(b)).status, status);
    }
});
test('a mismatched provider amount never marks payment paid', async () => {
    const b = await seed({ paymentStatus: 'pending', amountPaid: 0, status: 'pending_payment' });
    const result = await payments.reconcilePaymentSession(b, { ...session(b), amountMinor: 1 }, 'webhook');
    assert.equal(result.status, 'mismatch');
    assert.equal((await booking(b)).amountPaid, 0);
});
test('outbound completion leaves return active, then return completes parent', async () => {
    const b = await seed({ returnDate: '2026-11-03', returnTime: '15:00', returnTotal: 400, returnPickup: 'Pattaya', returnDropoff: 'Airport' });
    await legs.completeJourney(b.reference, 'outbound', 'completed');
    assert.equal((await booking(b)).status, 'confirmed');
    const journeys = await legs.journeysFor([await booking(b)]);
    assert.equal(journeys[0].status, 'completed');
    assert.equal(journeys[1].status, 'confirmed');
    assert.equal(journeys[1].pickupDate, '2026-11-03');
    assert.equal(journeys[1].pickup, 'Pattaya');
    assert.equal(journeys[1].flightNumber, null);
    await legs.completeJourney(b.reference, 'return', 'completed');
    assert.equal((await booking(b)).status, 'completed');
});
test('simultaneous completion closes the booking only after both legs finish', async () => {
    const b = await seed({ returnDate: '2026-11-03', returnTime: '15:00' });
    await Promise.all([legs.completeJourney(b.reference, 'outbound', 'completed'), legs.completeJourney(b.reference, 'return', 'completed')]);
    assert.equal((await booking(b)).status, 'completed');
});
test('database allows two independent assignments but only one active driver per leg', async () => {
    const b = await seed();
    const now = new Date().toISOString();
    const base = { bookingReference: b.reference, driverId: 'driver-test', assignedBy: 'test', assignedAt: now, tokenExpiresAt: now, updatedAt: now };
    await db.insert(schema.bookingAssignments).values([{ ...base, id: 'out-test', tokenHash: 'out-test', leg: 'outbound' }, { ...base, id: 'return-test', tokenHash: 'return-test', leg: 'return' }]);
    await assert.rejects(db.insert(schema.bookingAssignments).values({ ...base, id: 'duplicate-test', tokenHash: 'duplicate-test', leg: 'return' }));
});
test('hourly reservations block the whole booked duration', () => {
    const hourly = { reference: 'hours', pickupDate: '2026-11-01', pickupTime: '09:00', routeDurationSeconds: null, preparationBufferMinutes: 30, postTripBufferMinutes: 30, serviceType: 'hourly', bookedHours: 10 };
    const first = bookingWindow(hourly);
    const second = bookingWindow({ ...hourly, pickupTime: '12:00', serviceType: 'transfer', bookedHours: null });
    assert.equal(new Date(first.endsAt).toISOString(), '2026-11-01T12:30:00.000Z');
    assert.equal(rangesOverlap(first.startsAt, first.endsAt, second.startsAt, second.endsAt), true);
});
test('cash collection is idempotent, bounded and auditable', async () => {
    const b = await seed({ paymentMethod: 'cash', amountPaid: 0, paymentStatus: 'cash_due' });
    const { POST } = await vite.ssrLoadModule('/app/api/admin/payments/route.ts');
    async function collect(amountMinor, receiptId) { return POST(new Request('https://example.invalid/api/admin/payments', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'collect_cash', reference: b.reference, amountMinor, receiptId }) })); }
    const receiptId = crypto.randomUUID();
    assert.equal((await collect(60000, receiptId)).status, 200);
    assert.equal((await collect(60000, receiptId)).status, 200);
    assert.equal((await booking(b)).amountPaid, 600);
    assert.equal((await collect(50000, crypto.randomUUID())).status, 409);
    assert.equal((await booking(b)).amountPaid, 600);
    assert.equal((await collect(40000, crypto.randomUUID())).status, 200);
    assert.equal((await booking(b)).paymentStatus, 'paid');
    const receipts = await d1.prepare('SELECT * FROM cash_receipts WHERE booking_reference=?').bind(b.reference).all();
    assert.equal(receipts.results.length, 2);
    assert.equal(receipts.results[0].collected_by, 'operations@example.invalid');
});
test('concurrent cash receipts cannot overcollect', async () => {
    const b = await seed({ paymentMethod: 'cash', amountPaid: 0, paymentStatus: 'cash_due' });
    const { POST } = await vite.ssrLoadModule('/app/api/admin/payments/route.ts');
    const responses = await Promise.all([1, 2].map(() => POST(new Request('https://example.invalid/api/admin/payments', { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'collect_cash', reference: b.reference, amountMinor: 70000, receiptId: crypto.randomUUID() }) }))));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    assert.equal((await booking(b)).amountPaid, 700);
});
test('flight delays suggest a pickup without changing the booking', async () => {
    const b = await seed({ pickupTime: '10:00', flightScheduledArrival: '2026-11-01T09:00:00+07:00' });
    const flight = { status: 'active', scheduledArrival: b.flightScheduledArrival, estimatedArrival: '2026-11-01T10:00:00+07:00', actualArrival: null };
    const adjustment = flightAdjustment(b, flight);
    assert.equal(adjustment.needsReview, true);
    assert.equal(adjustment.differenceMinutes, 60);
    assert.equal(adjustment.proposedPickupAt, '2026-11-01T04:00:00.000Z');
    assert.equal((await booking(b)).pickupTime, '10:00');
    assert.equal(flightAdjustment(b, { ...flight, status: 'cancelled' }).proposedPickupAt, null);
});

test('confirmation payment labels describe actual cash, refund and expired states', async () => {
 const {confirmationPaymentLabel}=await vite.ssrLoadModule('/lib/confirmation-payment.ts');
 assert.equal(confirmationPaymentLabel('stripe','expired',1000),'Payment session expired');
 assert.equal(confirmationPaymentLabel('stripe','refunded',1000),'Refunded');
 assert.equal(confirmationPaymentLabel('stripe','pending',1000),'Payment confirmation pending');
 assert.equal(confirmationPaymentLabel('cash','cash_due',1000),'Cash due at pickup');
 assert.equal(confirmationPaymentLabel('cash','paid',1000),'Cash collected');
});
function adminRequest(path,input){return new Request('https://example.invalid'+path,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(input)});}
async function seedDriver(){const now=new Date().toISOString();const id=crypto.randomUUID();await db.insert(schema.drivers).values({id,fullName:'Test Driver',phone:'+66123456789',status:'active',createdAt:now,updatedAt:now});return id;}
test('operations assigns separate drivers and return driver sees the return schedule',async()=>{
 const b=await seed({returnDate:'2026-11-03',returnTime:'15:00',returnPickup:'Return hotel',returnDropoff:'Return airport'});const {POST}=await vite.ssrLoadModule('/app/api/admin/operations/route.ts');
 const outDriver=await seedDriver();const returnDriver=await seedDriver();
 const outbound=await POST(adminRequest('/api/admin/operations',{action:'assign',bookingReference:b.reference,driverId:outDriver,leg:'outbound'}));assert.equal(outbound.status,200);
 const returned=await POST(adminRequest('/api/admin/operations',{action:'assign',bookingReference:b.reference,driverId:returnDriver,leg:'return'}));assert.equal(returned.status,200);const returnedData=await returned.json();
 const assignments=await db.select().from(schema.bookingAssignments).where(eq(schema.bookingAssignments.bookingReference,b.reference));assert.equal(assignments.filter(a=>!a.revokedAt).length,2);
 const token=returnedData.driverUrl.split('/').at(-1);const {GET}=await vite.ssrLoadModule('/app/api/driver/trips/[token]/route.ts');const res=await GET(new Request('https://example.invalid/driver/trip/'+token),{params:Promise.resolve({token})});assert.equal(res.status,200);const trip=await res.json();assert.equal(trip.booking.pickup,'Return hotel');assert.equal(trip.booking.pickupTime,'15:00');assert.equal(trip.booking.leg,'return');
 await db.update(schema.bookingAssignments).set({currentStatus:'standby'}).where(eq(schema.bookingAssignments.id,returnedData.assignment.id));
 const rotated=await POST(adminRequest('/api/admin/operations',{action:'rotate_link',assignmentId:returnedData.assignment.id}));assert.equal(rotated.status,200);const rotation=await rotated.json();assert.equal(rotation.assignment.id,returnedData.assignment.id);assert.equal(rotation.assignment.currentStatus,'standby');assert.equal((await GET(new Request('https://example.invalid/driver/trip/'+token),{params:Promise.resolve({token})})).status,404);
});
test('return rescheduling leaves the outbound time unchanged',async()=>{
 const b=await seed({returnDate:'2026-11-03',returnTime:'15:00'});const {POST}=await vite.ssrLoadModule('/app/api/admin/calendar/route.ts');const response=await POST(adminRequest('/api/admin/calendar',{action:'update_booking',bookingReference:b.reference,leg:'return',pickupDate:'2026-11-04',pickupTime:'17:00'}));assert.equal(response.status,200);const fresh=await booking(b);assert.equal(fresh.pickupDate,b.pickupDate);assert.equal(fresh.pickupTime,b.pickupTime);assert.equal(fresh.returnDate,'2026-11-04');assert.equal(fresh.returnTime,'17:00');
});
test('split journey costs replace legacy totals without double counting',async()=>{
 const b=await seed({returnDate:'2026-11-03',returnTime:'15:00'});const now=new Date().toISOString();await db.insert(schema.bookingCosts).values({bookingReference:b.reference,totalDriverCost:900,updatedBy:'test',createdAt:now,updatedAt:now});const {POST}=await vite.ssrLoadModule('/app/api/admin/payments/route.ts');const {paymentDashboard}=await vite.ssrLoadModule('/lib/payment-dashboard.ts');
 async function setCost(leg,costMinor){const res=await POST(adminRequest('/api/admin/payments',{action:'update_leg_cost',reference:b.reference,leg,costMinor,paymentStatus:'unpaid'}));assert.equal(res.status,200);}
 await setCost('outbound',20000);let row=(await paymentDashboard()).rows.find(r=>r.reference===b.reference);assert.equal(row.costMinor,null);await setCost('return',30000);row=(await paymentDashboard()).rows.find(r=>r.reference===b.reference);assert.equal(row.costMinor,50000);assert.equal(row.marginMinor,50000);assert.equal(row.profitMinor,null);
});
test('Stripe financial reconciliation preserves refund totals and resolves only won disputes',async()=>{
 const b=await seed();const {reconcileStripeFinance}=await vite.ssrLoadModule('/lib/stripe-finance.ts');const originalFetch=globalThis.fetch;globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';let refunded=40000;let disputeStatus=null;
 globalThis.fetch=async(url)=>{const value=String(url).includes('/disputes?')?{data:disputeStatus?[{status:disputeStatus,amount:100000}]:[],has_more:false}:{currency:'thb',amount_received:100000,latest_charge:{currency:'thb',amount:100000,amount_refunded:refunded,balance_transaction:{currency:'thb',fee:3000}}};return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});};
 try{await reconcileStripeFinance(b.reference,b.paymentIntentId);assert.equal((await payment(b)).refundedMinor,40000);assert.equal((await booking(b)).paymentStatus,'partially_refunded');refunded=0;await reconcileStripeFinance(b.reference,b.paymentIntentId);assert.equal((await payment(b)).refundedMinor,40000);refunded=40000;disputeStatus='needs_response';await reconcileStripeFinance(b.reference,b.paymentIntentId);assert.equal((await booking(b)).paymentStatus,'disputed');disputeStatus='lost';await reconcileStripeFinance(b.reference,b.paymentIntentId);assert.equal((await booking(b)).paymentStatus,'disputed');disputeStatus='won';await reconcileStripeFinance(b.reference,b.paymentIntentId);assert.equal((await booking(b)).paymentStatus,'partially_refunded');}
 finally{globalThis.fetch=originalFetch;delete globalThis.__journeyTestEnv.STRIPE_SECRET_KEY;}
});

test('payout reports use each leg driver and never pay the combined cost twice',async()=>{
 const b=await seed({returnDate:'2026-11-03',returnTime:'15:00'});const {POST}=await vite.ssrLoadModule('/app/api/admin/operations/route.ts');const outDriver=await seedDriver();const returnDriver=await seedDriver();
 for(const [leg,driverId] of [['outbound',outDriver],['return',returnDriver]])assert.equal((await POST(adminRequest('/api/admin/operations',{action:'assign',bookingReference:b.reference,driverId,leg}))).status,200);
 const {POST:setCost}=await vite.ssrLoadModule('/app/api/admin/payments/route.ts');for(const [leg,costMinor] of [['outbound',20000],['return',30000]])await setCost(adminRequest('/api/admin/payments',{action:'update_leg_cost',reference:b.reference,leg,costMinor,paymentStatus:'unpaid'}));
 const {driverPayouts,markWeekPaid}=await vite.ssrLoadModule('/lib/reports.ts');let groups=await driverPayouts({from:'2026-11-01',to:'2026-11-04'});assert.equal(groups.find(g=>g.driverId===outDriver).owed,200);assert.equal(groups.find(g=>g.driverId===returnDriver).owed,300);const returned=groups.find(g=>g.driverId===returnDriver);assert.equal(returned.trips[0].pickupDate,'2026-11-03');await markWeekPaid(returnDriver,returned.week,'test-payout','operations@example.invalid');const costs=await db.select().from(schema.journeyCosts).where(eq(schema.journeyCosts.bookingReference,b.reference));assert.equal(costs.find(c=>c.leg==='return').paymentStatus,'paid');assert.equal(costs.find(c=>c.leg==='outbound').paymentStatus,'unpaid');
});
test('flight assistance retains the original pickup offset through later changes',async()=>{
 const b=await seed({flightNumber:'TG123',pickupTime:'10:00',flightScheduledArrival:'2026-11-01T09:00:00+07:00'});const {refreshBookingFlight}=await vite.ssrLoadModule('/lib/flight-assistance.ts');const now=new Date().toISOString();const cache={cacheKey:'2026-11-01:TG123',flightNumber:'TG123',flightDate:'2026-11-01',status:'active',scheduledArrival:b.flightScheduledArrival,estimatedArrival:'2026-11-01T10:00:00+07:00',fetchedAt:now,expiresAt:new Date(Date.now()+3600000).toISOString()};await db.insert(schema.flightStatusCache).values(cache);await refreshBookingFlight(b.reference);
 const alert=(await db.select().from(schema.operationsAlerts).where(eq(schema.operationsAlerts.dedupeKey,`flight-change:${b.reference}:outbound`)))[0];await db.update(schema.operationsAlerts).set({status:'resolved',resolvedAt:now}).where(eq(schema.operationsAlerts.id,alert.id));await db.update(schema.bookings).set({pickupTime:'11:00'}).where(eq(schema.bookings.reference,b.reference));await refreshBookingFlight(b.reference);let fresh=(await db.select().from(schema.operationsAlerts).where(eq(schema.operationsAlerts.id,alert.id)))[0];assert.equal(fresh.status,'resolved');await db.update(schema.flightStatusCache).set({estimatedArrival:'2026-11-01T11:00:00+07:00'}).where(eq(schema.flightStatusCache.cacheKey,cache.cacheKey));await refreshBookingFlight(b.reference);fresh=(await db.select().from(schema.operationsAlerts).where(eq(schema.operationsAlerts.id,alert.id)))[0];assert.equal(fresh.status,'open');assert.equal(JSON.parse(fresh.details).proposedPickupAt,'2026-11-01T05:00:00.000Z');assert.equal((await booking(b)).pickupTime,'11:00');
});

test('scheduled recovery verifies the provider before expiring an old checkout',async()=>{
 const now=new Date();await db.update(schema.bookings).set({lastPaymentCheckedAt:new Date(now.getTime()+24*3600000).toISOString(),fulfillmentStatus:'complete'});
 const b=await seed({status:'pending_payment',paymentStatus:'pending',amountPaid:0,fulfillmentStatus:'pending',lastPaymentCheckedAt:null,createdAt:new Date(now.getTime()-36*3600000).toISOString()});const {runPaymentRecovery}=await vite.ssrLoadModule('/lib/payment-recovery.ts');const originalFetch=globalThis.fetch;globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';
 try{globalThis.fetch=async()=>new Response('{}',{status:503});let result=await runPaymentRecovery(now);assert.equal(result.failed,1);assert.equal((await booking(b)).status,'pending_payment');assert.equal((await booking(b)).paymentStatus,'pending');
 globalThis.fetch=async(url)=>new Response(JSON.stringify(String(url).includes('/checkout/sessions/')?{id:b.checkoutSessionId,payment_intent:b.paymentIntentId,status:'complete',payment_status:'paid',currency:'thb',amount_total:100000,metadata:{booking_reference:b.reference}}:String(url).includes('/disputes?')?{data:[],has_more:false}:{currency:'thb',amount_received:100000,latest_charge:{currency:'thb',amount:100000,amount_refunded:0,balance_transaction:{currency:'thb',fee:3000}}}),{headers:{'content-type':'application/json'}});result=await runPaymentRecovery(new Date(now.getTime()+10*60000));assert.equal(result.recovered,1);assert.equal((await booking(b)).paymentStatus,'paid');assert.equal((await payment(b)).amountPaid,1000);
 }finally{globalThis.fetch=originalFetch;delete globalThis.__journeyTestEnv.STRIPE_SECRET_KEY;}
});

const refundFlow=await vite.ssrLoadModule('/lib/refunds.ts');
const accepted=await vite.ssrLoadModule('/lib/accepted-policy.ts');
test('database-to-provider refund uses satang and caps a second refund at policy entitlement',async()=>{
 const b=await seed({pickupDate:'2026-11-01',pickupTime:'09:00'});await accepted.saveAcceptedPolicy(b.reference,new Date().toISOString());
 const requestedAt=new Date(Date.parse('2026-11-01T09:00:00+07:00')-30*3600000).toISOString();
 const calls=[];const originalFetch=globalThis.fetch;globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({id:'re_test_'+b.reference,status:'succeeded'});};
 try {
  const q=await refundFlow.quoteRefund(b.reference,'customer_cancellation',requestedAt);assert.equal(q.paidMinor,100000);assert.equal(q.amountMinor,50000);
  const key=crypto.randomUUID();const result=await refundFlow.createRefund({reference:b.reference,reason:'customer_cancellation',requestedAt,idempotencyKey:key,admin:'staff-test'});
  assert.equal(result.refund.status,'refunded');assert.equal(new URLSearchParams(calls[0].options.body).get('amount'),'50000');assert.equal(calls[0].options.headers['Idempotency-Key'],`waydidi-refund-${key}`);
  const again=await refundFlow.quoteRefund(b.reference,'customer_cancellation',requestedAt);assert.equal(again.amountMinor,0);assert.equal((await payment(b)).refundedMinor,50000);
  const duplicate=await refundFlow.createRefund({reference:b.reference,reason:'customer_cancellation',requestedAt,idempotencyKey:key,admin:'staff-test'});assert.equal(duplicate.duplicate,true);assert.equal(calls.length,1);
 }finally{globalThis.fetch=originalFetch;}
});
test('a timed-out submission stays reserved and retries with the original provider key',async()=>{
 const b=await seed();await accepted.saveAcceptedPolicy(b.reference,new Date().toISOString());
 const originalFetch=globalThis.fetch;const key=crypto.randomUUID();let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('response lost');};globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';
 try{
  const input={reference:b.reference,reason:'goodwill',requestedAt:new Date().toISOString(),idempotencyKey:key,admin:'staff-test'};
  const result=await refundFlow.createRefund(input);assert.equal(result.refund.status,'processing');assert.equal(result.refund.providerStatus,'submission_unknown');
  const replacement=await refundFlow.createRefund({...input,idempotencyKey:crypto.randomUUID()});assert.ok(replacement.error);assert.equal(calls,1);
  await d1.prepare("UPDATE booking_refunds SET updated_at=? WHERE id=?").bind(new Date(Date.now()-6*60000).toISOString(),result.refund.id).run();
  globalThis.fetch=async(url,options)=>{if(String(url).includes('refunds?'))return Response.json({data:[],has_more:false});calls++;assert.equal(options.headers['Idempotency-Key'],`waydidi-refund-${key}`);assert.equal(new URLSearchParams(options.body).get('amount'),'100000');return Response.json({id:'re_recovered',status:'succeeded'});};
  await refundFlow.reconcileRefunds(b.reference);assert.equal((await refundFlow.refundsFor(b.reference))[0].status,'refunded');assert.equal(calls,2);
 }finally{globalThis.fetch=originalFetch;}
});
test('concurrent refund requests reserve a single policy entitlement',async()=>{
 const b=await seed();await accepted.saveAcceptedPolicy(b.reference,new Date().toISOString());const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({id:'re_pending_'+b.reference,status:'pending'});globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';
 try{const results=await Promise.all([1,2].map(()=>refundFlow.createRefund({reference:b.reference,reason:'goodwill',requestedAt:new Date().toISOString(),idempotencyKey:crypto.randomUUID(),admin:'staff-test'})));assert.equal(results.filter(r=>r.refund).length,1);assert.equal((await refundFlow.refundsFor(b.reference)).length,1);}finally{globalThis.fetch=originalFetch;}
});
test('legacy cancellation policy cannot silently inherit new terms',async()=>{const b=await seed();assert.match((await refundFlow.quoteRefund(b.reference,'customer_cancellation')).error,/original terms/);});
test('payment creation and reconciliation preserve the exact satang amount',async()=>{
 const b=await seed({status:'pending_payment',paymentStatus:'pending',amountPaid:0,total:1234.56});const originalFetch=globalThis.fetch;const stripe=await vite.ssrLoadModule('/lib/stripe.ts');globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';
 globalThis.fetch=async(url,options)=>{const body=new URLSearchParams(options.body);assert.equal(body.get('line_items[0][price_data][unit_amount]'),'123456');return Response.json({id:b.checkoutSessionId,client_secret:'test_only'});};
 try{await stripe.createCheckoutSession({reference:b.reference,accessToken:'test_only',customerEmail:b.customerEmail,vehicle:'economy_sedan',total:b.total,origin:'https://example.invalid',idempotencyKey:crypto.randomUUID()});await payments.reconcilePaymentSession(b,{...session(b),amountMinor:123456},'webhook',false);assert.equal((await payment(b)).amountPaidMinor,123456);assert.equal((await payment(b)).amountExpectedMinor,123456);}finally{globalThis.fetch=originalFetch;}
});

test('payment rejects stale outbound or return quotes independently',async()=>{
 const check=await vite.ssrLoadModule('/lib/booking-quote-check.ts');const now=new Date().toISOString(),date='2026-11-01',backDate='2026-11-03';
 const {DEMO_PRICES}=await vite.ssrLoadModule('/lib/demo-route.ts');const {withSeason}=await vite.ssrLoadModule("/lib/seasons.ts");const prices=JSON.stringify(await withSeason(Object.fromEntries(Object.entries(DEMO_PRICES).map(([id,total])=>[id,{total,basePrice:total,distanceSurcharge:0}])),date,{service:"transfer",areaId:"sample-pattaya"}));
 const outId=crypto.randomUUID(),backId=crypto.randomUUID();const row={areaId:'sample-pattaya',areaName:'Pattaya',distanceMeters:125000,durationSeconds:6000,vehiclePricesJson:prices,pricingVersion:1,timezone:'Asia/Bangkok',expiresAt:new Date(Date.now()+30*60000).toISOString(),createdAt:now};
 await db.insert(schema.fareQuotes).values([{...row,id:outId,pickupPlaceId:'bkk',dropoffPlaceId:'pattaya',pickupText:'Suvarnabhumi Airport',dropoffText:'Pattaya',departureDate:date,departureTime:'09:00'},{...row,id:backId,pickupPlaceId:'pattaya',dropoffPlaceId:'bkk',pickupText:'Pattaya',dropoffText:'Suvarnabhumi Airport',departureDate:backDate,departureTime:'10:00'}]);
 const b=await seed({fareQuoteId:outId,returnFareQuoteId:backId,returnDate:backDate,returnTime:'10:00',pickupDate:date,pickupTime:'09:00'});assert.equal(await check.validBookingQuotes(b),true);
 await db.update(schema.fareQuotes).set({expiresAt:new Date(Date.now()-1).toISOString()}).where(eq(schema.fareQuotes.id,backId));assert.equal(await check.validBookingQuotes(b),false);
 await db.update(schema.fareQuotes).set({expiresAt:row.expiresAt}).where(eq(schema.fareQuotes.id,backId));await db.update(schema.fareQuotes).set({createdAt:new Date(Date.now()-31*60000).toISOString(),expiresAt:'9999-12-31T23:59:59.999Z'}).where(eq(schema.fareQuotes.id,outId));assert.equal(await check.validBookingQuotes(b),false);
});

test('cash refund entitlement uses received satang and records the return separately',async()=>{
 const b=await seed({paymentMethod:'cash',paymentStatus:'cash_due',amountPaid:0});await accepted.saveAcceptedPolicy(b.reference,new Date().toISOString());await db.insert(schema.cashReceipts).values({id:crypto.randomUUID(),bookingReference:b.reference,amountMinor:100000,collectedBy:'staff-test',createdAt:new Date().toISOString()});
 const requestedAt=new Date(Date.parse(`${b.pickupDate}T${b.pickupTime}:00+07:00`)-30*3600000).toISOString();const q=await refundFlow.quoteRefund(b.reference,'customer_cancellation',requestedAt);assert.equal(q.paidMinor,100000);assert.equal(q.amountMinor,50000);
 const r=await refundFlow.createRefund({reference:b.reference,reason:'customer_cancellation',requestedAt,idempotencyKey:crypto.randomUUID(),admin:'staff-test'});assert.equal(r.refund.status,'refunded');assert.equal(r.refund.providerStatus,'cash_returned');assert.equal((await refundFlow.quoteRefund(b.reference,'customer_cancellation',requestedAt)).amountMinor,0);
});


test('lost refund responses reconcile after idempotency retention without a replacement POST',async()=>{
 const b=await seed();const key=crypto.randomUUID();const originalFetch=globalThis.fetch;
 globalThis.__journeyTestEnv.STRIPE_SECRET_KEY='sk_test_mock';globalThis.fetch=async()=>{throw new Error('response lost');};
 try {
  const result=await refundFlow.createRefund({reference:b.reference,reason:'goodwill',requestedAt:new Date().toISOString(),idempotencyKey:key,admin:'staff-test'});
  await d1.prepare("UPDATE booking_refunds SET created_at=?,updated_at=? WHERE id=?").bind(new Date(Date.now()-25*3600000).toISOString(),new Date(Date.now()-6*60000).toISOString(),result.refund.id).run();
  let lookups=0;
  globalThis.fetch=async(url,options)=>{
   assert.notEqual(options.method,'POST');
   if(String(url).includes('refunds?')){lookups++;assert.equal(new URL(String(url)).searchParams.get('payment_intent'),b.paymentIntentId);return Response.json({data:[{id:'re_lost',status:'succeeded',amount:100000,currency:'thb',metadata:{refund_key:`waydidi-refund-${key}`,booking_reference:b.reference}}],has_more:false});}
   return Response.json({id:'re_lost',status:'succeeded'});
  };
  await refundFlow.reconcileRefunds(b.reference);assert.equal(lookups,1);const row=(await refundFlow.refundsFor(b.reference))[0];assert.equal(row.status,'refunded');assert.equal(row.providerRefundId,'re_lost');
 }finally{globalThis.fetch=originalFetch;}
});
