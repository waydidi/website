"use client";

import { ArrowDown, ArrowLeft, CircleHelp, ExternalLink, Minus, RotateCw, SendHorizontal, Star, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { WaydidiMark } from "@/components/waydidi-logo";
import { RichCard } from "@/components/chat/rich-card";
import type { ChatInfo, ChatMsg, ChatReview, Context } from "@/components/website-chat";

const QUICK = ["Airport transfer", "Private driver", "Day trip", "Existing booking", "Something else"];
const time = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function ChatPanel({ info, messages, loadError, onRetryLoad, onSend, onClose, onReviewed, onNewConversation }: {
  info: ChatInfo; messages: ChatMsg[]; loadError: boolean; onRetryLoad: () => void;
  onSend: (body: string, ctx: Context, retryOf?: ChatMsg) => Promise<string | null>; onClose: () => void;
  onReviewed: () => void; onNewConversation: () => void;
}) {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [email, setEmail] = useState("");
  // Before the first message the customer gives an email so the team can always reply.
  const needsEmail = !info && messages.length === 0;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const count = useRef(messages.length);
  const panel = useRef<HTMLElement>(null);

  // Phones: the panel fills exactly the visible area, so the keyboard sits right under the
  // composer. iOS scrolls the page when the keyboard opens, so the panel follows the visual
  // viewport (top + height) and the page behind is locked while the chat is open.
  useEffect(() => {
    if (window.innerWidth >= 640) return;
    const vv = window.visualViewport;
    const body = document.body, html = document.documentElement, y = window.scrollY;
    const saved = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: html.style.overflow };
    body.style.position = "fixed"; body.style.top = `-${y}px`; body.style.width = "100%"; html.style.overflow = "hidden";
    const fit = () => {
      const el = panel.current;
      if (!el || !vv) return;
      el.style.top = `${vv.offsetTop}px`; el.style.bottom = "auto"; el.style.height = `${vv.height}px`;
      list.current && atBottom.current && (list.current.scrollTop = list.current.scrollHeight);
    };
    fit(); vv?.addEventListener("resize", fit); vv?.addEventListener("scroll", fit);
    return () => {
      vv?.removeEventListener("resize", fit); vv?.removeEventListener("scroll", fit);
      body.style.position = saved.position; body.style.top = saved.top; body.style.width = saved.width; html.style.overflow = saved.overflow;
      window.scrollTo(0, y);
    };
  }, []);
  useEffect(() => { if (window.matchMedia("(hover: hover)").matches) input.current?.focus(); const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [onClose]);

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
    if (needsEmail && !emailOk) { setError("Enter your email address to start the chat."); return; }
    setBusy(true); setError("");
    if (body === text) setText("");
    const failed = await onSend(value, { topic, email: needsEmail ? email.trim() : undefined });
    if (failed) setError(failed);
    setBusy(false);
  }
  function key(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Enter sends, Shift+Enter adds a line. Touch keyboards keep Enter for new lines.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(hover: hover)").matches) { e.preventDefault(); void submit(); }
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

    {/* Step 1: question + email (required). Step 2 (after sending) is the conversation. */}
    {needsEmail ? <StartForm question={text} setQuestion={setText} email={email} setEmail={(v) => { setEmail(v); setError(""); }} topic={topic} setTopic={setTopic}
      busy={busy} error={error} onStart={() => void submit()} /> : <>
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
              <p translate="no" className="max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-md bg-[#FE8B05] px-3.5 py-2.5 text-[14.5px] leading-snug text-white">{m.body}</p>
              <span className="mt-1 text-[11.5px] text-slate-500">{m.state === "sending" ? "Sending…" : m.state === "failed"
                ? <span className="text-red-600">Not sent · <button type="button" className="font-semibold underline" onClick={() => void onSend(m.body, { topic }, m)}>Try again</button></span>
                : time(m.createdAt)}</span>
            </div>
          : m.card
            ? <div key={m.id} className={`flex flex-col items-start ${grouped ? "mt-1.5" : "mt-4"}`}>{!grouped && <span className="mb-1 ml-1 text-[12px] font-semibold text-slate-600">{`${m.name ?? "Waydidi team"} — Waydidi`}</span>}<RichCard card={m.card} onShareLocation={(t) => void onSend(t, { topic })} /><span className="ml-1 mt-1 text-[11.5px] text-slate-500">{time(m.createdAt)}</span></div>
            : <Bubble key={m.id} side="left" who={grouped ? null : `${m.name ?? "Waydidi team"} — Waydidi`} at={time(m.createdAt)} tight={Boolean(grouped)}>{m.body}</Bubble>;
      })}
      {info?.typing && <p role="status" className="mt-4 inline-flex items-center gap-2 rounded-[18px] rounded-bl-md bg-white px-3.5 py-2.5 text-[13.5px] text-slate-500 shadow-sm">
        <span className="inline-flex gap-1" aria-hidden="true">{[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />)}</span>Non is typing…</p>}
    </div>
    </>}
    {newBelow && <button type="button" onClick={() => { list.current!.scrollTop = list.current!.scrollHeight; setNewBelow(false); }} className="absolute bottom-[86px] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#15161C] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-lg"><ArrowDown size={14} />New message</button>}

    {/* Finished chat: support rating, then the Google link (offered after every rating), or the composer */}
    {needsEmail ? null : info?.status === "closed" ? <ClosedChat key={info.publicId} review={info.review ?? null} onReviewed={onReviewed} onNewConversation={onNewConversation} onClose={onClose} /> : <>
    {/* Composer */}
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="border-t border-slate-200 bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      {error && <p role="alert" className="mb-2 flex items-center gap-2 text-[12.5px] text-red-600">{error}{loadError && <button type="button" onClick={onRetryLoad} aria-label="Retry"><RotateCw size={13} /></button>}</p>}
      <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-[#F7F8FA] py-1.5 pl-4 pr-1.5 focus-within:border-[#FE8B05]">
        <label htmlFor="ask-waydidi-input" className="sr-only">Type your message</label>
        <textarea id="ask-waydidi-input" ref={input} rows={1} maxLength={2000} value={text} onKeyDown={key}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
          placeholder="Type your message..." className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none" />
        <button type="submit" disabled={busy || !text.trim() || (needsEmail && !emailOk)} aria-label="Send message" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FE8B05] text-white transition hover:bg-[#E67900] disabled:bg-slate-300"><SendHorizontal size={17} /></button>
      </div>
      {info && <p className="mt-2 text-center"><button type="button" disabled={busy} onClick={() => { if (window.confirm("Leave this chat? It will be closed and you can rate it.")) void fetch("/api/chat", { method: "DELETE" }).then(() => onReviewed()).catch(() => undefined); }} className="text-[12.5px] font-semibold text-slate-500 underline-offset-2 hover:text-[#C96100] hover:underline">Leave this chat</button></p>}
      <p className="mt-1 text-center text-[11px] text-slate-400">Please don&apos;t share card numbers or passwords in chat.</p>
    </form>
    </>}
  </section>;
}

