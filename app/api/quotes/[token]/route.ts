import { acceptQuote, CrmError } from "@/lib/crm";
import { sameOrigin, isJsonRequest } from "@/lib/security";
export async function POST(request: Request, { params }: {
    params: Promise<{
        token: string;
    }>;
}) {
    if (!sameOrigin(request) || !isJsonRequest(request))
        return Response.json({ error: 'Request blocked' }, { status: 403 });
    try {
        return Response.json(await acceptQuote((await params).token), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        return Response.json({ error: e instanceof CrmError ? e.message : 'Quote changed. Please refresh.' }, { status: e instanceof CrmError ? e.status : 409, headers: { 'Cache-Control': 'no-store' } });
    }
}
