import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { canReadOperationsInbox, operationsInbox, parseInboxQuery, updateInboxAlert } from "@/lib/operations-inbox";
import { logOperationalError, requestIdFor } from "@/lib/observability";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { z } from "zod";
import { ensureReliabilityTables } from "@/lib/telegram/reliability-db";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReadOperationsInbox(admin.role)) {
    return NextResponse.json({ error: "Your staff role does not permit this action." }, { status: 403, headers });
  }
  const requestId = requestIdFor(request);
  const query = parseInboxQuery(new URL(request.url));
  if (!query) return NextResponse.json({ error: "Invalid inbox filter or page." }, { status: 400, headers });
  try {
    await ensureReliabilityTables();
    return NextResponse.json(await operationsInbox(env.DB, query), { headers: { ...headers, "X-Request-ID": requestId } });
  } catch (error) {
    logOperationalError("operations_inbox_failed", requestId, error);
    return NextResponse.json({ error: "The exception inbox could not be loaded." }, {
      status: 503, headers: { ...headers, "X-Request-ID": requestId },
    });
  }
}

const actionSchema = z.object({
  id: z.string().min(1).max(100),
  action: z.enum(["acknowledge", "resolve"]),
  expectedStatus: z.enum(["open", "acknowledged"]),
  note: z.string().trim().max(500).default(""),
}).strict().refine(input => input.action !== "resolve" || input.note.length >= 3, { message: "Add a resolution note." });

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReadOperationsInbox(admin.role) || !sameOrigin(request) || !isJsonRequest(request)) {
    return NextResponse.json({ error: "Request blocked." }, { status: 403, headers });
  }
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the alert action, status and resolution note." }, { status: 400, headers });
  try {
    const updated = await updateInboxAlert(env.DB, { ...parsed.data, actor: admin.email });
    if (!updated) return NextResponse.json({ error: "This alert changed. Refresh the inbox before trying again." }, { status: 409, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    logOperationalError("operations_inbox_update_failed", requestIdFor(request), error);
    return NextResponse.json({ error: "The alert could not be updated. Refresh before retrying." }, { status: 503, headers });
  }
}