function Bubble({ side, who, at, tight, children }: { side: "left"; who: string | null; at?: string; tight?: boolean; children: React.ReactNode }) {
  void side;
  return <div className={`flex flex-col items-start ${tight ? "mt-1" : "mt-4 first:mt-0"}`}>
    {who && <span className="mb-1 ml-1 text-[12px] font-semibold text-slate-600">{who}</span>}
    <p translate="no" className="max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-[14.5px] leading-snug text-[#15161C]">{typeof children === "string" ? highlightPaid(children) : children}</p>
    {at && <span className="ml-1 mt-1 text-[11.5px] text-slate-500">{at}</span>}
  </div>;
}

const LABEL = ["", "Very poor", "Poor", "Okay", "Good", "Excellent"];
const event = (name: string) => fetch("/api/chat/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "event", event: name }) }).catch(() => undefined);

/** Waydidi's own support rating. It is never sent to Google; the Google link is a separate, optional step for everyone. */
function ClosedChat({ review, onReviewed, onNewConversation, onClose }: { review: ChatReview; onReviewed: () => void; onNewConversation: () => void; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ rating: number; googleUrl: string | null } | null>(null);
  const done = result ?? (review?.submitted ? { rating: review.rating ?? 0, googleUrl: review.googleUrl } : null);
  const picked = useRef(false);

  useEffect(() => { if (!done) void event("prompt_viewed"); else if (done.googleUrl) void event("google_cta_viewed"); }, [Boolean(done)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!rating || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/chat/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, feedback: feedback.trim() || null, consentToPublish: consent }) });
      const out = await res.json().catch(() => ({})) as { error?: string; rating?: number; googleUrl?: string | null };
      if (!res.ok) throw new Error(out.error ?? "Your feedback couldn't be sent. Please try again.");
      setResult({ rating: out.rating ?? rating, googleUrl: out.googleUrl ?? null }); onReviewed();
    } catch (e) { setError(e instanceof Error ? e.message : "Your feedback couldn't be sent."); }
    finally { setBusy(false); }
  }

  const shown = hover || rating;
  return <div className="max-h-[60%] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-4">
    <p className="text-center text-[12px] font-semibold uppercase tracking-wide text-slate-500">Conversation completed</p>
    {done ? <div className="mt-2 text-center">
      <h3 className="text-[17px] font-bold">Thank you for your feedback!</h3>
      <p className="mt-1 text-[14px] text-slate-600">{done.rating && done.rating <= 2 ? "We're sorry the experience didn't meet your expectations. Your feedback has been shared with our team." : "Your feedback helps us improve the Waydidi experience."}</p>
      {done.googleUrl && <>
        <p className="mt-3 text-[14px] text-slate-600">Would you also like to share your experience with other travelers?</p>
        <a href={done.googleUrl} target="_blank" rel="noopener noreferrer" onClick={() => void event("google_cta_clicked")}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FE8B05] px-5 font-semibold text-white hover:bg-[#E67900]">Review Waydidi on Google Maps <ExternalLink size={16} aria-hidden="true" /><span className="sr-only">(opens Google)</span></a>
      </>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-slate-200 font-semibold">Done</button>
        <button type="button" onClick={onNewConversation} className="min-h-11 rounded-full border border-slate-200 font-semibold">New conversation</button>
      </div>
    </div> : <div className="mt-2">
      <h3 className="text-center text-[17px] font-bold">How was your experience with Waydidi?</h3>
      <div role="radiogroup" aria-label="Support rating" className="mt-2 flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}, ${LABEL[n]}`}
          onMouseEnter={() => setHover(n)} onClick={() => { setRating(n); if (!picked.current) { picked.current = true; void event("rating_selected"); } }}
          className="grid size-12 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FE8B05]">
          <Star size={32} className={n <= shown ? "fill-[#FE8B05] text-[#FE8B05]" : "text-slate-300"} aria-hidden="true" /></button>)}
      </div>
      <p className="h-5 text-center text-[13px] font-semibold text-slate-600" aria-live="polite">{shown ? LABEL[shown] : ""}</p>
      <label className="mt-2 block text-[13px] font-semibold">Tell us more <span className="font-normal text-slate-500">(optional)</span>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} rows={2} placeholder="Tell us about your experience..."
          className="mt-1 w-full resize-none rounded-xl border border-slate-200 p-3 text-[14.5px] font-normal outline-none focus:border-[#FE8B05]" /></label>
      <label className="mt-2 flex items-start gap-2 text-[12.5px] text-slate-600"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[#FE8B05]" />You may publish my feedback as a Waydidi customer testimonial.</label>
      {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}
      <button type="button" disabled={!rating || busy} onClick={() => void submit()} className="mt-3 min-h-12 w-full rounded-full bg-[#FE8B05] font-semibold text-white disabled:bg-slate-300">{busy ? "Sending…" : "Submit feedback"}</button>
      <button type="button" onClick={onNewConversation} className="mt-2 w-full text-[13px] font-semibold text-slate-500 underline">Need more help? Start a new conversation</button>
    </div>}
  </div>;
}

