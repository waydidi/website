import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { isSiteLang } from "@/lib/site-languages";
import { textHash, translationConfigured } from "@/lib/site-translate";

// Admin → Translations: every AI-translated line, by language. Saving a correction marks it
// "reviewed" (never overwritten); deleting one makes the AI translate it again on the next view.
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const allowed = (role: string) => ["owner", "support", "operations", "marketing"].includes(role);
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Staff access required.", 403);
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "th";
  if (!isSiteLang(lang) || lang === "en") return reply("Choose a language.", 400);
  const q = `%${(url.searchParams.get("q") ?? "").trim().slice(0, 80)}%`;
  const status = url.searchParams.get("status") ?? "";
  const page = Math.max(0, Number(url.searchParams.get("page")) || 0);
  const rows = await db().prepare(`SELECT hash,source,text,status,path,updated_at,updated_by FROM site_translations WHERE lang=? AND (source LIKE ? OR text LIKE ?) ${status === "machine" || status === "reviewed" ? "AND status=?" : "AND ?=''"} ORDER BY status='reviewed', updated_at DESC LIMIT 50 OFFSET ?`)
    .bind(lang, q, q, status === "machine" || status === "reviewed" ? status : "", page * 50).all();
  const counts = await db().prepare("SELECT lang,COUNT(*) total,SUM(status='reviewed') reviewed FROM site_translations GROUP BY lang").all<{ lang: string; total: number; reviewed: number }>();
  const usage = await db().prepare("SELECT COALESCE(SUM(strings),0) strings,COALESCE(SUM(usd),0) usd FROM site_translation_usage WHERE day>=?").bind(new Date().toISOString().slice(0, 7) + "-01").first<{ strings: number; usd: number }>();
  return NextResponse.json({ rows: rows.results, counts: counts.results, usage, configured: translationConfigured() }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Staff access required.", 403);
  const input = await request.json().catch(() => ({})) as { action?: string; lang?: unknown; hash?: unknown; source?: unknown; text?: unknown };
  if (!isSiteLang(input.lang) || input.lang === "en") return reply("Choose a language.", 400);
  const now = new Date().toISOString();
  if (input.action === "save") {
    // By hash (editing a row) or by English text (adding a correction for any line on the site).
    const text = typeof input.text === "string" ? input.text.trim().slice(0, 4000) : "";
    if (!text) return reply("Write the translation.", 400);
    if (typeof input.source === "string" && input.source.trim()) {
      const source = input.source.trim().slice(0, 2000);
      await db().prepare("INSERT INTO site_translations(lang,hash,source,text,status,created_at,updated_at,updated_by) VALUES(?,?,?,?,'reviewed',?,?,?) ON CONFLICT(lang,hash) DO UPDATE SET text=excluded.text,status='reviewed',updated_at=excluded.updated_at,updated_by=excluded.updated_by")
        .bind(input.lang, await textHash(source), source, text, now, now, staff.email ?? staff.role).run();
      return NextResponse.json({ ok: true }, { headers });
    }
    if (typeof input.hash !== "string") return reply("Line not found.", 400);
    const r = await db().prepare("UPDATE site_translations SET text=?,status='reviewed',updated_at=?,updated_by=? WHERE lang=? AND hash=?").bind(text, now, staff.email ?? staff.role, input.lang, input.hash).run();
    return r.meta.changes ? NextResponse.json({ ok: true }, { headers }) : reply("Line not found.", 404);
  }
  if (input.action === "approve" && typeof input.hash === "string") {
    await db().prepare("UPDATE site_translations SET status='reviewed',updated_at=?,updated_by=? WHERE lang=? AND hash=?").bind(now, staff.email ?? staff.role, input.lang, input.hash).run();
    return NextResponse.json({ ok: true }, { headers });
  }
  if (input.action === "retranslate" && typeof input.hash === "string") {
    await db().prepare("DELETE FROM site_translations WHERE lang=? AND hash=?").bind(input.lang, input.hash).run();
    return NextResponse.json({ ok: true }, { headers });
  }
  return reply("Unsupported action.", 400);
}
