import { secureToken, sha256 } from "./security";
import { env } from "cloudflare:workers";
import { crmDb, nowIso } from "./crm";
import { retryDelay } from "./crm-rules";
import { sendRewardEmail, sendUnfinishedBookingEmail } from "./email";
type Reward = Parameters<typeof sendRewardEmail>[0];
type Unfinished = Parameters<typeof sendUnfinishedBookingEmail>[0];
export type QueuePayload = {
    kind: "reward";
    data: Reward;
    rewardKey?: string;
    customerId?: string;
    promotional?: boolean;
} | {
    kind: "unfinished";
    data: Unfinished;
    notificationKey?: string;
} | {
    kind: "retention";
    data: Reward;
};
export async function enqueueCrmEmail(key: string, email: string, payload: QueuePayload, contactId: string | null = null, ruleId: string | null = null) {
    if (payload.kind === 'retention' && contactId) {
        const existing = await crmDb().prepare('SELECT id FROM crm_outbox WHERE dedupe_key=?').bind(key).first();
        if (existing)
            return;
        const token = secureToken(), stamp = nowIso();
        await crmDb().prepare('INSERT INTO crm_marketing_tokens(token_hash,contact_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await sha256(token), contactId, new Date(Date.now() + 365 * 86400000).toISOString(), stamp).run();
        payload = { ...payload, data: { ...payload.data, unsubscribePath: '/marketing/' + token } };
    }
    await crmDb().prepare("INSERT INTO crm_outbox(id,contact_id,rule_id,dedupe_key,email,payload_json,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING").bind(crypto.randomUUID(), contactId, ruleId, key, email, JSON.stringify(payload), nowIso()).run();
}
export async function recoverCrmEmails(at = new Date()) {
    if (!env.RESEND_API_KEY || !env.BOOKING_FROM_EMAIL)
        return 0;
    const db = crmDb(), stamp = at.toISOString(), stale = new Date(at.getTime() - 15 * 60000).toISOString();
    // The provider retains idempotency keys for 24 hours. Ambiguous older jobs require staff review.
    await db.prepare("UPDATE crm_outbox SET status='needs_review' WHERE status IN ('processing','failed') AND first_attempt_at IS NOT NULL AND first_attempt_at<?").bind(new Date(at.getTime() - 23 * 3600000).toISOString()).run();
    const jobs = (await db.prepare("SELECT id FROM crm_outbox WHERE attempts<5 AND ((status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR (status='processing' AND attempted_at<?)) ORDER BY created_at LIMIT 40").bind(stamp, stale).all<{
        id: string;
    }>()).results;
    let sent = 0;
    for (const job of jobs) {
        const claim = await db.prepare("UPDATE crm_outbox SET status='processing',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,?),attempted_at=? WHERE id=? AND attempts<5 AND ((status IN ('pending','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR (status='processing' AND attempted_at<?))").bind(stamp, stamp, job.id, stamp, stale).run();
        if (!claim.meta.changes)
            continue;
        const row = await db.prepare('SELECT * FROM crm_outbox WHERE id=?').bind(job.id).first<{
            id: string;
            payload_json: string;
            contact_id: string | null;
            rule_id: string | null;
            email: string;
            attempts: number;
        }>();
        if (!row)
            continue;
        let payload: QueuePayload | null = null, status = 'failed';
        try {
            payload = JSON.parse(row.payload_json) as QueuePayload;
            let eligible = true;
            if (payload.kind === 'retention') {
                const c = row.contact_id ? await db.prepare("SELECT c.* FROM crm_contacts c JOIN crm_retention_rules r ON r.id=? WHERE c.id=? AND c.merged_into IS NULL AND c.marketing_opt_in=1 AND c.email=? AND r.enabled=1 AND (c.member_id IS NULL OR EXISTS(SELECT 1 FROM customers m WHERE m.id=c.member_id AND m.marketing_opt_in=1 AND lower(m.email)=lower(c.email)))").bind(row.rule_id, row.contact_id, row.email).first() : null;
                eligible = !!c;
                if (c) {
                    const recent = await db.prepare("SELECT b.reference FROM bookings b JOIN crm_sources s ON s.kind='booking' AND s.source_id=b.reference WHERE (s.contact_id=? OR lower(b.customer_email)=lower(?)) AND b.status='confirmed' AND b.created_at>?").bind(row.contact_id, row.email, (await db.prepare('SELECT created_at FROM crm_outbox WHERE id=?').bind(row.id).first<{
                        created_at: string;
                    }>())!.created_at).first();
                    if (recent)
                        eligible = false;
                }
            }
            if (payload.kind === 'reward' && payload.customerId) {
                const member = await db.prepare('SELECT email,marketing_opt_in FROM customers WHERE id=?').bind(payload.customerId).first<{
                    email: string;
                    marketing_opt_in: number;
                }>();
                eligible = !!member && member.email === row.email && (!payload.promotional || !!member.marketing_opt_in);
            }
            if (payload.kind === 'unfinished') {
                const b = await db.prepare('SELECT status,pickup_date,pickup_time FROM bookings WHERE reference=?').bind(payload.data.reference).first<{
                    status: string;
                    pickup_date: string;
                    pickup_time: string;
                }>();
                eligible = !!b && ['expired', 'payment_failed'].includes(b.status) && Date.parse(`${b.pickup_date}T${b.pickup_time}:00+07:00`) > at.getTime() + 6 * 3600000;
                const newer = await db.prepare("SELECT reference FROM bookings WHERE lower(customer_email)=lower(?) AND status IN ('confirmed','completed') AND created_at>(SELECT created_at FROM bookings WHERE reference=?) LIMIT 1").bind(row.email, payload.data.reference).first();
                if (newer)
                    eligible = false;
            }
            if (!eligible)
                status = 'cancelled';
            else
                status = (await (payload.kind === 'unfinished' ? sendUnfinishedBookingEmail(payload.data) : sendRewardEmail(payload.data))).status === 'sent' ? 'sent' : 'failed';
        }
        catch {
            status = 'failed';
        }
        if (status === 'failed' && row.attempts >= 5)
            status = 'needs_review';
        await db.prepare("UPDATE crm_outbox SET status=?,next_attempt_at=?,sent_at=? WHERE id=? AND status='processing' AND attempted_at=? AND attempts=?").bind(status, status === 'failed' ? new Date(at.getTime() + retryDelay(row.attempts)).toISOString() : null, status === 'sent' ? stamp : null, row.id, stamp, row.attempts).run();
        if (payload?.kind === 'reward' && payload.rewardKey)
            await db.prepare('UPDATE member_reward_emails SET status=? WHERE dedupe_key=?').bind(status, payload.rewardKey).run();
        if (payload?.kind === 'unfinished' && payload.notificationKey)
            await db.prepare('UPDATE booking_notifications SET status=?,attempt_count=?,last_attempt_at=?,sent_at=?,updated_at=? WHERE dedupe_key=?').bind(status, row.attempts, stamp, status === 'sent' ? stamp : null, stamp, payload.notificationKey).run();
        if (status === 'sent')
            sent++;
    }
    return sent;
}
