import { env } from "cloudflare:workers";
import { readIngest } from "@/lib/fb-leads-rules";
import { constantTimeEqual } from "@/lib/security";
import { fbLeadsOn, queueLeads } from "@/lib/telegram/fb-leads";

// Collectors (email forward, browser extension) send Facebook group posts here:
// POST {"posts":[{"url":"https://www.facebook.com/groups/<g>/posts/<p>/","text":"…","groupName":"…"}]}
// with "Authorization: Bearer <FB_LEADS_INGEST_TOKEN>". Posts are only queued; the cron drafts and sends them.
// Not found while FB_LEADS_ENABLED is off. Post text is never logged.
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!fbLeadsOn()) return new Response("Not found", { status: 404 });
  const token = String((env as unknown as Record<string, string | undefined>).FB_LEADS_INGEST_TOKEN ?? "");
  const given = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  if (!given || !constantTimeEqual(given, token)) return json({ error: "Unauthorized" }, 401);
  const raw = await request.text();
  if (raw.length > 200_000) return json({ error: "Too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
  const read = readIngest(body);
  if ("error" in read) return json({ error: read.error }, 400);
  try {
    const { accepted, duplicates } = await queueLeads(read.posts);
    return json({ accepted, duplicates, rejected: read.rejected });
  } catch (error) {
    console.error("fb leads ingest failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Please retry." }, 503);
  }
}
