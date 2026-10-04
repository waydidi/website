"use client";

import dynamic from "next/dynamic";
import { MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Ask Waydidi: a small always-loaded launcher. The full messenger panel is loaded only when opened.

export type ChatMsg = { seq?: number; id: string; sender: "visitor" | "staff"; name: string | null; body: string; createdAt: string; clientId: string | null; state?: "sending" | "failed" };
export type ChatReview = { submitted: boolean; rating: number | null; googleUrl: string | null } | null;
export type ChatInfo = { publicId: string; status: string; agent: string | null; name: string | null; review?: ChatReview } | null;
export type Context = { topic?: string | null; name?: string; email?: string; phone?: string };

const ChatPanel = dynamic(() => import("@/components/chat/chat-panel").then((m) => m.ChatPanel), { ssr: false, loading: () => null });

const ACTIVE_KEY = "waydidi:chat-active", SEEN_KEY = "waydidi:chat-seen";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
// Hidden where the chat would get in the way: staff/driver tools, payment and the booking steps.
const HIDDEN = /^\/(admin|admin-setup|driver|trip|pay|checkout|s)(\/|$)/;

export function OpenWebsiteChat({ className, children }: { className?: string; children: React.ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("waydidi:open-chat"))}>{children}</button>;
}

export function WebsiteChat() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [booking, setBooking] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [info, setInfo] = useState<ChatInfo>(null);
  const [active, setActive] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [seen, setSeen] = useState(0);
  const cursor = useRef(0);
  const fresh = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => { setActive(store.get(ACTIVE_KEY) === "1"); setSeen(Number(store.get(SEEN_KEY)) || 0); }, 0);
    const show = () => { setMounted(true); setOpen(true); };
    const stage = () => setBooking(Boolean(document.documentElement.dataset.bookingStage && document.documentElement.dataset.bookingStage !== "search"));
    window.addEventListener("waydidi:open-chat", show); window.addEventListener("waydidi:booking-stage", stage); stage();
    return () => { window.clearTimeout(t); window.removeEventListener("waydidi:open-chat", show); window.removeEventListener("waydidi:booking-stage", stage); };
  }, []);

  // Fetches only what's new since the last message we have (cursor), so missed replies are always recovered.
  const sync = useCallback(async () => {
    const res = await fetch(`/api/chat?after=${cursor.current}`, { cache: "no-store" });
    if (!res.ok) throw new Error("load");
    const data = await res.json() as { conversation: ChatInfo; messages: ChatMsg[] };
    setLoadError(false);
    // After "Start a new conversation" the finished chat stays hidden until the first new message creates the next one.
    if (fresh.current && data.conversation?.status === "closed") return;
    fresh.current = false;
    setInfo(data.conversation);
    if (!data.conversation) return;
    if (data.messages.length) {
      cursor.current = Math.max(cursor.current, ...data.messages.map((m) => m.seq ?? 0));
      setMessages((list) => {
        const known = new Set(list.map((m) => m.id)), byClient = new Map(list.filter((m) => m.clientId).map((m) => [m.clientId, m]));
        let next = list;
        for (const m of data.messages) {
          if (known.has(m.id)) continue;
          // Replace the optimistic copy of a message we sent ourselves.
          if (m.clientId && byClient.has(m.clientId)) next = next.map((x) => (x.clientId === m.clientId ? m : x));
          else next = [...next, m];
        }
        return next;
      });
    }
  }, []);

  // Open: check every 4 s. Closed but chatting: every 20 s for the unread badge. Never polls for visitors who never chatted.
  useEffect(() => {
    if (!open && !active) return;
    let stopped = false;
    const run = () => { if (!document.hidden) void sync().catch(() => { if (!stopped) setLoadError(true); }); };
    run();
    const timer = window.setInterval(run, open ? 4000 : 20000);
    const wake = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", wake); window.addEventListener("online", wake);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [open, active, sync]);

  const lastStaffSeq = messages.reduce((n, m) => (m.sender === "staff" && (m.seq ?? 0) > n ? m.seq ?? 0 : n), 0);
  const unread = open ? 0 : messages.filter((m) => m.sender === "staff" && (m.seq ?? 0) > seen).length;
  useEffect(() => {
    if (!open || lastStaffSeq <= seen) return;
    const t = window.setTimeout(() => { setSeen(lastStaffSeq); store.set(SEEN_KEY, String(lastStaffSeq)); }, 0);
    return () => window.clearTimeout(t);
  }, [open, lastStaffSeq, seen]);

  async function send(body: string, ctx: Context, retryOf?: ChatMsg) {
    const clientId = retryOf?.clientId ?? crypto.randomUUID();
    const optimistic: ChatMsg = { id: `local-${clientId}`, sender: "visitor", name: null, body, createdAt: new Date().toISOString(), clientId, state: "sending" };
    setMessages((list) => (retryOf ? list.map((m) => (m.clientId === clientId ? optimistic : m)) : [...list, optimistic]));
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: body, clientId, topic: ctx.topic ?? null, email: ctx.email ?? null, sourceUrl: window.location.pathname, sourceTitle: document.title.replace(/\s*[|·–-]\s*Waydidi.*$/i, "").slice(0, 160) }) });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Message couldn't be sent.");
      store.set(ACTIVE_KEY, "1"); setActive(true);
      await sync().catch(() => undefined);
      return null;
    } catch (error) {
      // The same clientId is reused on retry, so a message the server already has is never duplicated.
      setMessages((list) => list.map((m) => (m.clientId === clientId && m.state ? { ...m, state: "failed" } : m)));
      return error instanceof Error ? error.message : "Message couldn't be sent.";
    }
  }

  if (HIDDEN.test(path ?? "") || booking) return null;
  return <>
    {mounted && open && <ChatPanel info={info} messages={messages} loadError={loadError} onRetryLoad={() => void sync().catch(() => setLoadError(true))}
      onSend={send} onClose={() => setOpen(false)} onReviewed={() => void sync().catch(() => undefined)}
      onNewConversation={() => { fresh.current = true; setMessages([]); setInfo((i) => (i ? { ...i, status: "new", agent: null, review: null } : i)); }} />}
    <button type="button" onClick={() => { setMounted(true); setOpen((v) => !v); }} aria-label={open ? "Close chat" : unread ? `Ask Waydidi, ${unread} new ${unread === 1 ? "message" : "messages"}` : "Ask Waydidi"} aria-expanded={open}
      className={`fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-4 z-[85] grid size-14 place-items-center rounded-full bg-[#FE8B05] text-white shadow-[0_8px_24px_rgba(254,139,5,.35)] transition hover:bg-[#E67900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FE8B05] sm:right-6 ${open ? "max-sm:hidden" : ""}`}>
      {open ? <X size={24} aria-hidden="true" /> : <MessageCircle size={26} aria-hidden="true" />}
      {!open && unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full border-2 border-white bg-[#D32F2F] px-1 text-[12px] font-bold">{unread > 9 ? "9+" : unread}</span>}
    </button>
  </>;
}
