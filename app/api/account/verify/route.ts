import { env } from "cloudflare:workers";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings, customerLoginCodes, customers } from "@/db/schema";
import { createCustomerSession, overRateLimit } from "@/lib/customer-auth";
import { accountCookie, isValidCode, isValidEmail, MAX_CODE_ATTEMPTS, MAX_REQUESTS_PER_IP_PER_15_MIN, normalizeEmail } from "@/lib/customer-account";
import { constantTimeEqual, isJsonRequest, sameOrigin, sha256 } from "@/lib/security";

// Bookings store the full name plus the surname separately.
function firstName(full: string | undefined, surname: string | null | undefined) {
  if (!full) return null;
  const trimmed = full.trim();
  return (surname && trimmed.endsWith(` ${surname}`) ? trimmed.slice(0, -surname.length - 1) : trimmed) || null;
}

const invalid = () => NextResponse.json({ error: "That code is not valid or has expired." }, { status: 400 });

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (await overRateLimit(request, "account-verify", MAX_REQUESTS_PER_IP_PER_15_MIN * 2, 15, env.RATE_LIMIT_SALT ?? "waydidi"))
    return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 });
  const input = (await request.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  const email = normalizeEmail(input.email);
  const code = typeof input.code === "string" ? input.code.replace(/\s/g, "") : "";
  if (!isValidEmail(email) || !isValidCode(code)) return invalid();

  const now = new Date();
  const [record] = await getDb().select().from(customerLoginCodes)
    .where(and(eq(customerLoginCodes.email, email), isNull(customerLoginCodes.consumedAt), gt(customerLoginCodes.expiresAt, now.toISOString())))
    .orderBy(desc(customerLoginCodes.createdAt)).limit(1);
  if (!record || record.attempts >= MAX_CODE_ATTEMPTS) return invalid();
  // Count the attempt before comparing so parallel guesses cannot exceed the limit.
  await getDb().update(customerLoginCodes).set({ attempts: sql`${customerLoginCodes.attempts} + 1` }).where(eq(customerLoginCodes.id, record.id));
  if (!constantTimeEqual(await sha256(`${record.id}:${code}`), record.codeHash)) return invalid();
  const consumed = await getDb().update(customerLoginCodes).set({ consumedAt: now.toISOString() })
    .where(and(eq(customerLoginCodes.id, record.id), isNull(customerLoginCodes.consumedAt))).returning({ id: customerLoginCodes.id });
  if (!consumed.length) return invalid();

  let [customer] = await getDb().select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer) {
    // Seed the profile from the customer's most recent booking, if any.
    const [latest] = await getDb().select({ name: bookings.customerName, surname: bookings.customerSurname, phone: bookings.customerPhone })
      .from(bookings).where(sql`lower(${bookings.customerEmail}) = ${email}`).orderBy(desc(bookings.createdAt)).limit(1);
    [customer] = await getDb().insert(customers).values({
      id: crypto.randomUUID(), email, name: firstName(latest?.name, latest?.surname), surname: latest?.surname || null, phone: latest?.phone || null,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), lastSeenAt: now.toISOString(),
    }).onConflictDoNothing().returning();
    if (!customer) [customer] = await getDb().select().from(customers).where(eq(customers.email, email)).limit(1);
  }
  const token = await createCustomerSession(customer.id, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": accountCookie(token), "Cache-Control": "no-store" } });
}
