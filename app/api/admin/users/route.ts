import { getWaydidiAdmin } from "@/lib/admin";
import { memberPage, memberCsv } from "@/lib/customer-admin";
export async function GET(request: Request) {
    const staff = await getWaydidiAdmin();
    if (!staff || !["owner", "operations", "support"].includes(staff.role))
        return Response.json({ error: "Unauthorized" }, { status: 403 });
    const u = new URL(request.url), q = (u.searchParams.get('q') ?? '').slice(0, 100), filter = u.searchParams.get('filter') ?? 'all', sort = u.searchParams.get('sort') ?? 'newest';
    if (u.searchParams.get('export') === '1' && staff.role === 'support')
        return Response.json({ error: 'Export access required' }, { status: 403 });
    if (u.searchParams.get('export') === '1')
        return new Response(await memberCsv(q, filter, sort), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="waydidi-members.csv"', 'Cache-Control': 'no-store' } });
    const page = Math.max(1, Math.min(100000, Number(u.searchParams.get('page')) || 1));
    return Response.json(await memberPage(q, Math.floor(page), filter, sort), { headers: { 'Cache-Control': 'no-store' } });
}
