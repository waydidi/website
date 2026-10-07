import { getWaydidiAdmin } from "@/lib/admin";
import { crmAction, crmDashboard, crmList, profile, exportContacts, CrmError, crmDb } from "@/lib/crm";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { ZodError } from "zod";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
    const staff = await getWaydidiAdmin();
    if (!staff || !["owner", "operations", "support"].includes(staff.role))
        return Response.json({ error: "CRM access required" }, { status: 403, headers });
    try {
        const u = new URL(request.url), q = (u.searchParams.get('q') ?? '').slice(0, 100), view = u.searchParams.get('view') ?? 'dashboard';
        if (u.searchParams.has('id'))
            return Response.json(await profile(u.searchParams.get('id')!), { headers });
        if (view === 'dashboard')
            return Response.json(await crmDashboard(), { headers });
        if (view === 'export') {
            if (staff.role === 'support')
                return Response.json({ error: 'Export access required' }, { status: 403, headers });
            return new Response(await exportContacts(q), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="waydidi-customers.csv"' } });
        }
        if (view === 'partner_detail') {
            if (staff.role === 'support')
                return Response.json({ error: 'Partner access required' }, { status: 403 });
            const id = u.searchParams.get('agencyId');
            const [members, stats] = await Promise.all([crmDb().prepare('SELECT email,role,active FROM agency_members WHERE agency_id=? ORDER BY email').bind(id).all(), crmDb().prepare("SELECT count(*) bookings,sum(b.total) revenue FROM booking_sources s JOIN bookings b ON b.reference=s.booking_reference WHERE s.source=? AND b.status IN ('confirmed','completed')").bind('agency:' + id).first()]);
            return Response.json({ members: members.results, stats }, { headers });
        }
        if (!['customers', 'pipeline', 'tasks', 'quotes', 'partners', 'retention', 'emails'].includes(view))
            throw new CrmError('Unknown CRM view');
        if (['partners', 'retention', 'emails'].includes(view) && staff.role === 'support')
            throw new CrmError('Operations access required', 403);
        return Response.json(await crmList(view, q, Math.max(1, Math.min(100000, Math.floor(Number(u.searchParams.get('page')) || 1))), u.searchParams.get('filter') ?? ''), { headers });
    }
    catch (e) {
        return Response.json({ error: e instanceof CrmError ? e.message : 'Unable to load CRM.' }, { status: e instanceof CrmError ? e.status : 500, headers });
    }
}
export async function POST(request: Request) {
    const staff = await getWaydidiAdmin();
    if (!staff || !["owner", "operations", "support"].includes(staff.role))
        return Response.json({ error: "CRM access required" }, { status: 403, headers });
    if (!sameOrigin(request) || !isJsonRequest(request))
        return Response.json({ error: "Request blocked" }, { status: 403, headers });
    try {
        const input = await request.json() as Record<string, unknown>;
        if (!input || typeof input.action !== 'string')
            throw new CrmError('Choose an action.');
        return Response.json(await crmAction(input.action, input, staff.id, staff.role), { headers });
    }
    catch (e) {
        if (!(e instanceof CrmError || e instanceof ZodError))
            console.error('CRM action failed', e);
        return Response.json({ error: e instanceof CrmError ? e.message : e instanceof ZodError ? e.issues[0]?.message : 'Could not save. Refresh and try again.' }, { status: e instanceof CrmError ? e.status : e instanceof ZodError ? 400 : 409, headers });
    }
}
