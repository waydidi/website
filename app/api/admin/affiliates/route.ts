import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { affiliateBookings, affiliateSummaries, cleanCode, cleanSlug, dashboardPath, ensureAffiliateTables, isSlug, markPaid, payoutList, type Affiliate } from "@/lib/affiliates";
import { sendTripEmail } from "@/lib/email";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });

/** Admin → Partners → Affiliates: list (with clicks, bookings, commission) or one partner's bookings (?id=). */
export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff) return reply("Staff access required.", 403);
  const params = new URL(request.url).searchParams;
  const payouts = params.get("payouts");
  if (payouts) return NextResponse.json({ payouts: await payoutList(payouts) }, { headers });
  const id = params.get("id");
  if (id) return NextResponse.json({ bookings: await affiliateBookings(id) }, { headers });
  const list = await affiliateSummaries().catch(() => []);
  // Each partner's private dashboard link (signed; "New link" replaces it).
  const origin = new URL(request.url).origin;
  const affiliates = await Promise.all(list.map(async (a) => ({ ...a, dashboardUrl: `${origin}${await dashboardPath(a).catch(() => "")}` })));
  return NextResponse.json({ affiliates }, { headers });
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
  if ((b.action === "approve" || b.action === "decline") && typeof b.id === "string") {
    const a = await db().prepare("SELECT * FROM affiliates WHERE id=? AND status='applied'").bind(b.id).first<Affiliate>();
    if (!a) return reply("This application was already handled.", 409);
    const status = b.action === "approve" ? "active" : "declined";
    await db().prepare("UPDATE affiliates SET status=?,decided_at=?,decided_by=?,updated_at=? WHERE id=? AND status='applied'").bind(status, now, staff.displayName, now, a.id).run();
    let emailed = false;
    if (status === "active" && a.email) {
      // Welcome email: their link, code, rate and private dashboard link.
      const origin = new URL(request.url).origin;
      const r = await sendTripEmail({
        to: a.email, kicker: "Waydidi Partners", title: "Welcome to Waydidi Partners",
        intro: `Hi ${a.name}, your partner account is ready. Share your link or code: you earn ${a.commission_percent}% of every completed ride, and your customers get ${a.discount_percent}% off with your code.`,
        rows: [["Your link", `https://waydidi.com/?ref=${a.slug}`], ["Your code", a.code], ["You earn", `${a.commission_percent}% per completed ride`], ["Customer discount", `${a.discount_percent}% with your code`]],
        cta: "Open my partner dashboard", link: `${origin}${await dashboardPath(a)}`,
        footer: "Keep the dashboard link private: it opens your account without a password. Questions? WhatsApp +66 63 206 4884.",
        tag: `partner-welcome-${a.id}`,
      }).catch(() => null);
      emailed = r?.status === "sent";
    }
    return NextResponse.json({ ok: true, emailed }, { headers });
  }
  if (b.action === "new-link" && typeof b.id === "string") {
    await db().prepare("UPDATE affiliates SET link_version=COALESCE(link_version,0)+1,updated_at=? WHERE id=?").bind(now, b.id).run();
    return NextResponse.json({ ok: true }, { headers });
  }
  if (b.action === "pay" && typeof b.id === "string") {
    // One month's completed rides (Monthly payouts), or everything completed so far.
    const month = typeof b.month === "string" && /^\d{4}-\d{2}$/.test(b.month) ? b.month : undefined;
    return NextResponse.json({ ok: true, paid: await markPaid(b.id, month) }, { headers });
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
  // Editing an application keeps it waiting; it becomes active only through Approve.
  const status = b.status === "applied" ? "applied" : b.status === "declined" ? "declined" : b.status === "paused" ? "paused" : "active";
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
