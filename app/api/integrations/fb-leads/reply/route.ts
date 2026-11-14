import { readReplyRequest } from "@/lib/fb-leads-rules";
import { collectorAuthorized, replyQueue, replyQueueOn } from "@/lib/telegram/fb-leads";

// The browser extension's reply queue: POST {"action":"next"} (or {"action":"next","id":"<lead>"}) hands out one
// drafted lead to open; {"action":"posted"|"skipped"|"release","id":"<lead>"} marks it. Same token as the collector
// ("Authorization: Bearer <FB_LEADS_INGEST_TOKEN>"). Not found until FB_LEADS_REPLY_QUEUE_ENABLED=true. Nothing is
// posted on Facebook from here: a person presses Post there. Comments are never logged.
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!replyQueueOn()) return new Response("Not found", { status: 404 });
  if (!collectorAuthorized(request)) return json({ error: "Unauthorized" }, 401);
  const raw = await request.text();
  if (raw.length > 2_000) return json({ error: "Too large." }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON." }, 400); }
  const req = readReplyRequest(body);
  if ("error" in req) return json({ error: req.error }, 400);
  try {
    const answer = await replyQueue(req);
    return json(answer, "error" in answer ? (answer.error === "not_found" ? 404 : 409) : 200);
  } catch (error) {
    console.error("fb leads reply queue failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Please retry." }, 503);
  }
}
