"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { n: number; text: string; href: string; urgent: boolean };

// A notification is cleared once opened, until its count goes up again (kept on this device).
const SEEN_KEY = "waydidi:admin-seen-notifications";
const readSeen = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>; } catch { return {}; } };
const writeSeen = (seen: Record<string, number>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* storage unavailable */ } };

// Top-bar bell: a count of things waiting, and a list of them when tapped.
export function NotificationBell() {
  const pathname = usePathname();
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => { const t = window.setTimeout(() => setSeen(readSeen()), 0); return () => window.clearTimeout(t); }, []);
  const markSeen = (i: Item) => { const next = { ...seen, [i.text]: i.n }; setSeen(next); writeSeen(next); };
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    fetch("/api/admin/notifications", { cache: "no-store" }).then((r) => r.ok ? r.json() : { items: [] }).then((o: { items: Item[] }) => setItems(o.items)).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t); }, [load, pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const unread = (items ?? []).filter((i) => (seen[i.text] ?? 0) < i.n);
  const total = unread.reduce((sum, i) => sum + i.n, 0);

  return <div ref={box} className="relative ml-auto shrink-0">
    <button type="button" onClick={() => { setOpen((v) => !v); if (!open) load(); }} aria-haspopup="menu" aria-expanded={open} aria-label={total ? `${total} notifications` : "Notifications"} className="relative grid size-10 place-items-center rounded-full border border-slate-200 bg-white hover:bg-slate-50">
      <Bell size={19} />
      {total > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-bold text-white">{total > 99 ? "99+" : total}</span>}
    </button>
    {open && <div role="menu" className="absolute right-0 top-12 z-50 w-80 overflow-hidden max-sm:fixed max-sm:inset-x-4 max-sm:top-[76px] max-sm:w-auto rounded-2xl border border-slate-200 bg-white text-[14px] shadow-xl">
      <p className="border-b border-slate-100 px-4 py-3 font-semibold text-[#15161C]">Notifications</p>
      {items === null ? <p className="px-4 py-6 text-center text-slate-500">Loading…</p>
        : items.length === 0 ? <p className="px-4 py-6 text-center text-slate-500">You&apos;re all caught up.</p>
        : <ul className="max-h-80 overflow-y-auto">{items.map((i) => <li key={i.text}>
          <Link href={i.href} role="menuitem" onClick={() => { markSeen(i); setOpen(false); }} className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50 ${unread.includes(i) ? "" : "opacity-60"}`}>
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${!unread.includes(i) ? "bg-slate-300" : i.urgent ? "bg-[#D32F2F]" : "bg-amber-500"}`} aria-hidden="true" />
            <span className="text-slate-700"><strong className="text-slate-900">{i.n}</strong> {i.text}</span>
          </Link>
        </li>)}</ul>}
    </div>}
  </div>;
}
