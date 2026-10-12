import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { slipImage } from "@/lib/payment-slips";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (admin.role !== "owner" && admin.role !== "finance") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const image = await slipImage(id);
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(image.body, { headers: { "Content-Type": image.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
