import { memberTierStatus } from "@/lib/member-tier";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerSessions } from "@/db/schema";
import { cookieValue } from "@/lib/booking-management";
import { customerFromRequest } from "@/lib/customer-auth";
import { ACCOUNT_COOKIE, accountCookie } from "@/lib/customer-account";
import { sameOrigin, sha256 } from "@/lib/security";

/** Lightweight "who am I" for client components such as the header. */
export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  const customer = session?.customer;
  return NextResponse.json(
    customer ? { signedIn: true, name: customer.name, surname: customer.surname, email: customer.email, phone: customer.phone, tier: await memberTierStatus(customer.id).then((s) => s.tier.id).catch(() => "bronze") } : { signedIn: false },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Sign out of this device, or every device with ?everywhere=1. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const everywhere = new URL(request.url).searchParams.get("everywhere") === "1";
  const session = await customerFromRequest(request);
  if (everywhere && session) await getDb().delete(customerSessions).where(eq(customerSessions.customerId, session.customer.id));
  else {
    const token = cookieValue(request, ACCOUNT_COOKIE);
    if (token) await getDb().delete(customerSessions).where(eq(customerSessions.tokenHash, await sha256(token)));
  }
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": accountCookie("", 0), "Cache-Control": "no-store" } });
}
