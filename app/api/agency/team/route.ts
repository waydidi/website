import { z } from "zod";
import { customerFromRequest } from "@/lib/customer-auth";
import { agencyForCustomer, agencyMemberRole } from "@/lib/agency";
import { crmDb } from "@/lib/crm";
import { sameOrigin, isJsonRequest } from "@/lib/security";
async function access(request: Request) {
    const session = await customerFromRequest(request);
    const agency = await agencyForCustomer(session?.customer ?? null);
    if (!agency || !session)
        return null;
    return { agency, customer: session.customer, role: await agencyMemberRole(agency, session.customer) };
}
export async function GET(request: Request) {
    const a = await access(request);
    if (!a || a.role !== 'manager')
        return Response.json({ error: 'Manager access required' }, { status: 403 });
    const members = await crmDb().prepare('SELECT email,role,active FROM agency_members WHERE agency_id=? ORDER BY email').bind(a.agency.id).all();
    return Response.json({ members: members.results, primaryEmail: a.agency.email }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
    if (!sameOrigin(request) || !isJsonRequest(request))
        return Response.json({ error: 'Request blocked' }, { status: 403 });
    const a = await access(request);
    if (!a || a.role !== 'manager')
        return Response.json({ error: 'Manager access required' }, { status: 403 });
    const p = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(['manager', 'booker']), active: z.boolean() }).safeParse(await request.json().catch(() => null));
    if (!p.success)
        return Response.json({ error: 'Choose an email and role' }, { status: 400 });
    if (p.data.email === a.agency.email.toLowerCase() || p.data.email === a.customer.email.toLowerCase())
        return Response.json({ error: 'Your own access and the primary agency email cannot be changed here.' }, { status: 400 });
    const other = await crmDb().prepare("SELECT id FROM agency_applications WHERE lower(email)=? AND id<>? AND status='approved'").bind(p.data.email, a.agency.id).first();
    if (other)
        return Response.json({ error: 'This email belongs to another agency.' }, { status: 409 });
    try {
        await crmDb().batch([crmDb().prepare('INSERT INTO agency_members(agency_id,email,role,active,created_at) VALUES(?,?,?,?,?) ON CONFLICT(agency_id,email) DO UPDATE SET role=excluded.role,active=excluded.active').bind(a.agency.id, p.data.email, p.data.role, Number(p.data.active), new Date().toISOString()), crmDb().prepare("INSERT INTO crm_events(id,entity_id,kind,body,created_at) VALUES(?,?,'partner',?,?)").bind(crypto.randomUUID(), a.agency.id, `Agency manager ${a.customer.email} updated access for ${p.data.email}`, new Date().toISOString())]);
        return Response.json({ ok: true });
    }
    catch {
        return Response.json({ error: 'This email already has active access to another agency.' }, { status: 409 });
    }
}
