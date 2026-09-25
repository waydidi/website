import { NextResponse } from "next/server";
import { z } from "zod";
import { customerFromRequest } from "@/lib/customer-auth";
import { listMemberBoxes, openBox } from "@/lib/boxes";
import { syncMemberGifts } from "@/lib/gifts";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ boxes: [] }, { headers: noStore });
  await syncMemberGifts(session.customer.id).catch(() => undefined);
  return NextResponse.json({ boxes: await listMemberBoxes(session.customer.id).catch(() => []) }, { headers: noStore });
}

// Open a mystery box. The prize is chosen on the server.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Sign in to open your box." }, { status: 401 });
  const parsed = z.object({ id: z.string().max(80) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Box not found." }, { status: 400 });
  const result = await openBox(session.customer.id, parsed.data.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result, { headers: noStore });
}
