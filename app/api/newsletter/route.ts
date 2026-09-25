import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254), source: z.string().max(40).default("site") });

// Newsletter sign-up. Signing up twice is fine: the first sign-up is kept.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });
  await getDb().insert(newsletterSubscribers).values({ ...parsed.data, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
