import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { getLimits, placeSearchStats, saveLimits, type Alert } from "@/lib/cee/guard";
import { esc } from "@/lib/telegram/cards";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";

// Admin → Website chat → Alerts & limits: the team's notices (closures, flooding, disasters) that
// Non always checks first, and the limits on paid place searches.
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const allowed = (role: string) => ["owner", "support", "operations"].includes(role);
type Stmt = { bind: (...v: unknown[]) => Stmt; all: <T>() => Promise<{ results: T[] }>; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const EFFECTS = ["info", "warn", "stop"] as const;
const LABEL = { info: "Information", warn: "Warn customers", stop: "Stop selling" };

export async function GET() {
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Staff access required.", 403);
  const alerts = (await db().prepare("SELECT * FROM chat_alerts ORDER BY active DESC, created_at DESC LIMIT 100").all<Alert>()).results;
  return NextResponse.json({ alerts, limits: await getLimits(), today: await placeSearchStats(), owner: staff.role === "owner", now: new Date().toISOString() }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Staff access required.", 403);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const now = new Date().toISOString();
  const who = staff.displayName || staff.email;
  if (input.action === "limits") {
    if (staff.role !== "owner") return reply("Only the owner can change limits.", 403);
    return NextResponse.json({ limits: await saveLimits(input.limits as Record<string, number>) }, { headers });
  }
  if (input.action === "save") {
    const title = String(input.title ?? "").trim().slice(0, 120), message = String(input.message ?? "").trim().slice(0, 800);
    const effect = EFFECTS.includes(input.effect as never) ? input.effect as Alert["effect"] : "warn";
    const startsAt = /^\d{4}-\d{2}-\d{2}/.test(String(input.startsAt ?? "")) ? new Date(String(input.startsAt)).toISOString() : now;
    const endsAt = input.endsAt && /^\d{4}-\d{2}-\d{2}/.test(String(input.endsAt)) ? new Date(String(input.endsAt)).toISOString() : null;
    const source = typeof input.sourceUrl === "string" && /^https:\/\//.test(input.sourceUrl) ? input.sourceUrl.slice(0, 500) : null;
    if (title.length < 3 || message.length < 5) return reply("Add a title and the message customers should get.", 400);
    if (endsAt && endsAt <= startsAt) return reply("The end must be after the start.", 400);
    const areas = String(input.areas ?? "").split(/[,\n]/).map((a) => a.trim()).filter(Boolean).slice(0, 30).join(", ");
    const id = typeof input.id === "string" && input.id ? input.id : crypto.randomUUID();
    await db().prepare(`INSERT INTO chat_alerts(id,title,message,areas,effect,starts_at,ends_at,source_url,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,message=excluded.message,areas=excluded.areas,effect=excluded.effect,starts_at=excluded.starts_at,ends_at=excluded.ends_at,source_url=excluded.source_url,active=1,updated_at=excluded.updated_at`)
      .bind(id, title, message, areas, effect, startsAt, endsAt, source, who, now, now).run();
    if (telegramConfigured()) await sendCard([`<b>Chat alert ${input.id ? "updated" : "added"}: ${esc(title)}</b>`, `${LABEL[effect]} · ${areas ? esc(areas) : "everywhere"}`, `${startsAt.slice(0, 10)} → ${endsAt ? endsAt.slice(0, 10) : "until ended"}`, `<blockquote>${esc(message)}</blockquote>`, `Non tells customers this from now on. By ${esc(who)}.`].join("\n")).catch(() => undefined);
    return NextResponse.json({ ok: true, id }, { headers });
  }
  if (input.action === "end" && typeof input.id === "string") {
    const a = await db().prepare("SELECT title FROM chat_alerts WHERE id=?").bind(input.id).first<{ title: string }>();
    await db().prepare("UPDATE chat_alerts SET active=0,ends_at=COALESCE(ends_at,?),updated_at=? WHERE id=?").bind(now, now, input.id).run();
    if (a && telegramConfigured()) await sendCard(`<b>Chat alert ended: ${esc(a.title)}</b>\nNon no longer mentions it. By ${esc(who)}.`).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers });
  }
  return reply("Unsupported action.", 400);
}
