import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { sameOrigin, isJsonRequest } from "@/lib/security";
import type { SecurityDatabase } from "@/lib/worker-db";

export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  const input = await request.json().catch(() => null) as { displayName?: unknown; email?: unknown } | null;
  const displayName = typeof input?.displayName === "string" ? input.displayName.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (displayName.length < 2 || displayName.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a name of 2–100 characters and a valid email address." }, { status: 400 });
  }
  await (env.DB as SecurityDatabase).prepare("UPDATE staff_accounts SET display_name=?,email=? WHERE id=? AND active=1").bind(displayName, email, admin.id).run();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
