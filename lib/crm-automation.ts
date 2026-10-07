import { crmDb } from "./crm";
import { enqueueCrmEmail, recoverCrmEmails } from "./crm-email-queue";
export async function runCrmAutomation(at = new Date()) {
    const db = crmDb(), stamp = at.toISOString();
    // Atomic five-minute scheduler lease avoids concurrent scans.
    const lease = await db.prepare("INSERT INTO crm_sync_state(id,last_run_at) VALUES('automation',?) ON CONFLICT(id) DO UPDATE SET last_run_at=excluded.last_run_at WHERE crm_sync_state.last_run_at<?").bind(stamp, new Date(at.getTime() - 5 * 60000).toISOString()).run();
    if (!lease.meta.changes)
        return 0;
    const due = (await db.prepare("SELECT t.id,t.title,a.display_name FROM crm_tasks t JOIN staff_accounts a ON a.id=t.owner_id WHERE t.status='open' AND t.due_at<=? AND t.reminded_at IS NULL ORDER BY t.due_at LIMIT 30").bind(stamp).all<{
        id: string;
        title: string;
        display_name: string;
    }>()).results;
    const tg = await import("./telegram/client");
    for (const task of due) {
        const claim = await db.prepare("UPDATE crm_tasks SET reminded_at=? WHERE id=? AND status='open' AND reminded_at IS NULL").bind(stamp, task.id).run();
        if (!claim.meta.changes)
            continue;
        if (tg.telegramConfigured())
            try {
                const escape = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
                await tg.sendCard(`<b>CRM follow-up due</b>\n${escape(task.title)}\nAssigned: ${escape(task.display_name)}`);
            }
            catch {
                await db.prepare('UPDATE crm_tasks SET reminded_at=NULL WHERE id=? AND reminded_at=?').bind(task.id, stamp).run();
            }
    }
    await db.prepare("UPDATE crm_quotes SET status='expired',token_hash=NULL,updated_at=? WHERE expires_at<=? AND status IN ('draft','sent')").bind(stamp, stamp).run();
    // Accepted form bookings are linked by the existing form workflow; reconcile their CRM enquiry.
    const converted = (await db.prepare("SELECT q.id,q.contact_id,q.lead_id,f.booking_reference,b.total FROM crm_quotes q JOIN booking_forms f ON f.token=q.form_token JOIN bookings b ON b.reference=f.booking_reference WHERE q.status='accepted' AND b.status IN ('confirmed','completed') LIMIT 50").all<{
        id: string;
        contact_id: string;
        lead_id: string | null;
        booking_reference: string;
        total: number;
    }>()).results;
    for (const q of converted)
        await db.prepare("UPDATE crm_quotes SET status='converted',booking_reference=?,token_hash=NULL,updated_at=? WHERE id=? AND status='accepted'").bind(q.booking_reference, stamp, q.id).run();
    const rules = (await db.prepare("SELECT * FROM crm_retention_rules WHERE enabled=1 LIMIT 30").all<{
        id: string;
        title: string;
        kind: string;
        days: number;
        owner_id: string;
        message: string;
        channel: string;
    }>()).results;
    for (const rule of rules) {
        const date = new Date(at.getTime() - rule.days * 86400000).toISOString().slice(0, 10);
        const eligible = rule.kind === 'inactive' ? "b.status='completed' AND b.pickup_date<=? AND NOT EXISTS(SELECT 1 FROM bookings n JOIN crm_sources ns ON ns.kind='booking' AND ns.source_id=n.reference WHERE (ns.contact_id=c.id OR (c.email IS NOT NULL AND c.email<>'' AND lower(n.customer_email)=lower(c.email))) AND n.status IN ('confirmed','completed') AND n.pickup_date>b.pickup_date)" : "b.status='confirmed' AND b.pickup_date>=? AND b.pickup_date<=? AND b.return_date IS NULL AND NOT EXISTS(SELECT 1 FROM bookings n JOIN crm_sources ns ON ns.kind='booking' AND ns.source_id=n.reference WHERE (ns.contact_id=c.id OR (c.email IS NOT NULL AND c.email<>'' AND lower(n.customer_email)=lower(c.email))) AND n.reference<>b.reference AND n.status='confirmed' AND n.pickup_date>=b.pickup_date)";
        const candidates = (await db.prepare(`SELECT c.id,c.name,c.email,c.marketing_opt_in,b.reference,b.dropoff FROM crm_contacts c JOIN crm_sources s ON s.contact_id=c.id AND s.kind='booking' JOIN bookings b ON b.reference=s.source_id WHERE c.merged_into IS NULL AND ${eligible} ${rule.channel === 'email' ? "AND c.marketing_opt_in=1 AND c.email IS NOT NULL AND c.email<>''" : ''} AND NOT EXISTS(SELECT 1 FROM crm_tasks t WHERE t.dedupe_key='retention:'||?||':'||b.reference) AND NOT EXISTS(SELECT 1 FROM crm_outbox o WHERE o.dedupe_key='retention:'||?||':'||b.reference) ORDER BY b.pickup_date DESC LIMIT 50`).bind(...(rule.kind === 'inactive' ? [date] : [new Date(at.getTime() + 7 * 3600000).toISOString().slice(0, 10), new Date(at.getTime() + rule.days * 86400000 + 7 * 3600000).toISOString().slice(0, 10)]), rule.id, rule.id).all<{
            id: string;
            name: string;
            email: string | null;
            marketing_opt_in: number;
            reference: string;
            dropoff: string;
        }>()).results;
        for (const c of candidates) {
            const key = `retention:${rule.id}:${c.reference}`;
            if (rule.channel === 'email') {
                if (!c.marketing_opt_in || !c.email)
                    continue;
                await enqueueCrmEmail(key, c.email, { kind: 'retention', data: { to: c.email, kicker: 'Waydidi Travel', title: rule.title, intro: rule.message.replaceAll('{name}', c.name), cta: 'Book your next ride', path: '/#booking-search', tag: key } }, c.id, rule.id);
            }
            else
                await db.prepare("INSERT OR IGNORE INTO crm_tasks(id,contact_id,title,due_at,owner_id,dedupe_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), c.id, `${rule.title} · ${c.reference}`, stamp, rule.owner_id, key, stamp, stamp).run();
        }
    }
    return recoverCrmEmails(at);
}
