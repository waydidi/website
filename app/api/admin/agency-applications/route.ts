import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const STATUSES = ["new", "contacted", "approved", "declined"];

// Change a travel agency application's status.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (!isJsonRequest(request)) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  const id = typeof input?.id === "string" ? input.id : "";
  const status = typeof input?.status === "string" ? input.status : "";
  if (!id || !STATUSES.includes(status)) return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
  const done = await getDb().update(agencyApplications).set({ status }).where(eq(agencyApplications.id, id)).returning({ id: agencyApplications.id });
  if (!done.length) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
