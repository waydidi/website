import { csvStream } from "./csv-stream";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { contactInput, taskInput, quoteInput, STAGES, normalizePhone, csvCell } from "./crm-rules";
import { secureToken, sha256 } from "./security";
import { VEHICLES } from "./vehicles";
import { formToken } from "./booking-form";
import { SITE_URL } from "./site";
import type { SecurityDatabase } from "./worker-db";
export const crmDb = () => env.DB as unknown as SecurityDatabase;
export type Contact = {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    member_id: string | null;
    owner_id: string | null;
    notes: string;
    language: string;
    marketing_opt_in: number;
    merged_into: string | null;
    created_at: string;
    updated_at: string;
};
export type Lead = {
    id: string;
    contact_id: string;
    title: string;
    stage: string;
    value_minor: number;
    owner_id: string | null;
    source: string;
    booking_reference: string | null;
    loss_reason: string | null;
    version: number;
};
export type Quote = {
    id: string;
    contact_id: string;
    lead_id: string | null;
    version: number;
    status: string;
    title: string;
    pickup: string;
    dropoff: string;
    trip_date: string;
    trip_time: string;
    vehicle: string;
    amount_minor: number;
    expires_at: string;
    form_token: string | null;
    booking_reference: string | null;
    accepted_at: string | null;
};
export class CrmError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export const nowIso = () => new Date().toISOString();
const rows = async <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => (await crmDb().prepare(sql).bind(...args).all<T>()).results;
const first = async <T = Record<string, unknown>>(sql: string, ...args: unknown[]) => crmDb().prepare(sql).bind(...args).first<T>();
export async function contact(id: string) {
    const c = await first<Contact>("SELECT * FROM crm_contacts WHERE id=? AND merged_into IS NULL", id);
    if (!c)
        throw new CrmError("Customer not found.", 404);
    return c;
}
const eventStatement = (contactId: string | null, entity: string, kind: string, body: string, staff: string | null) => crmDb().prepare("INSERT INTO crm_events(id,contact_id,entity_id,kind,body,staff_id,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), contactId, entity, kind, body, staff, nowIso());
async function staffExists(id: string) {
    if (!await first("SELECT id FROM staff_accounts WHERE id=? AND active=1 AND role IN ('owner','operations','support')", id))
        throw new CrmError("Choose an active CRM staff member.");
}
const contactSearch = (search: string, filter: string) => ({
    where: "c.merged_into IS NULL AND (c.name LIKE ? ESCAPE '^' OR coalesce(c.email,'') LIKE ? ESCAPE '^' OR coalesce(c.phone,'') LIKE ? ESCAPE '^')" + (filter === 'members' ? ' AND c.member_id IS NOT NULL' : filter === 'guests' ? ' AND c.member_id IS NULL' : ''),
    args: Array(3).fill(`%${search.replace(/[%_^]/g, "^$&")}%`) as string[],
});
export async function crmList(view: string, search: string, page: number, filter: string) {
    const offset = (page - 1) * 25, q = `%${search.replace(/[%_^]/g, "^$&")}%`;
    const contactSelect = `SELECT c.*,(SELECT count(*) FROM crm_sources s JOIN bookings b ON s.kind='booking' AND b.reference=s.source_id WHERE s.contact_id=c.id AND b.status IN ('confirmed','completed')) trips,(SELECT coalesce(sum(b.total),0) FROM crm_sources s JOIN bookings b ON s.kind='booking' AND b.reference=s.source_id WHERE s.contact_id=c.id AND b.status IN ('confirmed','completed')) spend FROM crm_contacts c`;
    let from = "crm_contacts c", where = "c.merged_into IS NULL AND (c.name LIKE ? ESCAPE '^' OR coalesce(c.email,'') LIKE ? ESCAPE '^' OR coalesce(c.phone,'') LIKE ? ESCAPE '^')", args: unknown[] = [q, q, q], select = contactSelect;
    if (view === 'pipeline') {
        from = 'crm_leads l JOIN crm_contacts c ON c.id=l.contact_id';
        where = "c.merged_into IS NULL AND (l.title LIKE ? ESCAPE '^' OR c.name LIKE ? ESCAPE '^')";
        args = [q, q];
        if (STAGES.includes(filter as typeof STAGES[number])) {
            where += ' AND l.stage=?';
            args.push(filter);
        }
        select = 'SELECT l.*,c.name,c.email FROM ' + from;
    }
    if (view === 'tasks') {
        from = 'crm_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id LEFT JOIN staff_accounts a ON a.id=t.owner_id';
        where = "t.title LIKE ? ESCAPE '^'";
        args = [q];
        if (filter === 'overdue') {
            where += " AND t.status='open' AND t.due_at<?";
            args.push(nowIso());
        }
        else if (['open', 'completed', 'cancelled'].includes(filter)) {
            where += ' AND t.status=?';
            args.push(filter);
        }
        select = 'SELECT t.*,c.name,a.display_name owner_name FROM ' + from;
    }
    if (view === 'quotes') {
        from = 'crm_quotes t JOIN crm_contacts c ON c.id=t.contact_id';
        where = "(t.title LIKE ? ESCAPE '^' OR c.name LIKE ? ESCAPE '^')";
        args = [q, q];
        select = 'SELECT t.id,t.contact_id,t.lead_id,t.version,t.status,t.title,t.pickup,t.dropoff,t.trip_date,t.trip_time,t.vehicle,t.amount_minor,t.expires_at,t.form_token,t.booking_reference,t.accepted_at,c.name FROM ' + from;
    }
    if (view === 'partners') {
        from = 'agency_applications t LEFT JOIN crm_partner_accounts p ON p.agency_id=t.id';
        where = "(t.agency_name LIKE ? ESCAPE '^' OR t.email LIKE ? ESCAPE '^')";
        args = [q, q];
        select = `SELECT t.*,p.owner_id,p.rate_notes,(SELECT count(*) FROM agency_members m WHERE m.agency_id=t.id AND m.active=1) staff_count FROM ${from}`;
    }
    if (view === 'emails') {
        from = 'crm_outbox t';
        where = "t.email LIKE ? ESCAPE '^'";
        args = [q];
        if (['pending', 'failed', 'needs_review', 'sent', 'cancelled', 'processing'].includes(filter)) {
            where += ' AND t.status=?';
            args.push(filter);
        }
        select = 'SELECT t.id,t.contact_id,t.email,t.status,t.attempts,t.attempted_at,t.next_attempt_at,t.created_at FROM ' + from;
    }
    if (view === 'retention') {
        from = 'crm_retention_rules t';
        where = "t.title LIKE ? ESCAPE '^'";
        args = [q];
        select = 'SELECT t.* FROM ' + from;
    }
    if (view === 'customers') ({ where, args } = contactSearch(search, filter));
    const [items, total, team] = await Promise.all([rows(select + ' WHERE ' + where + ' ORDER BY ' + (view === 'tasks' ? 't.due_at ASC' : view === 'pipeline' ? 'l.updated_at DESC' : view === 'partners' ? 't.created_at DESC' : view === 'customers' ? 'c.updated_at DESC' : 't.created_at DESC') + ' LIMIT 25 OFFSET ?', ...args, offset), first<{
            n: number;
        }>('SELECT count(*) n FROM ' + from + ' WHERE ' + where, ...args), rows("SELECT id,display_name name FROM staff_accounts WHERE active=1 AND role IN ('owner','operations','support') ORDER BY display_name")]);
    return { items, total: total?.n ?? 0, page, team };
}
export async function crmDashboard() {
    const [contacts, stages, tasks, quotes, sources, retention, service] = await Promise.all([
        first("SELECT count(*) total,sum(member_id IS NOT NULL) members,sum(member_id IS NULL) guests FROM crm_contacts WHERE merged_into IS NULL"),
        rows("SELECT stage,count(*) count,sum(value_minor) value_minor FROM crm_leads GROUP BY stage"),
        first("SELECT count(*) open,sum(due_at<?) overdue FROM crm_tasks WHERE status='open'", nowIso()),
        rows("SELECT status,count(*) count FROM crm_quotes GROUP BY status"),
        rows("SELECT source,count(*) leads,sum(stage='won') won,sum(CASE WHEN stage='won' THEN value_minor ELSE 0 END) revenue_minor FROM crm_leads GROUP BY source"),
        rows("SELECT status,count(*) count FROM crm_outbox GROUP BY status"),
        first("SELECT (SELECT count(*) FROM crm_contacts c WHERE c.merged_into IS NULL AND (SELECT count(*) FROM crm_sources s JOIN bookings b ON s.kind='booking' AND b.reference=s.source_id WHERE s.contact_id=c.id AND b.status IN ('confirmed','completed'))>=2) repeat_customers,avg((julianday((SELECT min(m.created_at) FROM website_chat_messages m WHERE m.conversation_id=w.id AND m.sender='staff' AND m.is_bot=0 AND m.created_at>=(SELECT min(v.created_at) FROM website_chat_messages v WHERE v.conversation_id=w.id AND v.sender='visitor')))-julianday((SELECT min(v.created_at) FROM website_chat_messages v WHERE v.conversation_id=w.id AND v.sender='visitor')))*1440) response_minutes FROM website_conversations w")
    ]);
    return { contacts, stages, tasks, quotes, sources, retention, service };
}
export async function profile(id: string) {
    const c = await contact(id);
    const [sources, bookings, chats, leads, tasks, quotes, events, matches] = await Promise.all([
        rows("SELECT * FROM crm_sources WHERE contact_id=?", id),
        rows("SELECT b.reference,b.pickup,b.dropoff,b.pickup_date,b.pickup_time,b.status,b.payment_status,b.refund_status,b.refund_amount,b.total FROM bookings b JOIN crm_sources s ON s.kind='booking' AND s.source_id=b.reference WHERE s.contact_id=? ORDER BY b.pickup_date DESC LIMIT 100", id),
        rows("SELECT w.id,w.public_id,w.channel,w.status,w.last_message_at FROM website_conversations w JOIN crm_sources s ON s.kind='chat' AND s.source_id=w.id WHERE s.contact_id=? ORDER BY w.created_at DESC LIMIT 100", id),
        rows("SELECT * FROM crm_leads WHERE contact_id=? ORDER BY updated_at DESC LIMIT 100", id), rows("SELECT * FROM crm_tasks WHERE contact_id=? ORDER BY due_at DESC LIMIT 100", id),
        rows("SELECT id,title,status,amount_minor,version,booking_reference FROM crm_quotes WHERE contact_id=? ORDER BY created_at DESC LIMIT 100", id),
        rows("SELECT e.*,a.display_name staff_name FROM crm_events e LEFT JOIN staff_accounts a ON a.id=e.staff_id WHERE e.contact_id=? ORDER BY e.created_at DESC LIMIT 100", id),
        rows<Contact>("SELECT * FROM crm_contacts WHERE id<>? AND merged_into IS NULL AND ((email IS NOT NULL AND email<>'' AND lower(email)=?) OR (phone IS NOT NULL AND phone<>'' AND replace(replace(replace(replace(replace(phone,' ',''),'-',''),'+',''),'(',''),')','')=?)) LIMIT 30", id, (c.email ?? '').toLowerCase(), normalizePhone(c.phone))
    ]);
    return { contact: c, sources, bookings, chats, leads, tasks, quotes, events, matches };
}
export async function crmAction(action: string, input: Record<string, unknown>, staffId: string, role: string) {
    const db = crmDb(), stamp = nowIso(), id = typeof input.id === 'string' ? input.id : '';
    if (action === 'contact') {
        const p = contactInput.parse(input);
        if (p.ownerId)
            await staffExists(p.ownerId);
        const cid = id || crypto.randomUUID();
        if (id)
            await contact(id);
        await db.batch([id ? db.prepare("UPDATE crm_contacts SET name=?,email=?,marketing_opt_in=CASE WHEN coalesce(email,'')=? THEN marketing_opt_in ELSE 0 END,phone=?,notes=?,owner_id=?,language=?,updated_at=? WHERE id=? AND merged_into IS NULL").bind(p.name, p.email || null, p.email || '', p.phone || null, p.notes, p.ownerId ?? null, p.language, stamp, cid) : db.prepare('INSERT INTO crm_contacts(id,name,email,phone,notes,owner_id,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(cid, p.name, p.email || null, p.phone || null, p.notes, p.ownerId ?? null, p.language, stamp, stamp), eventStatement(cid, cid, 'profile', 'Customer profile saved', staffId)]);
        return { id: cid };
    }
    if (action === 'consent') {
        const c = await contact(id);
        const p = z.object({ optIn: z.boolean(), source: z.string().trim().min(5).max(200) }).parse(input);
        if (c.member_id)
            throw new CrmError('Member consent is managed in their account.');
        await db.batch([db.prepare('UPDATE crm_contacts SET marketing_opt_in=?,consent_at=?,consent_source=?,updated_at=? WHERE id=?').bind(Number(p.optIn), stamp, p.source, stamp, id), eventStatement(id, id, 'consent', `${p.optIn ? 'Opted in' : 'Opted out'}: ${p.source}`, staffId)]);
        return { id };
    }
    if (action === 'merge') {
        if (role !== 'owner')
            throw new CrmError('Only the owner can merge customer records.', 403);
        const target = await contact(z.string().parse(input.targetId)), source = await contact(id);
        if (target.id === source.id)
            throw new CrmError('Choose two different records.');
        if (source.member_id && target.member_id && source.member_id !== target.member_id)
            throw new CrmError('Two registered accounts cannot be merged.');
        // Database guards validate current source/target identities inside the D1 batch.
        await db.batch([db.prepare("UPDATE crm_contacts SET merged_into=?,marketing_opt_in=0,updated_at=? WHERE id=?").bind(target.id, stamp, id), ...['crm_sources', 'crm_leads', 'crm_tasks', 'crm_quotes', 'crm_events', 'crm_outbox', 'crm_marketing_tokens'].map(t => db.prepare(`UPDATE ${t} SET contact_id=? WHERE contact_id=?`).bind(target.id, id)), db.prepare("UPDATE crm_contacts SET member_id=coalesce(member_id,?),marketing_opt_in=0,updated_at=? WHERE id=?").bind(source.member_id, stamp, target.id), eventStatement(target.id, id, 'merge', `Merged ${source.name} (${id}); sign-in and booking permissions unchanged`, staffId)]);
        return { id: target.id };
    }
    if (action === 'lead') {
        const p = z.object({ contactId: z.string(), title: z.string().trim().min(1).max(200), valueMinor: z.number().int().min(0).max(100000000), ownerId: z.string().nullable().optional() }).parse(input);
        await contact(p.contactId);
        if (p.ownerId)
            await staffExists(p.ownerId);
        const lid = crypto.randomUUID();
        await db.batch([db.prepare('INSERT INTO crm_leads(id,contact_id,title,value_minor,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(lid, p.contactId, p.title, p.valueMinor, p.ownerId ?? staffId, stamp, stamp), eventStatement(p.contactId, lid, 'lead', 'Enquiry created', staffId)]);
        return { id: lid };
    }
    if (action === 'stage') {
        const p = z.object({ stage: z.enum(STAGES), version: z.number().int(), lossReason: z.string().max(500).optional() }).parse(input);
        const lead = await first<Lead>('SELECT * FROM crm_leads WHERE id=?', id);
        if (!lead)
            throw new CrmError('Enquiry not found.', 404);
        if (lead.booking_reference)
            throw new CrmError('Booking-linked stages are updated by booking status.');
        if (p.stage === 'lost' && !p.lossReason?.trim())
            throw new CrmError('Add a lost reason.');
        if (p.stage === 'won')
            throw new CrmError('Link a confirmed booking to mark this enquiry booked.');
        const result = await db.prepare('UPDATE crm_leads SET stage=?,loss_reason=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(p.stage, p.lossReason ?? null, stamp, id, p.version).run();
        if (!result.meta.changes)
            throw new CrmError('This enquiry changed. Refresh and try again.', 409);
        await eventStatement(lead.contact_id, id, 'stage', `${lead.stage} → ${p.stage}${p.lossReason ? ': ' + p.lossReason : ''}`, staffId).run();
        return { id };
    }
    if (action === 'task') {
        const p = taskInput.parse(input);
        await contact(p.contactId);
        await staffExists(p.ownerId);
        if (p.leadId && !await first('SELECT id FROM crm_leads WHERE id=? AND contact_id=?', p.leadId, p.contactId))
            throw new CrmError('Enquiry does not belong to this customer.');
        const old = id ? await first<{
            contact_id: string;
        }>('SELECT contact_id FROM crm_tasks WHERE id=?', id) : null;
        if (id && (!old || old.contact_id !== p.contactId))
            throw new CrmError('This task does not belong to the selected customer.');
        const tid = id || crypto.randomUUID();
        await db.batch([old ? db.prepare("UPDATE crm_tasks SET lead_id=?,title=?,due_at=?,owner_id=?,status='open',completed_at=NULL,reminded_at=NULL,updated_at=? WHERE id=?").bind(p.leadId ?? null, p.title, new Date(p.dueAt).toISOString(), p.ownerId, stamp, tid) : db.prepare('INSERT INTO crm_tasks(id,contact_id,lead_id,conversation_id,title,due_at,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(tid, p.contactId, p.leadId ?? null, p.conversationId ?? null, p.title, new Date(p.dueAt).toISOString(), p.ownerId, stamp, stamp), eventStatement(p.contactId, tid, 'task', `Scheduled: ${p.title}`, staffId)]);
        return { id: tid };
    }
    if (action === 'task_status') {
        const status = z.enum(['completed', 'cancelled', 'open']).parse(input.status);
        const t = await first<{
            contact_id: string | null;
            title: string;
        }>('SELECT contact_id,title FROM crm_tasks WHERE id=?', id);
        if (!t)
            throw new CrmError('Task not found.', 404);
        await db.batch([db.prepare('UPDATE crm_tasks SET status=?,completed_at=?,reminded_at=NULL,updated_at=? WHERE id=?').bind(status, status === 'completed' ? stamp : null, stamp, id), eventStatement(t.contact_id, id, 'task', `${t.title}: ${status}`, staffId)]);
        return { id };
    }
    if (action === 'quote') {
        const p = quoteInput.parse(input);
        await contact(p.contactId);
        if (p.amountMinor % 100 !== 0)
            throw new CrmError('Quotes use whole-baht pricing.');
        if (!(p.vehicle in VEHICLES))
            throw new CrmError('Choose a valid vehicle.');
        if (!Number.isFinite(Date.parse(`${p.tripDate}T00:00:00Z`)) || new Date(`${p.tripDate}T00:00:00Z`).toISOString().slice(0, 10) !== p.tripDate)
            throw new CrmError("Choose a valid trip date.");
        if (Date.parse(p.expiresAt) <= Date.now() || Date.parse(`${p.tripDate}T${p.tripTime}:00+07:00`) <= Date.now())
            throw new CrmError('Choose future trip and expiry dates.');
        if (p.leadId && !await first("SELECT id FROM crm_leads WHERE id=? AND contact_id=? AND stage NOT IN ('won','lost','cancelled')", p.leadId, p.contactId))
            throw new CrmError('Choose an open enquiry belonging to this customer.');
        const old = id ? await first<Quote>('SELECT * FROM crm_quotes WHERE id=? AND contact_id=?', id, p.contactId) : null;
        if (id && !old)
            throw new CrmError('Quote not found.', 404);
        if (old && !['draft', 'sent'].includes(old.status))
            throw new CrmError('Accepted quotes cannot be edited; create another quote.');
        const qid = id || crypto.randomUUID(), version = (old?.version ?? 0) + 1;
        await db.batch([old ? db.prepare("UPDATE crm_quotes SET lead_id=?,title=?,pickup=?,dropoff=?,trip_date=?,trip_time=?,vehicle=?,amount_minor=?,expires_at=?,version=?,status='draft',token_hash=NULL,form_token=NULL,updated_at=? WHERE id=? AND version=? AND status IN ('draft','sent')").bind(p.leadId ?? null, p.title, p.pickup, p.dropoff, p.tripDate, p.tripTime, p.vehicle, p.amountMinor, new Date(p.expiresAt).toISOString(), version, stamp, qid, old.version) : db.prepare('INSERT INTO crm_quotes(id,contact_id,lead_id,title,pickup,dropoff,trip_date,trip_time,vehicle,amount_minor,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(qid, p.contactId, p.leadId ?? null, p.title, p.pickup, p.dropoff, p.tripDate, p.tripTime, p.vehicle, p.amountMinor, new Date(p.expiresAt).toISOString(), stamp, stamp), db.prepare('INSERT INTO crm_quote_versions(quote_id,version,snapshot_json,staff_id,created_at) VALUES(?,?,?,?,?)').bind(qid, version, JSON.stringify(p), staffId, stamp), eventStatement(p.contactId, qid, 'quote', `Quote revision ${version} saved`, staffId)]);
        return { id: qid };
    }
    if (action === 'quote_share') {
        const q = await first<Quote>('SELECT * FROM crm_quotes WHERE id=?', id);
        if (!q || !['draft', 'sent'].includes(q.status) || q.expires_at <= stamp)
            throw new CrmError('Quote is unavailable or expired.');
        const token = secureToken(), tokenHash = await sha256(token);
        const result = await db.batch([
            db.prepare("UPDATE crm_quotes SET status='sent',token_hash=?,updated_at=? WHERE id=? AND version=? AND status IN ('draft','sent')").bind(tokenHash, stamp, id, q.version),
            db.prepare("INSERT INTO crm_events(id,contact_id,entity_id,kind,body,staff_id,created_at) SELECT ?,contact_id,id,'quote','Quote link issued',?,? FROM crm_quotes WHERE id=? AND token_hash=?").bind(crypto.randomUUID(), staffId, stamp, id, tokenHash),
            ...(q.lead_id ? [db.prepare("UPDATE crm_leads SET stage='quoted',version=version+1,updated_at=? WHERE id=? AND stage IN ('new','quoted') AND EXISTS(SELECT 1 FROM crm_quotes WHERE id=? AND token_hash=?)").bind(stamp, q.lead_id, id, tokenHash)] : [])
        ]);
        if (!result[0].meta.changes)
            throw new CrmError('Quote changed. Refresh and share again.', 409);
        return { id, url: `${SITE_URL}/quote/${token}` };
    }
    if (action === 'convert') {
        const ref = z.string().trim().toUpperCase().max(20).parse(input.reference), q = await first<Quote>('SELECT * FROM crm_quotes WHERE id=?', id), b = await first<{
            status: string;
            total: number;
        }>('SELECT status,total FROM bookings WHERE reference=?', ref);
        if (!q || !['sent', 'accepted'].includes(q.status) || !b || !['confirmed', 'completed'].includes(b.status))
            throw new CrmError('Choose a confirmed booking and valid quote.');
        // The database trigger reconciles all CRM relationships in this same transaction.
        const result = await db.batch([db.prepare("UPDATE crm_quotes SET status='converted',booking_reference=?,token_hash=NULL,updated_at=? WHERE id=? AND status IN ('sent','accepted')").bind(ref, stamp, id), eventStatement(q.contact_id, id, 'quote', `Staff requested booking link ${ref}`, staffId)]);
        if (!result[0].meta.changes)
            throw new CrmError('This quote changed. Refresh and try again.', 409);
        return { id };
    }
    if (action === 'partner') {
        if (!['owner', 'operations'].includes(role))
            throw new CrmError('Partner management access required.', 403);
        const p = z.object({ agencyId: z.string(), ownerId: z.string().nullable().optional(), rateNotes: z.string().max(4000), email: z.string().trim().toLowerCase().email().or(z.literal('')).optional(), memberRole: z.enum(['manager', 'booker']).optional(), active: z.boolean().optional() }).parse(input);
        if (!await first("SELECT id FROM agency_applications WHERE id=? AND status='approved'", p.agencyId))
            throw new CrmError('Choose an approved agency.');
        if (p.ownerId)
            await staffExists(p.ownerId);
        if (p.email && await first("SELECT id FROM agency_applications WHERE lower(email)=? AND id<>? AND status='approved'", p.email, p.agencyId))
            throw new CrmError('This email is the primary contact for another agency.');
        await db.batch([db.prepare('INSERT INTO crm_partner_accounts(agency_id,owner_id,rate_notes,updated_at) VALUES(?,?,?,?) ON CONFLICT(agency_id) DO UPDATE SET owner_id=excluded.owner_id,rate_notes=excluded.rate_notes,updated_at=excluded.updated_at').bind(p.agencyId, p.ownerId ?? null, p.rateNotes, stamp), ...(p.email ? [db.prepare('INSERT INTO agency_members(agency_id,email,role,active,created_at) VALUES(?,?,?,?,?) ON CONFLICT(agency_id,email) DO UPDATE SET role=excluded.role,active=excluded.active').bind(p.agencyId, p.email, p.memberRole ?? 'booker', Number(p.active ?? true), stamp)] : []), eventStatement(null, p.agencyId, 'partner', 'Partner account updated', staffId)]);
        return { id: p.agencyId };
    }
    if (action === 'email_review') {
        if (role !== 'owner')
            throw new CrmError('Only the owner can review email delivery.', 403);
        const p = z.object({ resolution: z.enum(['cancel', 'verified_sent']), reason: z.string().trim().min(5).max(500) }).parse(input);
        const job = await first<{
            contact_id: string | null;
            status: string;
        }>('SELECT contact_id,status FROM crm_outbox WHERE id=?', id);
        if (!job || !['failed', 'needs_review', 'pending'].includes(job.status))
            throw new CrmError('Choose a failed or pending email.');
        await db.batch([db.prepare("UPDATE crm_outbox SET status=?,sent_at=? WHERE id=? AND status IN ('failed','needs_review','pending')").bind(p.resolution === 'verified_sent' ? 'sent' : 'cancelled', p.resolution === 'verified_sent' ? stamp : null, id), eventStatement(job.contact_id, id, 'email', `${p.resolution}: ${p.reason}`, staffId)]);
        return { id };
    }
    if (action === 'retention') {
        if (role !== 'owner')
            throw new CrmError('Only the owner can configure retention automation.', 403);
        const p = z.object({ title: z.string().trim().min(1).max(150), kind: z.enum(['inactive', 'return_transfer']), days: z.number().int().min(1).max(365), ownerId: z.string(), channel: z.enum(['task', 'email']), message: z.string().max(1000), enabled: z.boolean() }).parse(input);
        await staffExists(p.ownerId);
        if (p.channel === 'email' && !p.message.trim())
            throw new CrmError('Write the email message.');
        const rid = id || crypto.randomUUID();
        await db.prepare('INSERT INTO crm_retention_rules(id,title,kind,days,enabled,owner_id,message,channel,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,days=excluded.days,enabled=excluded.enabled,owner_id=excluded.owner_id,message=excluded.message,channel=excluded.channel,updated_at=excluded.updated_at').bind(rid, p.title, p.kind, p.days, Number(p.enabled), p.ownerId, p.message, p.channel, stamp, stamp).run();
        await eventStatement(null, rid, 'retention', 'Retention rule saved', staffId).run();
        return { id: rid };
    }
    throw new CrmError('Unknown CRM action.');
}
export async function exportContacts(search: string, filter = '') {
    const { where, args } = contactSearch(search, filter);
    let cursor: string | null = null;
    return csvStream(['Name', 'Email', 'Phone', 'Member', 'Marketing opt-in'].map(csvCell).join(',') + '\r\n', async () => {
        const batch = await rows<Contact>(`SELECT c.id,c.name,c.email,c.phone,c.member_id,c.marketing_opt_in FROM crm_contacts c WHERE ${where}${cursor === null ? '' : ' AND c.id>?'} ORDER BY c.id LIMIT 100`, ...args, ...(cursor === null ? [] : [cursor]));
        cursor = batch.at(-1)?.id ?? cursor;
        return { text: batch.map(c => [c.name,c.email,c.phone,c.member_id ? 'Yes' : 'No',c.marketing_opt_in ? 'Yes' : 'No'].map(csvCell).join(',') + '\r\n').join(''), done: batch.length < 100 };
    });
}
export async function publicQuote(token: string) {
    if (!/^[a-f0-9]{48,128}$/.test(token))
        return null;
    return first<Quote>("SELECT id,contact_id,lead_id,version,status,title,pickup,dropoff,trip_date,trip_time,vehicle,amount_minor,expires_at,form_token,booking_reference,accepted_at FROM crm_quotes WHERE token_hash=? AND expires_at>? AND julianday(trip_date || 'T' || trip_time || ':00+07:00')>julianday('now') AND status IN ('sent','accepted')", await sha256(token), nowIso());
}
export async function acceptQuote(token: string) {
    const q = await publicQuote(token);
    if (!q)
        throw new CrmError('This quote has expired or been replaced.', 404);
    if (q.status === 'accepted')
        return { path: `/f/${q.form_token}` };
    const tokenHash = await sha256(token), ft = formToken(), stamp = nowIso();
    const prefill = JSON.stringify({ pickup: q.pickup, dropoff: q.dropoff, date: q.trip_date, time: q.trip_time, vehicle: q.vehicle, price: q.amount_minor / 100 });
    await crmDb().batch([crmDb().prepare("UPDATE crm_quotes SET status='accepted',accepted_at=?,form_token=?,updated_at=? WHERE id=? AND version=? AND token_hash=? AND status='sent' AND expires_at>?").bind(stamp, ft, stamp, q.id, q.version, tokenHash, stamp), crmDb().prepare("INSERT INTO booking_forms(token,service_type,note,status,prefill,created_at,expires_at) SELECT ?, 'transfer', ?, 'waiting', ?, ?, ? FROM crm_quotes WHERE id=? AND form_token=? AND status='accepted'").bind(ft, q.title, prefill, stamp, q.expires_at, q.id, ft), crmDb().prepare("INSERT INTO crm_events(id,contact_id,entity_id,kind,body,created_at) SELECT ?,contact_id,id,'quote','Customer accepted quote',? FROM crm_quotes WHERE id=? AND form_token=?").bind(crypto.randomUUID(), stamp, q.id, ft)]);
    const current = await publicQuote(token);
    if (!current?.form_token)
        throw new CrmError('Quote changed. Refresh and try again.', 409);
    return { path: `/f/${current.form_token}` };
}
