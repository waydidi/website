import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { customerFromRequest } from "@/lib/customer-auth";
import { CONTACT_PREFERENCES, sanitizeProfileText } from "@/lib/customer-account";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function PATCH(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // Only fields present in the request are changed, so the profile and
  // settings pages can each save their own part.
  const update: Partial<typeof customers.$inferInsert> = { updatedAt: new Date().toISOString() };
  if ("name" in input) update.name = sanitizeProfileText(input.name, 80);
  if ("surname" in input) update.surname = sanitizeProfileText(input.surname, 80);
  if ("phone" in input) {
    const phone = sanitizeProfileText(input.phone, 40);
    if (phone && !/^[+\d][\d\s()-]{5,39}$/.test(phone)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    update.phone = phone;
  }
  if ("contactPreference" in input) update.contactPreference = CONTACT_PREFERENCES.find((value) => value === input.contactPreference) ?? "email";
  if ("marketingOptIn" in input) update.marketingOptIn = input.marketingOptIn === true;
  await getDb().update(customers).set(update).where(eq(customers.id, session.customer.id));
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
