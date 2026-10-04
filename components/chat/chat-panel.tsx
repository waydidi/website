"use client";

import { ArrowDown, ArrowLeft, Minus, RotateCw, SendHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { WaydidiMark } from "@/components/waydidi-logo";
import type { ChatInfo, ChatMsg, Context } from "@/components/website-chat";

const QUICK = ["Airport transfer", "Private driver", "Day trip", "Existing booking", "Something else"];
const time = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function ChatPanel({ info, messages, loadError, onRetryLoad, onSend, onClose }: {
  info: ChatInfo; messages: ChatMsg[]; loadError: boolean; onRetryLoad: () => void;
  onSend: (body: string, ctx: Context, retryOf?: ChatMsg) => Promise<string | null>; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [details, setDetails] = useState({ name: "", email: "", open: false, saved: false });
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const count = useRef(messages.length);
  const panel = useRef<HTMLElement>(null);

  // Mobile: keep the composer above the on-screen keyboard by following the visual viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => { if (panel.current && window.innerWidth < 640) panel.current.style.height = `${vv.height}px`; };
    fit(); vv.addEventListener("resize", fit);
    return () => vv.removeEventListener("resize", fit);
  }, []);
  useEffect(() => { input.current?.focus(); const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [onClose]);

  // New messages: follow along when the reader is at the bottom; otherwise offer "New message".
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const grew = messages.length > count.current, mine = messages.at(-1)?.sender === "visitor";
    count.current = messages.length;
    if (atBottom.current || mine || !grew) { el.scrollTop = el.scrollHeight; setNewBelow(false); }
    else if (grew) setNewBelow(true);
  }, [messages]);
  const onScroll = () => { const el = list.current!; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; if (atBottom.current) setNewBelow(false); };

  async function submit(body = text) {
    const value = body.trim();
    if (!value || busy) return;
    setBusy(true); setError("");
    if (body === text) setText("");
    const failed = await onSend(value, { topic });
    if (failed) setError(failed);
    else if (!details.saved && !info?.name) setDetails((d) => ({ ...d, open: true }));
    setBusy(false);
  }
  function key(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards keep Enter for new lines.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); void submit(); }
  }
  async function saveDetails() {
    const res = await fetch("/api/chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: details.name, email: details.email }) });
    if (res.ok) setDetails((d) => ({ ...d, open: false, saved: true }));
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Details couldn't be saved.");
  }

  const subtitle = info?.agent ? `${info.agent} is helping you` : "We're here to help";
  const started = messages.length > 0;

  return <section ref={panel} role="dialog" aria-modal="false" aria-labelledby="ask-waydidi-title"
    className="fixed inset-0 z-[90] flex flex-col overflow-hidden bg-white text-[#15161C] sm:inset-auto sm:bottom-[calc(6.5rem+env(safe-area-inset-bottom))] sm:right-6 sm:h-[min(640px,calc(100dvh-8.5rem))] sm:w-[390px] sm:rounded-[22px] sm:border sm:border-slate-200 sm:shadow-[0_24px_60px_rgba(15,23,42,.18)] motion-safe:animate-in motion-safe:fade-in">
    {/* Header */}
    <header className="flex items-center gap-3 bg-[#FE8B05] px-4 pb-3.5 pt-[max(14px,env(safe-area-inset-top))] text-white">
      <button type="button" onClick={onClose} aria-label="Close chat" className="-ml-1 grid size-9 place-items-center rounded-full hover:bg-white/15 sm:hidden"><ArrowLeft size={20} /></button>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white"><WaydidiMark className="size-6 text-[#FE8B05]" /></span>
      <div className="min-w-0 flex-1"><h2 id="ask-waydidi-title" className="text-[16px] font-bold leading-tight">Ask Waydidi</h2><p className="truncate text-[13px] text-white/90">{subtitle}</p></div>
      <button type="button" onClick={onClose} aria-label="Minimise chat" className="hidden size-9 place-items-center rounded-full hover:bg-white/15 sm:grid"><Minus size={18} /></button>
      <button type="button" onClick={onClose} aria-label="Close chat" className="hidden size-9 place-items-center rounded-full hover:bg-white/15 sm:grid"><X size={18} /></button>
    </header>

    {/* Conversation */}
    <div ref={list} onScroll={onScroll} aria-live="polite" aria-label="Conversation" className="relative min-h-0 flex-1 overflow-y-auto bg-[#F7F8FA] px-4 py-4">
      <Bubble side="left" who="Waydidi">Hi 👋 How can we help with your Thailand journey?</Bubble>
      {!started && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick topics">
        {QUICK.map((q) => <button key={q} type="button" aria-pressed={topic === q} onClick={() => { setTopic(q); setText((t) => t || `${q}: `); input.current?.focus(); }}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${topic === q ? "border-[#FE8B05] bg-[#FFF3E6] text-[#B85D00]" : "border-slate-200 bg-white text-slate-700 hover:border-[#FE8B05]"}`}>{q}</button>)}
      </div>}
      {loadError && !started && <div className="mt-4 rounded-xl bg-white p-3 text-[13px] text-slate-600">We&apos;re having trouble loading this conversation. <button type="button" onClick={onRetryLoad} className="font-semibold text-[#B85D00] underline">Retry</button></div>}
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const grouped = prev && prev.sender === m.sender && prev.name === m.name;
        return m.sender === "visitor"
          ? <div key={m.id} className={`flex flex-col items-end ${grouped ? "mt-1" : "mt-4"}`}>
              <p className="max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-md bg-[#FE8B05] px-3.5 py-2.5 text-[14.5px] leading-snug text-white">{m.body}</p>
              <span className="mt-1 text-[11.5px] text-slate-500">{m.state === "sending" ? "Sending…" : m.state === "failed"
                ? <span className="text-red-600">Not sent · <button type="button" className="font-semibold underline" onClick={() => void onSend(m.body, { topic }, m)}>Try again</button></span>
                : time(m.createdAt)}</span>
            </div>
          : <Bubble key={m.id} side="left" who={grouped ? null : `${m.name ?? "Waydidi team"} — Waydidi`} at={time(m.createdAt)} tight={Boolean(grouped)}>{m.body}</Bubble>;
      })}
      {details.open && <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 text-[13.5px]">
        <p className="font-semibold">Want a reply by email too? <span className="font-normal text-slate-500">(optional)</span></p>
        <div className="mt-2 grid gap-2">
          <input aria-label="Your name" placeholder="Your name" autoComplete="name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#FE8B05]" />
          <input aria-label="Your email" type="email" placeholder="Email" autoComplete="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} className="h-10 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#FE8B05]" />
        </div>
        <div className="mt-2 flex gap-3"><button type="button" disabled={!details.name && !details.email} onClick={() => void saveDetails()} className="h-9 rounded-full bg-[#FE8B05] px-4 font-semibold text-white disabled:opacity-50">Save</button>
          <button type="button" onClick={() => setDetails({ ...details, open: false, saved: true })} className="font-semibold text-slate-500">No thanks</button></div>
      </div>}
    </div>
    {newBelow && <button type="button" onClick={() => { list.current!.scrollTop = list.current!.scrollHeight; setNewBelow(false); }} className="absolute bottom-[86px] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#15161C] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-lg"><ArrowDown size={14} />New message</button>}

    {/* Composer */}
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="border-t border-slate-200 bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      {error && <p role="alert" className="mb-2 flex items-center gap-2 text-[12.5px] text-red-600">{error}{loadError && <button type="button" onClick={onRetryLoad} aria-label="Retry"><RotateCw size={13} /></button>}</p>}
      <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-[#F7F8FA] py-1.5 pl-4 pr-1.5 focus-within:border-[#FE8B05]">
        <label htmlFor="ask-waydidi-input" className="sr-only">Type your message</label>
        <textarea id="ask-waydidi-input" ref={input} rows={1} maxLength={2000} value={text} onKeyDown={key}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
          placeholder="Type your message..." className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send message" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FE8B05] text-white transition hover:bg-[#E67900] disabled:bg-slate-300"><SendHorizontal size={17} /></button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">Please don&apos;t share card numbers or passwords in chat.</p>
    </form>
  </section>;
}

function Bubble({ side, who, at, tight, children }: { side: "left"; who: string | null; at?: string; tight?: boolean; children: React.ReactNode }) {
  void side;
  return <div className={`flex flex-col items-start ${tight ? "mt-1" : "mt-4 first:mt-0"}`}>
    {who && <span className="mb-1 ml-1 text-[12px] font-semibold text-slate-600">{who}</span>}
    <p className="max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-[14.5px] leading-snug text-[#15161C]">{children}</p>
    {at && <span className="ml-1 mt-1 text-[11.5px] text-slate-500">{at}</span>}
  </div>;
}
