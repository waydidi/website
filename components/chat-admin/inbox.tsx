"use client";

import { ArrowLeft, Globe, Mail, MessageCircle, Phone, Search, SendHorizontal, Tag, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { countryLabel } from "@/lib/country";

type Row = { id: string; public_id: string; status: string; customer_name: string | null; customer_email: string | null; source_title: string | null; source_url: string | null; assigned_name: string | null; assigned_staff_id: string | null; last_message_at: string | null; unread: number; preview: string | null; last_sender: string | null; channel?: string; follow_up_at?: string | null; read_by?: string | null; read_at?: string | null };
type Detail = Row & { customer_country: string | null; customer_phone: string | null; customer_id: string | null; topic: string | null; created_at: string; on_telegram: boolean; bot_paused: boolean; read_seq?: number; quiet?: boolean; follow_up_at?: string | null };
type Msg = { seq: number; id: string; sender: "visitor" | "staff"; sender_name: string | null; is_bot?: number; body: string; created_at: string; telegram_status: string | null };
type Data = { conversations: Row[]; conversation: Detail | null; messages: Msg[]; selectionError: string | null; team: { id: string; name: string }[]; me: { id: string; name: string }; cee?: { enabled: boolean; keySet: boolean } };

const FILTERS: [string, string][] = [["active", "Active"], ["open", "Open"], ["pending", "Pending"], ["closed", "Closed"], ["mine", "Mine"], ["unassigned", "Unassigned"]];
const STATUS: Record<string, [string, string]> = { open: ["Open", "bg-emerald-50 text-emerald-700"], pending: ["Pending", "bg-amber-50 text-amber-800"], closed: ["Closed", "bg-slate-100 text-slate-600"] };
const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), today = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat(undefined, today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(d);
};
const who = (r: { customer_name: string | null; public_id: string }) => r.customer_name || `Guest · ${r.public_id}`;

