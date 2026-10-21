import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { BLOCKED_DOMAINS, DEFAULT_WHATSAPP } from "@/lib/post-helper-rules";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { ensurePostHelperTables } from "@/lib/telegram/post-helper";

// Admin → Writing assistant (owner only): the playbook the /post command follows, the WhatsApp number it uses,
// the sites it never uses, and the saved knowledge the team approved.
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
export const MAX_NOTES = 40_000;
const put = (key: string, value: string) => db().prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key, value, new Date().toISOString()).run();
const get = async (key: string) => (await db().prepare("SELECT value FROM app_settings WHERE key=?").bind(key).first<{ value: string }>().catch(() => null))?.value ?? null;

export async function GET() {
  const staff = await getWaydidiAdmin();
  if (!staff || staff.role !== "owner") return reply("Owner access required.", 403);
  await ensurePostHelperTables();
  let blocked: string[] = BLOCKED_DOMAINS;
  try { const v = JSON.parse((await get("post_helper_blocked_domains")) ?? "null"); if (Array.isArray(v)) blocked = v.filter((d): d is string => typeof d === "string"); } catch { /* default */ }
  const knowledge = (await db().prepare("SELECT id,topic_key,question,status,time_sensitive,collected_at,refreshed_at,hits,approved_by,json_array_length(facts_json) facts FROM post_helper_knowledge ORDER BY status,topic_key LIMIT 300").bind().all()).results;
  return NextResponse.json({ notes: (await get("post_helper_notes")) ?? "", whatsapp: (await get("post_helper_whatsapp")) || DEFAULT_WHATSAPP, blocked, keySet: Boolean((env as unknown as Record<string, unknown>).ANTHROPIC_API_KEY), maxNotes: MAX_NOTES, knowledge }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || staff.role !== "owner") return reply("Owner access required.", 403);
  await ensurePostHelperTables();
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (input?.action === "save") {
    const notes = typeof input.notes === "string" ? input.notes.replace(/\r\n/g, "\n") : null, whatsapp = typeof input.whatsapp === "string" ? input.whatsapp.trim() : null;
    if (notes === null || notes.length > MAX_NOTES) return reply(`Paste the playbook as text, up to ${MAX_NOTES.toLocaleString("en-US")} characters.`, 400);
    if (whatsapp === null || !/^\+?[\d\s()-]{7,20}$/.test(whatsapp)) return reply("Enter the WhatsApp number, for example +66 63 206 4884.", 400);
    const blocked = Array.isArray(input.blocked) ? input.blocked.map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean) : null;
    if (!blocked || blocked.length > 100 || blocked.some((d) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d))) return reply("The blocked sites must be website names like example.com, up to 100.", 400);
    await put("post_helper_notes", notes); await put("post_helper_whatsapp", whatsapp); await put("post_helper_blocked_domains", JSON.stringify([...new Set(blocked)]));
    console.info("Writing assistant settings saved", { by: staff.email });
    return NextResponse.json({ ok: true }, { headers });
  }
  const id = typeof input?.id === "string" ? input.id : "";
  if (!id || id.length > 60) return reply("Choose a saved answer.", 400);
  const at = new Date().toISOString();
  const run = async (sql: string, ...binds: unknown[]) => (await db().prepare(sql).bind(...binds).run()).meta.changes;
  // approve: a paused entry is trusted again; retire: stop using it; delete: remove it.
  const changed = input?.action === "approve" ? await run("UPDATE post_helper_knowledge SET status='approved',approved_by=?,approved_at=? WHERE id=? AND status IN ('review','retired')", staff.displayName || staff.email, at, id)
    : input?.action === "retire" ? await run("UPDATE post_helper_knowledge SET status='retired' WHERE id=? AND status IN ('approved','review')", id)
    : input?.action === "delete" ? await run("DELETE FROM post_helper_knowledge WHERE id=?", id)
    : -1;
  if (changed === -1) return reply("Unknown action.", 400);
  return changed ? NextResponse.json({ ok: true }, { headers }) : reply("That answer changed already. Refresh the page.", 409);
}
