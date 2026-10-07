import { migrationStatements } from './helpers/migrations.mjs';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { createServer } from 'vite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
const root = fileURLToPath(new URL('..', import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-05-22', d1Databases: ['DB'] });
const d1 = await mf.getD1Database('DB');
for (const name of (await readdir(root + '/drizzle')).filter(n => n.endsWith('.sql')).sort()) {
    const statements = migrationStatements(await readFile(root + '/drizzle/' + name, 'utf8'));
    if (statements.length)
        try {
            await d1.batch(statements.map(s => d1.prepare(s)));
        }
        catch (e) {
            throw new Error(name + ': ' + e.message);
        }
}
globalThis.__crmEnv = { DB: d1, RESEND_API_KEY: 'test', BOOKING_FROM_EMAIL: 'test@example.invalid', WAYDIDI_ADMIN_SESSION_SECRET: '01234567890123456789012345678901' };
const originalFetch = globalThis.fetch;
let calls = 0, failEmail = false;
globalThis.fetch = async (url) => {
    if (String(url).includes('resend.com')) {
        calls++;
        return new Response(JSON.stringify({ id: 'test' }), { status: failEmail ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('Unexpected network ' + url);
};
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, plugins: [{ name: 'crm-env', enforce: 'pre', resolveId(id) {
                if (id === 'cloudflare:workers')
                    return '\0crm-env';
            }, load(id) {
                if (id === '\0crm-env')
                    return 'export const env=globalThis.__crmEnv';
            } }], server: { middlewareMode: true, hmr: false } });
after(async () => { globalThis.fetch = originalFetch; await vite.close(); await mf.dispose(); delete globalThis.__crmEnv; });
const crm = await vite.ssrLoadModule('/lib/crm.ts'), members = await vite.ssrLoadModule('/lib/customer-admin.ts'), queue = await vite.ssrLoadModule('/lib/crm-email-queue.ts'), agency = await vite.ssrLoadModule('/lib/agency.ts'), { getDb } = await vite.ssrLoadModule('/db/index.ts'), schema = await vite.ssrLoadModule('/db/schema.ts'), db = getDb();
const now = new Date().toISOString(), future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
await d1.prepare("INSERT INTO staff_accounts(id,username,email,display_name,password_hash,role,created_at) VALUES('owner','owner','owner@example.invalid','Owner','test','owner',?)").bind(now).run();
const book = async (reference, email = 'guest@example.invalid', status = 'confirmed') => db.insert(schema.bookings).values({ reference, customerName: 'Guest', customerSurname: 'Traveller', customerEmail: email, customerPhone: '+66 123456789', pickup: 'Bangkok hotel', dropoff: 'Pattaya hotel', pickupDate: future, pickupTime: '09:00', passengers: 2, luggage: 1, vehicle: 'economy_sedan', paymentMethod: 'cash', total: 2000, status, paymentStatus: 'cash_due', accessTokenHash: 'test', createdAt: now, updatedAt: now });
const create = async (name, email = '') => crm.crmAction('contact', { name, email, phone: '', notes: '' }, 'owner', 'owner');
let guest;
test('migrations and automatic booking guest profiles work with foreign keys enabled', async () => { await book('CRMBOOK1'); const source = await d1.prepare("SELECT contact_id FROM crm_sources WHERE kind='booking' AND source_id='CRMBOOK1'").first(); guest = source.contact_id; assert.equal((await crm.profile(guest)).bookings.length, 1); assert.equal((await crm.crmList('customers', 'Guest', 1, 'guests')).items.length, 1); assert.equal((await d1.prepare("SELECT stage FROM crm_leads WHERE booking_reference='CRMBOOK1'").first()).stage, 'won'); });
test('full member search, independent totals and export cover more than 500 members', async () => {
    for (let offset = 0; offset < 520; offset += 80)
        await d1.batch(Array.from({ length: Math.min(80, 520 - offset) }, (_, j) => d1.prepare('INSERT INTO customers(id,email,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind('m' + (offset + j), `person${offset + j}@example.invalid`, 'Member ' + (offset + j), now, now)));
    const p = await members.memberPage('person519', 1);
    assert.equal(p.total, 1);
    assert.equal(p.items[0].email, 'person519@example.invalid');
    assert.equal(p.stats.total, 520);
    assert.equal((await members.memberPage('', 11)).items.length, 20);
    const csv = await new Response(await members.memberCsv('', 'all', 'newest')).text();
    assert.equal(csv.trim().split('\r\n').length, 521);
    assert.ok(csv.includes('person519@example.invalid'));
});
test('verified booking association moves CRM records but not booking ownership', async () => { await db.insert(schema.customerBookingLinks).values({ bookingReference: 'CRMBOOK1', customerId: 'm0', createdAt: now }); const p = await crm.profile('member:m0'); assert.equal(p.bookings.length, 1); assert.equal((await d1.prepare("SELECT customer_email FROM bookings WHERE reference='CRMBOOK1'").first()).customer_email, 'guest@example.invalid'); });
test('pipeline stores lost reasons and rejects stale updates or unverified won status', async () => { const c = await create('Lead owner'); const l = await crm.crmAction('lead', { contactId: c.id, title: 'Airport pickup', valueMinor: 180000 }, 'owner', 'owner'); await assert.rejects(() => crm.crmAction('stage', { id: l.id, stage: 'lost', version: 0 }, 'owner', 'owner'), /lost reason/); await crm.crmAction('stage', { id: l.id, stage: 'quoted', version: 0 }, 'owner', 'owner'); await assert.rejects(() => crm.crmAction('stage', { id: l.id, stage: 'lost', version: 0, lossReason: 'Budget' }, 'owner', 'owner'), /changed/); await assert.rejects(() => crm.crmAction('stage', { id: l.id, stage: 'won', version: 1 }, 'owner', 'owner'), /confirmed booking/); });
test('tasks have a chosen due date, completion timestamp and profile history', async () => { const c = await create('Task owner'), t = await crm.crmAction('task', { contactId: c.id, title: 'Call about pickup', dueAt: now, ownerId: 'owner' }, 'owner', 'owner'); await crm.crmAction('task_status', { id: t.id, status: 'completed' }, 'owner', 'owner'); const p = await crm.profile(c.id); assert.equal(p.tasks[0].status, 'completed'); assert.ok(p.tasks[0].completed_at); assert.ok(p.events.some(e => e.body.includes('completed'))); });
test('owner-only merge preserves sign-in and booking ownership and concurrent cross-merges cannot cycle', async () => { const a = await create('Duplicate A', 'same@example.invalid'), b = await create('Duplicate B', 'same@example.invalid'); await assert.rejects(() => crm.crmAction('merge', { id: a.id, targetId: b.id }, 'owner', 'support'), /Only the owner/); const outcomes = await Promise.allSettled([crm.crmAction('merge', { id: a.id, targetId: b.id }, 'owner', 'owner'), crm.crmAction('merge', { id: b.id, targetId: a.id }, 'owner', 'owner')]); assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1); const states = (await d1.prepare('SELECT merged_into FROM crm_contacts WHERE id IN (?,?)').bind(a.id, b.id).all()).results; assert.equal(states.filter(s => s.merged_into === null).length, 1); assert.equal((await d1.prepare("SELECT count(*) n FROM customers").first()).n, 520); });
test('shared quotes preserve revisions, replace links and accept concurrently into one booking form', async () => { const c = await create('Quote traveller'); const input = { contactId: c.id, title: 'Bangkok to Pattaya', pickup: 'Bangkok hotel', dropoff: 'Pattaya hotel', tripDate: future, tripTime: '09:00', vehicle: 'economy_sedan', amountMinor: 250000, expiresAt: new Date(Date.now() + 86400000).toISOString() }; const q = await crm.crmAction('quote', input, 'owner', 'owner'), share = await crm.crmAction('quote_share', { id: q.id }, 'owner', 'owner'), token = share.url.split('/').at(-1); assert.ok(await crm.publicQuote(token)); await crm.crmAction('quote', { ...input, id: q.id, amountMinor: 260000 }, 'owner', 'owner'); assert.equal(await crm.publicQuote(token), null); assert.equal((await d1.prepare('SELECT count(*) n FROM crm_quote_versions WHERE quote_id=?').bind(q.id).first()).n, 2); const share2 = await crm.crmAction('quote_share', { id: q.id }, 'owner', 'owner'), token2 = share2.url.split('/').at(-1); const accepted = await Promise.all(Array.from({ length: 8 }, () => crm.acceptQuote(token2))); assert.equal(new Set(accepted.map(v => v.path)).size, 1); const form = await d1.prepare('SELECT prefill FROM booking_forms WHERE token=?').bind(accepted[0].path.split('/').at(-1)).first(); assert.equal(JSON.parse(form.prefill).price, 2600); assert.equal((await d1.prepare('SELECT count(*) n FROM booking_forms').first()).n, 1); });
test('email queue retries temporary failures and prevents concurrent duplicate sends', async () => { calls = 0; failEmail = true; await queue.enqueueCrmEmail('test-retry', 'recipient@example.invalid', { kind: 'reward', data: { to: 'recipient@example.invalid', title: 'Your gift', kicker: 'Gift', intro: 'Hello', cta: 'See gifts', path: '/account/coupons', tag: 'retry' } }); await queue.recoverCrmEmails(); assert.equal(calls, 1); const failed = await d1.prepare("SELECT * FROM crm_outbox WHERE dedupe_key='test-retry'").first(); assert.equal(failed.attempts, 1); assert.equal(failed.status, 'failed'); failEmail = false; await Promise.all(Array.from({ length: 8 }, () => queue.recoverCrmEmails(new Date(Date.now() + 6 * 60000)))); assert.equal(calls, 2); assert.equal((await d1.prepare("SELECT status FROM crm_outbox WHERE dedupe_key='test-retry'").first()).status, 'sent'); });
test('email queue recovers stale processing and stops after five attempts', async () => { calls = 0; failEmail = true; await queue.enqueueCrmEmail('stuck', 'recipient@example.invalid', { kind: 'reward', data: { to: 'recipient@example.invalid', title: 'Gift', kicker: 'Gift', intro: 'Hello', cta: 'Open', path: '/account', tag: 'stuck' } }); await d1.prepare("UPDATE crm_outbox SET status='processing',attempts=4,attempted_at=? WHERE dedupe_key='stuck'").bind(new Date(Date.now() - 20 * 60000).toISOString()).run(); await queue.recoverCrmEmails(); assert.equal(calls, 1); await queue.recoverCrmEmails(new Date(Date.now() + 86400000)); assert.equal(calls, 1); failEmail = false; });
test('retention rechecks opt-out before sending', async () => { calls = 0; const c = await create('Opted out', 'no@example.invalid'); const rid = await crm.crmAction('retention', { title: 'Come back', kind: 'inactive', days: 30, ownerId: 'owner', channel: 'email', message: 'Hello', enabled: true }, 'owner', 'owner'); await queue.enqueueCrmEmail('opt-out', 'no@example.invalid', { kind: 'retention', data: { to: 'no@example.invalid', title: 'Come back', kicker: 'Waydidi', intro: 'Hello', cta: 'Book', path: '/', tag: 'opt-out' } }, c.id, rid.id); await queue.recoverCrmEmails(); assert.equal(calls, 0); assert.equal((await d1.prepare("SELECT status FROM crm_outbox WHERE dedupe_key='opt-out'").first()).status, 'cancelled'); });
test('partner staff access uses verified email and can be revoked', async () => { await db.insert(schema.agencyApplications).values({ id: 'agency-test', agencyName: 'Test hotel', contactName: 'Manager', email: 'hotel@example.invalid', phone: '12345', country: 'Thailand', monthlyTransfers: '10', status: 'approved', createdAt: now }); await crm.crmAction('partner', { agencyId: 'agency-test', rateNotes: 'Agreed airport rates', email: 'booker@example.invalid', active: true }, 'owner', 'owner'); assert.equal((await agency.agencyForCustomer({ id: 'm0', email: 'booker@example.invalid' })).id, 'agency-test'); await crm.crmAction('partner', { agencyId: 'agency-test', rateNotes: '', email: 'booker@example.invalid', active: false }, 'owner', 'owner'); assert.equal(await agency.agencyForCustomer({ id: 'm0', email: 'booker@example.invalid' }), null); });
test('account deletion erases billing and account-only data and retains booking evidence', async () => { await db.insert(schema.customerBillingProfiles).values({ id: 'billing0', customerId: 'm0', name: 'Personal billing', taxId: '1234', branch: 'Head office', address: 'Private address', createdAt: now, updatedAt: now }); assert.equal(await members.deleteCustomerAccount('m0'), true); assert.equal(await d1.prepare("SELECT id FROM customer_billing_profiles WHERE customer_id='m0'").first(), null); assert.equal(await d1.prepare("SELECT id FROM customers WHERE id='m0'").first(), null); assert.ok(await d1.prepare("SELECT reference FROM bookings WHERE reference='CRMBOOK1'").first()); });
test('retention automation creates one due task and skips customers who rebooked', async () => {
    const automation = await vite.ssrLoadModule('/lib/crm-automation.ts');
    await book('OLDTRIP', 'old@example.invalid', 'completed');
    await d1.prepare("UPDATE bookings SET pickup_date=? WHERE reference='OLDTRIP'").bind(new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)).run();
    const rule = await crm.crmAction('retention', { title: 'Check repeat transfer', kind: 'inactive', days: 30, ownerId: 'owner', channel: 'task', message: '', enabled: true }, 'owner', 'owner');
    await Promise.all(Array.from({ length: 5 }, () => automation.runCrmAutomation()));
    assert.equal((await d1.prepare('SELECT count(*) n FROM crm_tasks WHERE dedupe_key=?').bind('retention:' + rule.id + ':OLDTRIP').first()).n, 1);
    await automation.runCrmAutomation(new Date(Date.now() + 6 * 60000));
    assert.equal((await d1.prepare('SELECT count(*) n FROM crm_tasks WHERE dedupe_key=?').bind('retention:' + rule.id + ':OLDTRIP').first()).n, 1);
});
test('booking confirmation cancels related follow-up tasks and updates imported pipeline', async () => {
    await book('PENDINGCRM', 'pending@example.invalid', 'payment_failed');
    const lead = await d1.prepare("SELECT * FROM crm_leads WHERE booking_reference='PENDINGCRM'").first();
    const t = await crm.crmAction('task', { contactId: lead.contact_id, leadId: lead.id, title: 'Payment follow-up', dueAt: now, ownerId: 'owner' }, 'owner', 'owner');
    await d1.prepare("UPDATE bookings SET status='confirmed',updated_at=? WHERE reference='PENDINGCRM'").bind(now).run();
    assert.equal((await d1.prepare('SELECT status FROM crm_tasks WHERE id=?').bind(t.id).first()).status, 'cancelled');
    assert.equal((await d1.prepare('SELECT stage FROM crm_leads WHERE id=?').bind(lead.id).first()).stage, 'won');
});
test('provider retry window prevents an ambiguous resend after idempotency expires', async () => {
    calls = 0;
    await queue.enqueueCrmEmail('old-processing', 'recipient@example.invalid', { kind: 'reward', data: { to: 'recipient@example.invalid', title: 'Old gift', kicker: 'Gift', intro: 'Hello', cta: 'Open', path: '/account', tag: 'old-processing' } });
    await d1.prepare("UPDATE crm_outbox SET status='processing',attempts=1,first_attempt_at=?,attempted_at=? WHERE dedupe_key='old-processing'").bind(new Date(Date.now() - 25 * 3600000).toISOString(), new Date(Date.now() - 25 * 3600000).toISOString()).run();
    await queue.recoverCrmEmails();
    assert.equal(calls, 0);
    assert.equal((await d1.prepare("SELECT status FROM crm_outbox WHERE dedupe_key='old-processing'").first()).status, 'needs_review');
});
test('partner manager and booker permissions are different', async () => {
    assert.equal(await agency.agencyMemberRole({ id: 'agency-test', email: 'hotel@example.invalid' }, { email: 'hotel@example.invalid' }), 'manager');
    await crm.crmAction('partner', { agencyId: 'agency-test', rateNotes: '', email: 'booker@example.invalid', active: true, memberRole: 'booker' }, 'owner', 'owner');
    assert.equal(await agency.agencyMemberRole({ id: 'agency-test', email: 'hotel@example.invalid' }, { email: 'booker@example.invalid' }), 'booker');
});
test('legacy unfinished email failures outside the new-reminder window enter recovery', async () => {
    const unfinished = await vite.ssrLoadModule('/lib/unfinished-bookings.ts');
    const stamp = new Date().toISOString();
    await book('OLDFAIL', 'person1@example.invalid', 'payment_failed');
    await d1.prepare("UPDATE bookings SET created_at=? WHERE reference='OLDFAIL'").bind(new Date(Date.now() - 3 * 86400000).toISOString()).run();
    await db.insert(schema.customerBookingLinks).values({ bookingReference: 'OLDFAIL', customerId: 'm1', createdAt: stamp });
    await db.insert(schema.bookingNotifications).values({ id: 'legacy-failed', bookingReference: 'OLDFAIL', notificationType: 'member_unfinished', channel: 'email', recipient: 'person1@example.invalid', dedupeKey: 'member_unfinished:OLDFAIL', scheduledFor: stamp, status: 'failed', attemptCount: 1, lastAttemptAt: stamp, createdAt: stamp, updatedAt: stamp });
    await unfinished.sendUnfinishedBookingReminders();
    assert.ok(await d1.prepare("SELECT id FROM crm_outbox WHERE dedupe_key='member_unfinished:OLDFAIL'").first());
});
test('promotional unsubscribe link works without an account and cancels queued offers', async () => {
    const c = await create('Guest subscriber', 'subscriber@example.invalid');
    await crm.crmAction('consent', { id: c.id, optIn: true, source: 'Customer requested email offers in chat' }, 'owner', 'owner');
    const rule = await crm.crmAction('retention', { title: 'Guest offers', kind: 'inactive', days: 30, ownerId: 'owner', channel: 'email', message: 'Hello', enabled: true }, 'owner', 'owner');
    await queue.enqueueCrmEmail('unsubscribe-offer', 'subscriber@example.invalid', { kind: 'retention', data: { to: 'subscriber@example.invalid', title: 'Hello', kicker: 'Offer', intro: 'Welcome', cta: 'Book', path: '/', tag: 'unsubscribe-offer' } }, c.id, rule.id);
    const o = await d1.prepare("SELECT payload_json FROM crm_outbox WHERE dedupe_key='unsubscribe-offer'").first();
    const token = JSON.parse(o.payload_json).data.unsubscribePath.split('/').at(-1);
    const api = await vite.ssrLoadModule('/app/api/marketing/[token]/route.ts');
    const result = await api.POST(new Request('https://example.invalid/api/marketing/' + token, { method: 'POST', headers: { origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}' }), { params: Promise.resolve({ token }) });
    assert.equal(result.status, 200);
    assert.equal((await crm.contact(c.id)).marketing_opt_in, 0);
    assert.equal((await d1.prepare("SELECT status FROM crm_outbox WHERE dedupe_key='unsubscribe-offer'").first()).status, 'cancelled');
});
test('CRM dashboard aggregates guest chats and measured first staff response', async () => {
    const visitorAt = new Date(Date.now() - 5 * 60000).toISOString(), replyAt = new Date(Date.now() - 3 * 60000).toISOString();
    await d1.prepare('INSERT INTO website_conversations(id,token_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?)').bind('crm-response', 'response-hash', new Date(Date.now() + 86400000).toISOString(), visitorAt, replyAt).run();
    await d1.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,created_at) VALUES('response-visitor','crm-response','visitor','Hello',?)").bind(visitorAt).run();
    await d1.prepare("INSERT INTO website_chat_messages(id,conversation_id,sender,body,staff_id,created_at) VALUES('response-staff','crm-response','staff','Hello there','owner',?)").bind(replyAt).run();
    const dashboard = await crm.crmDashboard();
    assert.ok(Math.abs(dashboard.service.response_minutes - 2) < 0.01);
    assert.ok(dashboard.contacts.guests > 0);
    assert.ok(await d1.prepare("SELECT contact_id FROM crm_sources WHERE kind='chat' AND source_id='crm-response'").first());
});
test('task rescheduling preserves its identity and clears the old reminder', async () => {
    const c = await create('Reschedule guest'), input = { contactId: c.id, title: 'Discuss transfer', dueAt: now, ownerId: 'owner' }, t = await crm.crmAction('task', input, 'owner', 'owner');
    await d1.prepare('UPDATE crm_tasks SET reminded_at=? WHERE id=?').bind(now, t.id).run();
    const dueAt = new Date(Date.now() + 86400000).toISOString();
    const updated = await crm.crmAction('task', { ...input, id: t.id, dueAt }, 'owner', 'owner');
    assert.equal(updated.id, t.id);
    const task = await d1.prepare('SELECT due_at,reminded_at FROM crm_tasks WHERE id=?').bind(t.id).first();
    assert.equal(task.due_at, dueAt);
    assert.equal(task.reminded_at, null);
});
test('verified chat association joins the member CRM profile without merging guest emails', async () => {
    await d1.prepare("UPDATE website_conversations SET customer_id='m2' WHERE id='crm-response'").run();
    const p = await crm.profile('member:m2');
    assert.ok(p.chats.some(c => c.id === 'crm-response'));
    assert.ok(p.leads.some(l => l.id === 'chat:crm-response'));
});
test('unverified chat contact fields cannot overwrite a verified member CRM profile', async () => {
    await d1.prepare("UPDATE website_conversations SET customer_email='different@example.invalid',customer_name='Different person' WHERE id='crm-response'").run();
    assert.equal((await crm.contact('member:m2')).email, 'person2@example.invalid');
});
test('concurrent quote conversions cannot attach the enquiry to another booking', async () => {
    const c = await create('Conversion traveller'), l = await crm.crmAction('lead', { contactId: c.id, title: 'Conversion test', valueMinor: 200000 }, 'owner', 'owner');
    const q = await crm.crmAction('quote', { contactId: c.id, leadId: l.id, title: 'Conversion quote', pickup: 'Bangkok hotel', dropoff: 'Pattaya hotel', tripDate: future, tripTime: '09:00', vehicle: 'economy_sedan', amountMinor: 200000, expiresAt: new Date(Date.now() + 86400000).toISOString() }, 'owner', 'owner');
    await crm.crmAction('quote_share', { id: q.id }, 'owner', 'owner');
    await book('CONVERTA');
    await book('CONVERTB');
    const results = await Promise.allSettled([crm.crmAction('convert', { id: q.id, reference: 'CONVERTA' }, 'owner', 'owner'), crm.crmAction('convert', { id: q.id, reference: 'CONVERTB' }, 'owner', 'owner')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const quote = await d1.prepare('SELECT booking_reference FROM crm_quotes WHERE id=?').bind(q.id).first(), lead = await d1.prepare('SELECT booking_reference,stage FROM crm_leads WHERE id=?').bind(l.id).first();
    assert.equal(quote.booking_reference, lead.booking_reference);
    assert.equal(lead.stage, 'won');
    const other = quote.booking_reference === 'CONVERTA' ? 'CONVERTB' : 'CONVERTA';
    assert.notEqual((await d1.prepare("SELECT contact_id FROM crm_sources WHERE kind='booking' AND source_id=?").bind(other).first()).contact_id, c.id);
});

test('regression: linked booking leaves an empty searchable guest contact', async () => {
 await d1.prepare("INSERT INTO customers(id,email,name,created_at,updated_at) VALUES('review-member','review@example.invalid','Review member',?,?)").bind(now,now).run();
 await book('REVIEWLINK','review@example.invalid');
 await db.insert(schema.customerBookingLinks).values({bookingReference:'REVIEWLINK',customerId:'review-member',createdAt:now});
 const rows=(await crm.crmList('customers','review@example.invalid',1,'')).items;
 assert.equal(rows.length,1,'one verified customer should have one active profile');
});
test('regression: concurrent different member merges into one guest', async () => {
 await d1.batch(['a','b'].map(x=>d1.prepare('INSERT INTO customers(id,email,name,created_at,updated_at) VALUES(?,?,?,?,?)').bind('review-'+x,'review-'+x+'@example.invalid','Review '+x,now,now)));
 const target=await create('Review merge target');
 const outcomes=await Promise.allSettled(['a','b'].map(x=>crm.crmAction('merge',{id:'member:review-'+x,targetId:target.id},'owner','owner')));
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 const memberSources=(await d1.prepare("SELECT source_id FROM crm_sources WHERE kind='member' AND contact_id=?").bind(target.id).all()).results;
 assert.equal(memberSources.length,1,'distinct registered accounts must not share the merged profile');
});
test('regression: booking price updates refresh pipeline',async()=>{
 await book('REVIEWPRICE','price@example.invalid');
 await d1.prepare("UPDATE bookings SET total=3500,dropoff='Koh Chang' WHERE reference='REVIEWPRICE'").run();
 const lead=await d1.prepare("SELECT title,value_minor FROM crm_leads WHERE booking_reference='REVIEWPRICE'").first();
 assert.equal(lead.value_minor,350000);
});
test('regression: rebooking cancels existing retention task',async()=>{
 const automation=await vite.ssrLoadModule('/lib/crm-automation.ts');
 await book('REVIEWOLD','retention-review@example.invalid','completed');
 await d1.prepare("UPDATE bookings SET pickup_date=? WHERE reference='REVIEWOLD'").bind(new Date(Date.now()-60*86400000).toISOString().slice(0,10)).run();
 const rule=await crm.crmAction('retention',{title:'Review win-back',kind:'inactive',days:30,ownerId:'owner',channel:'task',message:'',enabled:true},'owner','owner');
 await d1.prepare("DELETE FROM crm_sync_state WHERE id='automation'").run();
 await automation.runCrmAutomation();
 await book('REVIEWNEW','retention-review@example.invalid','confirmed');
 await automation.runCrmAutomation(new Date(Date.now()+6*60000));
 const task=await d1.prepare('SELECT status,lead_id FROM crm_tasks WHERE dedupe_key=?').bind('retention:'+rule.id+':REVIEWOLD').first();
 assert.equal(task.status,'cancelled');
});

test('regression: one conflicting quote must not block the email queue',async()=>{
 const automation=await vite.ssrLoadModule('/lib/crm-automation.ts');
 const c=await create('Review conflicting quotes');
 const l=await crm.crmAction('lead',{contactId:c.id,title:'Two quote alternatives',valueMinor:200000},'owner','owner');
 for(const x of ['A','B']){
   const q=await crm.crmAction('quote',{contactId:c.id,leadId:l.id,title:'Alternative '+x,pickup:'Bangkok',dropoff:'Pattaya',tripDate:future,tripTime:'09:00',vehicle:'economy_sedan',amountMinor:200000,expiresAt:new Date(Date.now()+86400000).toISOString()},'owner','owner');
   const share=await crm.crmAction('quote_share',{id:q.id},'owner','owner');
   const accepted=await crm.acceptQuote(share.url.split('/').at(-1));
   await book('REVIEWQUOTE'+x,'quotes@example.invalid');
   await d1.prepare('UPDATE booking_forms SET booking_reference=? WHERE token=?').bind('REVIEWQUOTE'+x,accepted.path.split('/').at(-1)).run();
 }
 await queue.enqueueCrmEmail('review-independent-email','independent@example.invalid',{kind:'reward',data:{to:'independent@example.invalid',title:'Gift',kicker:'Gift',intro:'Hello',cta:'Open',path:'/account',tag:'review-independent-email'}});
 await d1.prepare("DELETE FROM crm_sync_state WHERE id='automation'").run();
 let failure; try{await automation.runCrmAutomation();}catch(e){failure=e.message;}
 assert.equal(failure,undefined);
 const state=await d1.prepare("SELECT status FROM crm_outbox WHERE dedupe_key='review-independent-email'").first();
 assert.equal(state.status,'sent','one invalid quote should not block unrelated email delivery');
});
test('regression: export matches literal CRM search',async()=>{
 const listed=await crm.crmList('customers','%',1,'');
 const csv=await new Response(await crm.exportContacts('%')).text();
 assert.equal(csv.trim().split('\r\n').length-1,listed.total);
});

test('CSV exports fetch bounded pages only on demand and cancel without aggregate queries',async()=>{
 const queries=[];
 globalThis.__crmEnv.DB={prepare(sql){queries.push(sql);return d1.prepare(sql);},batch:statements=>d1.batch(statements)};
 try{
  for(const make of [()=>members.memberCsv('', 'all', 'newest'),()=>crm.exportContacts('')]){
   queries.length=0;const stream=await make(),reader=stream.getReader();
   assert.equal(queries.length,0);await reader.read();assert.equal(queries.length,0,'header needs no database query');
   const chunk=await reader.read();assert.equal(queries.length,1);assert.ok(queries[0].includes('LIMIT 100'));assert.ok(!queries[0].includes('sum(c.created_at'));
   assert.ok(new TextDecoder().decode(chunk.value).trim().split('\r\n').length<=100);
   await reader.cancel();assert.equal(queries.length,1);
  }
 }finally{globalThis.__crmEnv.DB=d1;}
});
test('CSV cursors preserve all members across every supported sort and CRM filters',async()=>{
 const count=(await members.memberPage('',1)).total;
 for(const sort of ['newest','oldest','name','trips']){
  const csv=await new Response(await members.memberCsv('','all',sort)).text();
  const emails=csv.trim().split('\r\n').slice(1).map(row=>row.split(',')[1]);
  assert.equal(emails.length,count);assert.equal(new Set(emails).size,count);
 }
 for(const filter of ['members','guests']){
  const expected=(await crm.crmList('customers','review@example.invalid',1,filter)).total;
  const csv=await new Response(await crm.exportContacts('review@example.invalid',filter)).text();
  assert.equal(csv.trim().split('\r\n').length-1,expected);
 }
});