export function ChatInbox() {
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (id) p.set("id", id);
    if (filter === "mine") p.set("mine", "1"); else if (filter === "unassigned") p.set("unassigned", "1"); else p.set("status", filter);
    if (q.trim()) p.set("q", q.trim());
    const res = await fetch(`/api/admin/chat?${p}`, { cache: "no-store" });
    const out = await res.json().catch(() => ({})) as Data & { error?: string };
    if (!res.ok) throw new Error(out.error ?? "Chat could not be loaded.");
    setData(out); setError("");
  }, [id, filter, q]);
  useEffect(() => {
    let stop = false;
    const run = () => { if (!document.hidden) void load().catch((e) => { if (!stop) setError(e instanceof Error ? e.message : "Chat unavailable."); }); };
    const first = window.setTimeout(run, q ? 300 : 0), timer = window.setInterval(run, 4000);
    return () => { stop = true; window.clearTimeout(first); window.clearInterval(timer); };
  }, [load, q]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [data?.messages.length, id]);

  const select = (value: string) => router.push(value ? `/admin/chat?id=${encodeURIComponent(value)}` : "/admin/chat");
  async function act(body: Record<string, unknown>) {
    if (busy || !id) return false;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Chat action failed.");
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Chat action failed."); return false; }
    finally { setBusy(false); }
  }
  async function saveAsKnowledge(messageId: string) {
    const res = await fetch("/api/admin/cee/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "from_chat", messageId }) });
    setError(res.ok ? "" : ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
    if (res.ok) window.alert("Saved as a draft note. Check it under Non knowledge and make it live.");
  }
  async function send(e: FormEvent) { e.preventDefault(); if (text.trim() && await act({ action: "reply", message: text.trim() })) setText(""); }

  const c = data?.conversation ?? null;
  const me = data?.me;
  const lockedByOther = Boolean(c?.assigned_name && c.assigned_staff_id !== me?.id);

  return <>
    {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {data?.selectionError && <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{data.selectionError}</p>}
    <section className="grid h-[calc(100dvh-230px)] min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_280px]">
      {/* Inbox */}
      <aside aria-label="Conversations" className={`flex min-h-0 flex-col border-slate-200 md:border-r ${id ? "max-md:hidden" : ""}`}>
        <div className="border-b border-slate-100 p-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-[#FE8B05]"><Search size={15} className="text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, WD-number, text" aria-label="Search conversations" className="h-10 min-w-0 flex-1 bg-transparent text-[14px] outline-none" /></label>
          <div className="mt-2 flex flex-wrap gap-1.5">{FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${filter === k ? "bg-[#FFF0DF] text-[#C96100]" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>)}</div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {data && !data.conversations.length && <li className="p-6 text-center text-[14px] text-slate-500">No conversations need your attention.</li>}
          {!data && Array.from({ length: 4 }, (_, i) => <li key={i} className="m-3 h-16 animate-pulse rounded-xl bg-slate-100" />)}
          {data?.conversations.map((r) => <li key={r.id}><button type="button" onClick={() => select(r.id)} aria-current={id === r.id} className={`block w-full border-b border-slate-100 px-4 py-3 text-left ${id === r.id ? "bg-orange-50" : "hover:bg-slate-50"}`}>
            <span className="flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-[14px] ${r.unread ? "font-bold" : "font-semibold"}`}>{who(r)}</span>{r.channel && r.channel !== "web" && <span className={`shrink-0 rounded-full px-1.5 text-[10.5px] font-bold text-white ${r.channel === "whatsapp" ? "bg-[#25D366]" : "bg-[#06C755]"}`}>{r.channel === "whatsapp" ? "WhatsApp" : "LINE"}</span>}<span className="shrink-0 text-[11.5px] text-slate-500">{when(r.last_message_at)}</span></span>
            <span className="mt-0.5 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">{r.last_sender === "staff" ? "Staff: " : ""}{r.preview ?? "New conversation"}</span>{r.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#FE8B05] px-1.5 text-[11px] font-bold text-white">{r.unread}</span>}</span>
            <span className="mt-1 flex items-center gap-2 text-[11.5px] text-slate-500"><span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS[r.status]?.[1] ?? ""}`}>{STATUS[r.status]?.[0] ?? r.status}</span>{r.follow_up_at && r.status !== "closed" && <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800">Follow up</span>}<span className="truncate">{r.assigned_name ?? "Unassigned"}{r.source_title ? ` · ${r.source_title}` : ""}</span>{!r.unread && r.last_sender === "visitor" && r.read_by && <span className="ml-auto shrink-0 font-semibold text-sky-700">✓ Read by {r.read_by}</span>}</span>
          </button></li>)}
        </ul>
      </aside>

      {/* Thread */}
      <section aria-label="Conversation" className={`flex min-h-0 min-w-0 flex-col ${id ? "" : "max-md:hidden"}`}>
        {!id ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500"><MessageCircle size={32} /><p>Choose a conversation to read and reply.</p></div> : <>
          <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <button type="button" onClick={() => select("")} aria-label="All conversations" className="rounded-lg p-1 md:hidden"><ArrowLeft size={20} /></button>
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{c ? who(c) : "Loading…"}</h2><p className="text-[12px] text-slate-500">{c ? `${c.public_id} · ${c.assigned_name ? `Assigned to ${c.assigned_name}` : "Unassigned"}` : ""}</p></div>
            {c && <select aria-label="Status" value={c.status} disabled={busy} onChange={(e) => void act({ action: "status", status: e.target.value })} className="h-9 rounded-lg border border-slate-200 px-2 text-[13px]">{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8FA] p-4" aria-live="polite">
            {data?.messages.map((m) => <div key={m.id} className={`mb-3 flex flex-col ${m.sender === "staff" ? "items-end" : "items-start"}`}>
              <span className="mb-1 text-[11.5px] font-semibold text-slate-500">{m.sender === "staff" ? (m.is_bot ? "🤖 Non (bot)" : m.sender_name ?? "Waydidi team") : "Customer"} · {when(m.created_at)}</span>
              <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[14px] ${m.sender === "staff" ? (m.is_bot ? "rounded-br-md bg-slate-700 text-white" : "rounded-br-md bg-[#FE8B05] text-white") : "rounded-bl-md border border-slate-200 bg-white"}`}>{m.body}</p>
              {m.sender === "visitor" && c?.read_by && m.seq === c.read_seq && <span className="mt-1 text-[11.5px] font-semibold text-sky-700">✓ Read by {c.read_by}{c.read_at ? ` · ${when(c.read_at)}` : ""}</span>}
              {m.sender === "staff" && !m.is_bot && <button type="button" onClick={() => void saveAsKnowledge(m.id)} className="mt-1 text-[11.5px] font-semibold text-slate-500 underline">Save as Non knowledge</button>}
              {m.sender === "visitor" && m.telegram_status === "failed" && <button type="button" onClick={() => void act({ action: "retry_telegram", messageId: m.id })} className="mt-1 text-[11.5px] font-semibold text-red-600 underline">Not on Telegram yet · retry</button>}
            </div>)}
            <div ref={bottom} />
          </div>
          <form onSubmit={send} className="border-t border-slate-100 p-3">
            {lockedByOther ? <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-[13.5px]"><span className="flex-1">{c?.assigned_name} is handling this chat.</span><button type="button" disabled={busy} onClick={() => void act({ action: "assign" })} className="h-9 rounded-full border border-slate-200 bg-white px-3 font-semibold">Take over</button></div>
              : <div className="flex items-end gap-2 rounded-2xl border border-slate-200 p-1.5 pl-3 focus-within:border-[#FE8B05]">
                <label htmlFor="admin-chat-reply" className="sr-only">Reply</label>
                <textarea id="admin-chat-reply" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(e); } }}
                  placeholder={c?.assigned_name ? `Reply as ${me?.name}…` : `Reply as ${me?.name} (you'll be assigned)…`} className="min-h-[44px] flex-1 resize-none bg-transparent py-1.5 text-[14px] outline-none" />
                <button disabled={busy || !text.trim()} aria-label="Send reply" className="grid size-10 place-items-center rounded-full bg-[#FE8B05] text-white disabled:bg-slate-300"><SendHorizontal size={17} /></button>
              </div>}
          </form>
        </>}
      </section>

      {/* Details */}
      {c && <aside aria-label="Customer details" className="hidden min-h-0 overflow-y-auto border-l border-slate-200 p-4 text-[13.5px] xl:block">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Customer</h3>
        <p className="mt-2 flex items-center gap-2 font-semibold"><UserRound size={15} className="text-slate-400" />{c.customer_name ?? "Not given"}{c.customer_id && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Member</span>}</p>
        {c.customer_email && <p className="mt-1.5 flex items-center gap-2"><Mail size={15} className="text-slate-400" /><a className="truncate underline" href={`mailto:${c.customer_email}`}>{c.customer_email}</a></p>}
        {countryLabel(c.customer_country) && <p className="mt-1.5 flex items-center gap-2"><Globe size={15} className="text-slate-400" />{countryLabel(c.customer_country)} <span className="text-[12px] text-slate-500">(where they chatted from)</span></p>}
        {c.customer_phone && <p className="mt-1.5 flex items-center gap-2"><Phone size={15} className="text-slate-400" /><a className="underline" href={`tel:${c.customer_phone}`}>{c.customer_phone}</a></p>}
        <h3 className="mt-5 text-[12px] font-bold uppercase tracking-wide text-slate-500">Started from</h3>
        <p className="mt-2 flex items-start gap-2"><Globe size={15} className="mt-0.5 shrink-0 text-slate-400" />{c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer" className="underline">{c.source_title || c.source_url}</a> : "Unknown page"}</p>
        {c.topic && <p className="mt-1.5 flex items-center gap-2"><Tag size={15} className="text-slate-400" />{c.topic}</p>}
        <h3 className="mt-5 text-[12px] font-bold uppercase tracking-wide text-slate-500">Assigned</h3>
        <select aria-label="Assign to" value={c.assigned_staff_id ?? ""} disabled={busy} onChange={(e) => void act(e.target.value ? { action: "assign", staffId: e.target.value } : { action: "unassign" })} className="mt-2 h-9 w-full rounded-lg border border-slate-200 px-2">
          <option value="">{c.assigned_name && !c.assigned_staff_id ? `${c.assigned_name} (Telegram)` : "Unassigned"}</option>
          {data?.team.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === me?.id ? " (me)" : ""}</option>)}
        </select>
        {c.status !== "closed" && c.quiet && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="font-semibold text-amber-900">No messages for 15 minutes</p>
          <p className="mt-0.5 text-[12.5px] text-amber-800">Finish the chat, or keep it to follow up if the customer is still deciding.</p>
          <div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => void act({ action: "complete" })} className="h-9 flex-1 rounded-full bg-emerald-600 px-3 text-[13px] font-semibold text-white">✓ Completed</button><button type="button" disabled={busy} onClick={() => void act({ action: "follow_up" })} className="h-9 flex-1 rounded-full border border-violet-300 bg-white px-3 text-[13px] font-semibold text-violet-800">Follow up</button></div>
        </div>}
        {c.follow_up_at && c.status !== "closed" && <p className="mt-3 rounded-lg bg-violet-50 p-2 text-[12.5px] font-semibold text-violet-800">Marked for follow-up {new Date(c.follow_up_at).toLocaleString()}</p>}
        <h3 className="mt-5 text-[12px] font-bold uppercase tracking-wide text-slate-500">Non (quote bot)</h3>
        {!data?.cee?.keySet ? <p className="mt-2 text-slate-600">Off: add ANTHROPIC_API_KEY in Cloudflare to turn Non on.</p> : <>
          <p className="mt-2 text-slate-600">{!data.cee.enabled ? "Non is off for all chats." : c.assigned_name || c.bot_paused ? "Non is quiet in this chat (a person has it)." : "Non is answering this chat."}</p>
          {data.cee.enabled && !c.assigned_name && <button type="button" disabled={busy} onClick={() => void act({ action: c.bot_paused ? "cee_resume" : "cee_pause" })} className="mt-2 h-9 rounded-full border border-slate-200 bg-white px-3 font-semibold">{c.bot_paused ? "Let Non answer again" : "Stop Non in this chat"}</button>}
          <label className="mt-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={data.cee.enabled} disabled={busy} onChange={(e) => void act({ action: "cee_enabled", on: e.target.checked })} className="accent-[#FE8B05]" />Non on for all chats (owner)</label>
        </>}
        <p className="mt-5 text-[12px] text-slate-500">{c.public_id} · started {new Date(c.created_at).toLocaleString()}</p>
      </aside>}
    </section>
  </>;
}
