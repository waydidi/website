import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { canReadOperationsInbox, operationsInbox } from "@/lib/operations-inbox";
import { logOperationalError, requestIdFor } from "@/lib/observability";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!canReadOperationsInbox(admin.role)) {
    return NextResponse.json({ error: "Your staff role does not permit this action." }, { status: 403, headers });
  }
  const requestId = requestIdFor(request);
  try {
    return NextResponse.json(await operationsInbox(env.DB), { headers: { ...headers, "X-Request-ID": requestId } });
  } catch (error) {
    logOperationalError("operations_inbox_failed", requestId, error);
    return NextResponse.json({ error: "The exception inbox could not be loaded." }, {
      status: 503, headers: { ...headers, "X-Request-ID": requestId },
    });
  }
}
