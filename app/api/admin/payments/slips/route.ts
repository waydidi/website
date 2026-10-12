import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { approveSlip, rejectSlip, slipQueue } from "@/lib/payment-slips";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Finance review of bank-transfer slips. The Worker already limits /api/admin/payments/* to
// owner and finance staff; the role is checked here again because this moves money.
const canDecide = (role: string) => role === "owner" || role === "finance";

export async function GET() {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canDecide(admin.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ slips: await slipQueue() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canDecide(admin.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = await request.json().catch(() => ({})) as { action?: string; id?: string; amountMinor?: number; note?: string };
  const id = String(input.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Unknown slip." }, { status: 400 });
  const result = input.action === "approve" ? await approveSlip(id, Number(input.amountMinor), admin.email)
    : input.action === "reject" ? await rejectSlip(id, String(input.note ?? ""), admin.email)
    : { ok: false as const, status: 400, error: "Unknown action." };
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
