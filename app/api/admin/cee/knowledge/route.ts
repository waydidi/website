import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";
import { MODELS, ceeEnabled, modelMode, setModelMode, usageFor, type ModelMode } from "@/lib/cee/bot";
import { deleteNote, listNotes, parseMarkdown, saveNote, validNote } from "@/lib/cee/knowledge";
import { lineConfigured, whatsappConfigured } from "@/lib/channels";

// Cee's knowledge notes, model choice and monthly cost. Support staff edit notes; the owner picks the model.
const headers = { "Cache-Control": "no-store" };
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const allowed = (role: string) => ["owner", "support", "operations"].includes(role);

export async function GET(request: Request) {
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Support staff access required.", 403);
  const url = new URL(request.url);
  const notes = await listNotes((url.searchParams.get("q") ?? "").trim().slice(0, 80), { kind: url.searchParams.get("kind") ?? "", active: url.searchParams.get("active") ?? "" });
  const vars = env as unknown as Record<string, unknown>;
  return NextResponse.json({
    notes, owner: staff.role === "owner",
    cee: { enabled: await ceeEnabled(), keySet: Boolean(vars.ANTHROPIC_API_KEY), mapsKeySet: Boolean(vars.GOOGLE_MAPS_SERVER_KEY), mode: await modelMode(), models: MODELS, usage: await usageFor() },
    channels: { whatsapp: whatsappConfigured(), line: lineConfigured() },
  }, { headers });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return reply("Request blocked.", 403);
  const staff = await getWaydidiAdmin();
  if (!staff || !allowed(staff.role)) return reply("Support staff access required.", 403);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  switch (input.action) {
    case "save": {
      const note = validNote(input);
      if (typeof note === "string") return reply(note, 400);
      const id = await saveNote({ ...note, createdBy: staff.displayName }, typeof input.id === "string" ? input.id : undefined);
      return NextResponse.json({ ok: true, id }, { headers });
    }
    case "delete":
      if (typeof input.id !== "string") return reply("Choose a note.", 400);
      await deleteNote(input.id);
      return NextResponse.json({ ok: true }, { headers });
    case "import": {
      if (typeof input.markdown !== "string" || !input.markdown.trim()) return reply("Paste or choose a Markdown file.", 400);
      if (input.markdown.length > 400000) return reply("That file is too big (max 400 KB per import).", 400);
      const fallback = typeof input.filename === "string" ? input.filename.replace(/\.md$/i, "").slice(0, 160) || undefined : undefined;
      const notes = parseMarkdown(input.markdown, fallback);
      if (!notes.length) return reply("No notes found. Start each note with a # heading.", 400);
      for (const n of notes) await saveNote({ ...n, source: "markdown", createdBy: staff.displayName });
      return NextResponse.json({ ok: true, imported: notes.length }, { headers });
    }
    case "from_chat": {
      // A staff answer from a chat becomes a draft note (inactive until someone checks and turns it on).
      if (typeof input.messageId !== "string") return reply("Choose a message.", 400);
      const m = await env.DB.prepare("SELECT conversation_id,body,rowid seq FROM website_chat_messages WHERE id=? AND sender='staff'").bind(input.messageId).first() as { conversation_id: string; body: string; seq: number } | null;
      if (!m) return reply("Message not found.", 404);
      const q = await env.DB.prepare("SELECT body FROM website_chat_messages WHERE conversation_id=? AND sender='visitor' AND rowid<? ORDER BY rowid DESC LIMIT 1").bind(m.conversation_id, m.seq).first() as { body: string } | null;
      const id = await saveNote({ title: (q?.body ?? "Answer from chat").replace(/\s+/g, " ").slice(0, 160), kind: "faq", body: m.body.slice(0, 4000), active: false, source: "chat", createdBy: staff.displayName });
      return NextResponse.json({ ok: true, id }, { headers });
    }
    case "mode": {
      if (staff.role !== "owner") return reply("Only the owner can change Cee's model.", 403);
      if (!["auto", "fast", "smart"].includes(input.mode as string)) return reply("Unknown mode.", 400);
      await setModelMode(input.mode as ModelMode);
      return NextResponse.json({ ok: true }, { headers });
    }
    default: return reply("Unknown action.", 400);
  }
}
