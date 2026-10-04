"use client";
import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import { MessageCircle, Send, UserRound, ArrowLeft } from "lucide-react";
type Conversation = { id: string; preview: string; updated_at: string; staff_id: string | null; staff_name: string | null; last_sender: string };
type Message = { id: string; sender: string; staff_name: string | null; body: string; created_at: string };
type ChatData = { conversations: Conversation[]; conversation: Conversation | null; messages: Message[]; me: { id: string; name: string }; error?: string };
export default function ChatInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]), [id, setId] = useState(""), [messages, setMessages] = useState<Message[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null), [me, setMe] = useState({ id: "", name: "" });
  const [name, setName] = useState(""), [text, setText] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const activeId = useRef(id); activeId.current = id;
  const bottom = useRef<HTMLDivElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/chat${id ? `?id=${encodeURIComponent(id)}` : ""}`, { cache: "no-store", signal });
    const data = await response.json() as ChatData;
    if (signal?.aborted || activeId.current !== id) return;
    if (!response.ok) throw new Error(data.error ?? "Chat could not be loaded.");
    setConversations(data.conversations); setMessages(data.messages); setCurrent(data.conversation); setMe(data.me);
    setName(value => value || data.me.name); setLoading(false);
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void load(controller.signal).catch(e => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Chat unavailable."); setLoading(false); } });
    refresh(); const timer = setInterval(refresh, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, id]);
  const mine = Boolean(current?.staff_id && current.staff_id === me.id);
  function select(value: string) { setId(value); setMessages([]); setCurrent(null); setText(""); setError(""); setLoading(true); }
  async function act(event: FormEvent, action: "assign" | "reply") {
    event.preventDefault(); if (busy || !id) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, name, message: text }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Chat action failed.");
      if (action === "reply") setText(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Chat action failed."); }
    finally { setBusy(false); }
  }
  return <main className="px-4 py-5 sm:px-8">
    {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid min-h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside aria-label="Customer conversations" className={`border-slate-200 md:border-r ${id ? "hidden md:block" : ""}`}>
        <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">Conversations</h2><p className="mt-1 text-xs text-slate-500">{conversations.length} active chats · updates every 5 seconds</p></div>
        <div className="max-h-[65dvh] overflow-y-auto">{!conversations.length && <p className="p-5 text-sm text-slate-500">Customer messages will appear here.</p>}
          {conversations.map(c => <button key={c.id} type="button" disabled={busy} onClick={() => select(c.id)} aria-pressed={id === c.id} className={`block w-full border-b border-slate-100 p-4 text-left disabled:opacity-60 ${id === c.id ? "bg-orange-50" : "hover:bg-slate-50"}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Customer · {c.id.slice(0, 8)}</span>{c.last_sender === "visitor" && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-[#C96100]">Customer message</span>}</div>
            <p className="mt-2 truncate text-sm text-slate-600">{c.preview || "New conversation"}</p><p className="mt-2 text-xs text-slate-500">{c.staff_name ? `Assigned to ${c.staff_name}` : "Not assigned"}</p>
          </button>)}
        </div>
      </aside>
      <section aria-label="Selected conversation" className={`min-w-0 ${id ? "flex flex-col" : "hidden md:flex md:flex-col"}`}>
        {!id ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-slate-500"><MessageCircle size={32} /><p>Select a customer chat to read messages and reply.</p></div> : <>
          <div className="flex items-center gap-3 border-b border-slate-100 p-4"><button type="button" disabled={busy} onClick={() => select("")} aria-label="All conversations" className="rounded-lg p-1 md:hidden"><ArrowLeft size={20} /></button><div><h2 className="font-semibold">Customer · {id.slice(0, 8)}</h2><p className="mt-1 text-xs text-slate-500">{loading ? "Loading conversation…" : current?.staff_name ? `Assigned to ${current.staff_name}` : "Assign an admin before replying"}</p></div></div>
          {!loading && current && !current.staff_id && <form onSubmit={e => void act(e, "assign")} className="flex flex-wrap items-end gap-3 border-b border-orange-100 bg-orange-50/60 p-4"><label className="grid flex-1 gap-1.5 text-sm font-medium"><span className="flex items-center gap-1.5"><UserRound size={15} />Your admin name</span><input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3" /><span className="text-xs font-normal text-slate-500">Customers will see this name.</span></label><button disabled={busy} className="h-10 rounded-lg bg-[#FE8B05] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Assigning…" : "Assign to me & join"}</button></form>}
          <div className="flex max-h-[55dvh] min-h-60 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">{messages.map(m => <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.sender === "staff" ? "self-end bg-orange-50" : "self-start bg-slate-100"}`}><p className="text-xs font-semibold text-slate-600">{m.sender === "staff" ? m.staff_name || "Waydidi team" : "Customer"}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p></div>)}<div ref={bottom} /></div>
          <form onSubmit={e => void act(e, "reply")} className="border-t border-slate-100 p-4"><label htmlFor="admin-chat-reply" className="mb-2 block text-sm font-medium">{mine ? `Reply as ${current?.staff_name}` : current?.staff_name ? `${current.staff_name} is handling this chat` : "Join the chat to reply"}</label><textarea id="admin-chat-reply" required maxLength={2000} rows={3} disabled={!mine || busy || loading} value={text} onChange={e => setText(e.target.value)} placeholder="Write your reply…" className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm disabled:bg-slate-50" /><button disabled={!mine || busy || loading || !text.trim()} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-[#FE8B05] px-4 text-sm font-semibold text-white disabled:opacity-50"><Send size={15} />{busy ? "Sending…" : "Send reply"}</button></form>
        </>}
      </section>
    </div>
  </main>;
}
