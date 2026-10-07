import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { affiliateBookings, affiliateSummaries, cleanCode, cleanSlug, ensureAffiliateTables, isSlug } from "@/lib/affiliates";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });

/** Admin → Partners → Affiliates: list (with clicks, bookings, commission) or one partner's bookings (?id=). */
export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff) return reply("Staff access required.", 403);
  const id = new URL(request.url).searchParams.get("id");
  if (id) return NextResponse.json({ bookings: await affiliateBookings(id) }, { headers });
  return NextResponse.json({ affiliates: await affiliateSummaries().catch(() => []) }, { headers });
}

/** Create or update a partner; or mark their earned commission as paid. */
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked", 403);
  const staff = await getWaydidiAdmin();
  if (!staff) return reply("Staff access required.", 403);
  await ensureAffiliateTables();
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return reply("Nothing to save.");
  const now = new Date().toISOString();
  if (b.action === "pay" && typeof b.id === "string") {
    // Everything earned (ride completed) and not yet paid.
    const r = await db().prepare("UPDATE booking_affiliates SET paid_at=? WHERE affiliate_id=? AND paid_at IS NULL AND booking_reference IN (SELECT reference FROM bookings WHERE status='completed')").bind(now, b.id).run();
    return NextResponse.json({ ok: true, paid: r.meta.changes }, { headers });
  }
  const name = String(b.name ?? "").trim().slice(0, 80);
  const slug = cleanSlug(String(b.slug ?? ""));
  const code = cleanCode(String(b.code ?? ""));
  const commission = Number(b.commissionPercent), discount = Number(b.discountPercent);
  if (name.length < 2) return reply("Enter the partner's name.");
  if (!isSlug(slug)) return reply("Link name: 2–40 lowercase letters, numbers or dashes, e.g. mint or koh-chang-guide.");
  if (code.length < 3) return reply("Code: at least 3 letters or numbers, e.g. MINT5.");
  if (!(commission >= 0 && commission <= 30)) return reply("Commission must be 0–30%.");
  if (!(discount >= 0 && discount <= 30)) return reply("Customer discount must be 0–30%.");
  const status = b.status === "paused" ? "paused" : "active";
  const kind = ["creator", "hotel", "guide", "business", "other"].includes(String(b.kind)) ? String(b.kind) : "other";
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254) || null;
  const phone = String(b.phone ?? "").trim().slice(0, 40) || null;
  const notes = String(b.notes ?? "").trim().slice(0, 500) || null;
  // A partner code must not clash with a promo code.
  const promo = await db().prepare("SELECT 1 x FROM promo_codes WHERE UPPER(code)=?").bind(code).first().catch(() => null);
  if (promo) return reply("That code is already a promo code. Choose another.");
  try {
    if (typeof b.id === "string" && b.id) {
      await db().prepare("UPDATE affiliates SET name=?,slug=?,code=?,email=?,phone=?,kind=?,commission_percent=?,discount_percent=?,status=?,notes=?,updated_at=? WHERE id=?")
        .bind(name, slug, code, email, phone, kind, commission, discount, status, notes, now, b.id).run();
      return NextResponse.json({ ok: true, id: b.id }, { headers });
    }
    const id = crypto.randomUUID();
    await db().prepare("INSERT INTO affiliates(id,slug,code,name,email,phone,kind,commission_percent,discount_percent,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, slug, code, name, email, phone, kind, commission, discount, status, notes, now, now).run();
    return NextResponse.json({ ok: true, id }, { headers });
  } catch (e) {
    return reply(/UNIQUE/i.test(e instanceof Error ? e.message : "") ? "That link name or code is already used by another partner." : "Couldn't save.");
  }
}
