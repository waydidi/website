import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { deleteRule, importDefaultRules, ruleInputSchema, saveRule } from "@/lib/route-inclusions-admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const other = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), id: z.string().max(80) }),
  z.object({ action: z.literal("import") }),
]);

// Admin-only: edit what each route's fare includes (tolls, ferry).
export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action === "save") {
    const parsed = ruleInputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
    const id = await saveRule(parsed.data);
    if (!id) return NextResponse.json({ error: "Route not found." }, { status: 404 });
    console.info("Admin saved route inclusion", { id, admin: admin.email });
    return NextResponse.json({ ok: true, id });
  }
  const parsed = other.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (parsed.data.action === "delete") { await deleteRule(parsed.data.id); return NextResponse.json({ ok: true }); }
  const imported = await importDefaultRules();
  return NextResponse.json({ ok: true, imported });
}
