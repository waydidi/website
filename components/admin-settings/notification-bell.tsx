"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DropdownMenu } from "radix-ui";

type Item = { n: number; text: string; href: string; urgent: boolean; key?: string };
const itemKey = (item: Item) => item.key ?? item.text;

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
  const markSeen = (i: Item) => { const next = { ...seen, [itemKey(i)]: i.n }; setSeen(next); writeSeen(next); };
  const load = useCallback(() => {
    Promise.all(["/api/admin/notifications", "/api/admin/chat?summary=1"].map(url=>fetch(url,{cache:"no-store"}).then(r=>r.ok?r.json():{items:[]}).catch(()=>({items:[]})))).then((results:{items:Item[]}[])=>setItems(results.flatMap(result=>result.items)));
  }, []);
  const loadChat = useCallback(()=>{
    fetch("/api/admin/chat?summary=1",{cache:"no-store"}).then(r=>r.ok?r.json():null).then((result:{items:Item[]}|null)=>{if(result)setItems(current=>[...(current??[]).filter(i=>!i.key?.startsWith("chat:")),...result.items]);}).catch(()=>undefined);
  },[]);
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); const chatTimer=window.setInterval(loadChat,5000); return () => {window.clearInterval(t);window.clearInterval(chatTimer);}; }, [load, loadChat, pathname]);
  const unread = (items ?? []).filter((i) => (seen[itemKey(i)] ?? 0) < i.n);
  const total = unread.reduce((sum, i) => sum + i.n, 0);

  return <div className="relative ml-auto shrink-0">
    <DropdownMenu.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) load(); }}>
    <DropdownMenu.Trigger aria-label={total ? `${total} notifications` : "Notifications"} className="relative grid size-10 place-items-center rounded-full border border-slate-200 bg-white outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand">
      <Bell size={19} />
      {total > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-bold text-white">{total > 99 ? "99+" : total}</span>}
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
    <DropdownMenu.Content align="end" sideOffset={8} collisionPadding={16} className="z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-[14px] shadow-xl">
      <DropdownMenu.Label className="border-b border-slate-100 px-4 py-3 font-semibold text-night">Notifications</DropdownMenu.Label>
      {items === null ? <p className="px-4 py-6 text-center text-slate-500">Loading…</p>
        : items.length === 0 ? <p className="px-4 py-6 text-center text-slate-500">You&apos;re all caught up.</p>
        : <div className="max-h-80 overflow-y-auto">{items.map((i) => <DropdownMenu.Item key={itemKey(i)} asChild onSelect={() => markSeen(i)}>
          <Link href={i.href} className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 outline-none last:border-0 data-[highlighted]:bg-slate-50 ${unread.includes(i) ? "" : "opacity-60"}`}>
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${!unread.includes(i) ? "bg-slate-300" : i.urgent ? "bg-[#D32F2F]" : "bg-amber-500"}`} aria-hidden="true" />
            <span className="text-slate-700"><strong className="text-slate-900">{i.n}</strong> {i.text}</span>
          </Link>
        </DropdownMenu.Item>)}</div>}
    </DropdownMenu.Content>
    </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>;
}
