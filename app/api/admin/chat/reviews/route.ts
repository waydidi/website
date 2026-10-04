import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Internal support-quality reporting (not public, not Google). Staff ratings are for managers only.
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const managers = (role: string) => role === "owner" || role === "operations";

export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || !managers(staff.role)) return reply("Manager access required.", 403);
  const url = new URL(request.url);
  const where: string[] = ["1=1"], binds: unknown[] = [];
  const rating = Number(url.searchParams.get("rating"));
  if (rating >= 1 && rating <= 5) { where.push("r.rating=?"); binds.push(rating); }
  const admin = url.searchParams.get("admin");
  if (admin) { where.push("COALESCE(r.admin_name,'Unassigned')=?"); binds.push(admin); }
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push("r.submitted_at>=?"); binds.push(`${from}T00:00:00`); }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push("r.submitted_at<=?"); binds.push(`${to}T23:59:59.999Z`); }
  if (url.searchParams.get("attention") === "1") where.push("r.needs_attention=1");
  const filter = where.join(" AND ");

  const [summary, dist, perAdmin, list, funnel] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) count, ROUND(AVG(rating),2) average, SUM(needs_attention) attention FROM support_reviews r WHERE ${filter}`).bind(...binds).first(),
    env.DB.prepare(`SELECT rating, COUNT(*) n FROM support_reviews r WHERE ${filter} GROUP BY rating`).bind(...binds).all(),
    env.DB.prepare(`SELECT COALESCE(admin_name,'Unassigned') admin, COUNT(*) reviews, ROUND(AVG(rating),2) average FROM support_reviews r WHERE ${filter} GROUP BY 1 ORDER BY reviews DESC`).bind(...binds).all(),
    env.DB.prepare(`SELECT r.id,r.rating,r.feedback,r.admin_name,r.consent_to_publish,r.publication_status,r.needs_attention,r.submitted_at,r.google_cta_clicked_at,
      c.id conversation_id,c.public_id,c.customer_name,c.customer_country,c.source_title,c.source_url FROM support_reviews r JOIN website_conversations c ON c.id=r.conversation_id
      WHERE ${filter} ORDER BY r.submitted_at DESC LIMIT 200`).bind(...binds).all(),
    // Funnel: only events we can observe. A Google click is a click, not a Google review.
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM website_conversations WHERE closed_at IS NOT NULL) closed,
      (SELECT COUNT(*) FROM website_conversations WHERE review_prompt_viewed_at IS NOT NULL) prompted,
      (SELECT COUNT(*) FROM website_conversations WHERE review_rating_selected_at IS NOT NULL) rated,
      (SELECT COUNT(*) FROM support_reviews) submitted,
      (SELECT COUNT(*) FROM support_reviews WHERE google_cta_shown_at IS NOT NULL) cta_shown,
      (SELECT COUNT(*) FROM support_reviews WHERE google_cta_clicked_at IS NOT NULL) cta_clicked`).first(),
  ]);
  return NextResponse.json({ summary, distribution: dist.results, perAdmin: perAdmin.results, reviews: list.results, funnel }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !managers(staff.role)) return reply("Manager access required.", 403);
  const input = await request.json().catch(() => ({})) as { id?: unknown; action?: unknown };
  if (typeof input.id !== "string") return reply("Choose a review.", 400);
  const now = new Date().toISOString();
  if (input.action === "approve" || input.action === "reject") {
    // Publishing is only possible when the customer agreed to it.
    const result = await env.DB.prepare("UPDATE support_reviews SET publication_status=?,updated_at=? WHERE id=? AND consent_to_publish=1").bind(input.action === "approve" ? "approved" : "rejected", now, input.id).run();
    if (!result.meta.changes) return reply("This customer didn't agree to publication.", 409);
  } else if (input.action === "resolve") {
    await env.DB.prepare("UPDATE support_reviews SET needs_attention=0,updated_at=? WHERE id=?").bind(now, input.id).run();
  } else return reply("Unknown action.", 400);
  return NextResponse.json({ ok: true }, { headers });
}