/** First screen: what they need and their email. Sending it opens the live chat. */
function StartForm({ question, setQuestion, email, setEmail, topic, setTopic, busy, error, onStart }: {
  question: string; setQuestion: (v: string) => void; email: string; setEmail: (v: string) => void; topic: string | null; setTopic: (v: string) => void;
  busy: boolean; error: string; onStart: () => void;
}) {
  const [why, setWhy] = useState(false);
  const ready = question.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email.trim());
  return <form onSubmit={(e) => { e.preventDefault(); if (ready) onStart(); }} className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#F7F8FA] px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-4">
    <label htmlFor="ask-waydidi-input" className="text-[15px] font-bold">How can we help with your Thailand journey?</label>
    <textarea id="ask-waydidi-input" required rows={4} maxLength={2000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. A car from Suvarnabhumi Airport to Pattaya tomorrow for 3 people"
      className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-[15px] outline-none focus:border-[#FE8B05]" />
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quick topics">
      {QUICK.map((q) => <button key={q} type="button" aria-pressed={topic === q} onClick={() => { setTopic(q); if (!question.trim()) setQuestion(`${q}: `); }}
        className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${topic === q ? "border-[#FE8B05] bg-[#FFF3E6] text-[#B85D00]" : "border-slate-200 bg-white text-slate-700 hover:border-[#FE8B05]"}`}>{q}</button>)}
    </div>

    <div className="relative mt-5">
      <div className="flex items-center gap-1.5">
        <label htmlFor="ask-waydidi-email" className="text-[15px] font-bold">Your email address <span className="text-red-600" aria-hidden="true">*</span></label>
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls="ask-waydidi-why" aria-label="Why do we need your email?" className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"><CircleHelp size={17} /></button>
      </div>
      {why && <div id="ask-waydidi-why" role="dialog" aria-label="Why we ask for your email" className="absolute left-0 right-0 top-9 z-10 rounded-2xl border border-slate-200 bg-white p-3.5 text-[13.5px] text-slate-700 shadow-xl">
        <div className="flex items-start gap-2"><p className="flex-1">We need your email so we can follow up on your chat and keep helping with your Thailand journey, even if you leave the page. We won&apos;t use it for anything else without asking.</p>
          <button type="button" onClick={() => setWhy(false)} aria-label="Close" className="-mr-1 -mt-1 grid size-7 place-items-center rounded-full hover:bg-slate-100"><X size={15} /></button></div>
      </div>}
      <input id="ask-waydidi-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FE8B05]" />
    </div>

    {error && <p role="alert" className="mt-3 text-[13px] text-red-600">{error}</p>}
    <div className="mt-auto pt-5">
      <button type="submit" disabled={!ready || busy} className="min-h-12 w-full rounded-full bg-[#FE8B05] font-semibold text-white transition hover:bg-[#E67900] disabled:bg-slate-300">{busy ? "Starting…" : "Start chat"}</button>
      <p className="mt-2 text-center text-[11px] text-slate-400">Please don&apos;t share card numbers or passwords in chat.</p>
    </div>
  </form>;
}

/** "(Paid)" in Non's messages shows in green. */
function highlightPaid(text: string) {
  const parts = text.split(/(\(Paid\))/);
  return parts.length === 1 ? text : parts.map((p, i) => p === "(Paid)" ? <span key={i} className="font-semibold text-[#00B14F]">(Paid)</span> : p);
}
