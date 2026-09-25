"use client";

import {
  BookOpen,
  MapPinned,
  Truck,
  Users,
  Newspaper,
  TicketPercent, Gift, Building2, IdCard, LayoutDashboard, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Grid2x2, Moon, Search, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { WaydidiLogo, WaydidiMark } from "@/components/waydidi-logo";
import { AvatarMenu } from "@/components/admin-settings/avatar-menu";

// "/admin" (Overview) only matches itself; other tabs also match their sub-pages.
const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href) || (href === "/admin/pricing" && (pathname.startsWith("/admin/hourly") || pathname.startsWith("/admin/routes"))));

const tabs = [
  {
    href: "/admin",
    label: "Overview",
    mobileLabel: "Overview",
    title: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/reports",
    label: "Reports",
    mobileLabel: "Reports",
    title: "Reports",
    icon: BarChart3,
  },
  {
    href: "/admin/bookings",
    label: "Bookings",
    mobileLabel: "Bookings",
    title: "Bookings",
    icon: BookOpen,
  },

  {
    href: "/admin/operations",
    label: "Booking operations",
    mobileLabel: "Operations",
    title: "Driver control",
    icon: Truck,
  },
  {
    href: "/admin/pricing",
    label: "Fare management",
    mobileLabel: "Fares",
    title: "Fare management",
    icon: MapPinned,
  },
  {
    href: "/admin/users",
    label: "Users",
    mobileLabel: "Users",
    title: "Users",
    icon: Users,
  },
  {
    href: "/admin/promotions",
    label: "Promotions",
    mobileLabel: "Promos",
    title: "Promotions",
    icon: TicketPercent,
  },
  {
    href: "/admin/drivers",
    label: "Drivers",
    mobileLabel: "Drivers",
    title: "Drivers",
    icon: IdCard,
  },
  {
    href: "/admin/agencies",
    label: "Travel agencies",
    mobileLabel: "Agencies",
    title: "Travel agencies",
    icon: Building2,
  },
  {
    href: "/admin/gifts",
    label: "Giveaways",
    mobileLabel: "Giveaways",
    title: "Giveaways",
    icon: Gift,
  },
  {
    href: "/admin/blog",
    label: "Blog",
    mobileLabel: "Blog",
    title: "Blog",
    icon: Newspaper,
  },


];

type NavLink = { href: string; label: string; icon?: typeof BookOpen; match?: (pathname: string, tab: string | null) => boolean };
type NavGroup = NavLink & { children?: NavLink[] };

const reportTab = (tab: string) => (p: string, t: string | null) => p.startsWith("/admin/reports") && (t ?? "revenue") === tab;

// Sidebar: groups with sub-pages open as dropdowns (ShopZen-style).
const SECTIONS: { title?: string; items: NavGroup[] }[] = [
  { items: [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/bookings", label: "Bookings", icon: BookOpen, children: [
      { href: "/admin/bookings", label: "All bookings" },
      { href: "/admin/calendar", label: "Calendar" },
    ] },
    { href: "/admin/operations", label: "Operations", icon: Truck },
    { href: "/admin/reports", label: "Reports", icon: BarChart3, children: [
      { href: "/admin/reports", label: "Revenue", match: reportTab("revenue") },
      { href: "/admin/reports?tab=payouts", label: "Driver payouts", match: reportTab("payouts") },
      { href: "/admin/reports?tab=discounts", label: "Discounts", match: reportTab("discounts") },
    ] },
    { href: "/admin/pricing", label: "Fare management", icon: MapPinned, children: [
      { href: "/admin/pricing", label: "Areas" },
      { href: "/admin/hourly", label: "Hourly" },
      { href: "/admin/routes", label: "Routes" },
    ] },
  ] },
  { title: "Marketing", items: [
    { href: "/admin/promotions", label: "Promotions", icon: TicketPercent },
    { href: "/admin/gifts", label: "Giveaways", icon: Gift, children: [
      { href: "/admin/gifts", label: "Tier gifts", match: (p) => p === "/admin/gifts" },
      { href: "/admin/gifts/mystery", label: "Mystery gifts" },
    ] },
    { href: "/admin/blog", label: "Blog", icon: Newspaper },
  ] },
  { title: "People", items: [
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/drivers", label: "Drivers", icon: IdCard },
    { href: "/admin/agencies", label: "Travel agencies", icon: Building2 },
  ] },
];

const linkActive = (l: NavLink, p: string, t: string | null) => { const h = l.href.split("?")[0]; return l.match ? l.match(p, t) : h === "/admin" ? p === h : p.startsWith(h); };
const groupActive = (g: NavGroup, p: string, t: string | null) => (g.children ? g.children.some((c) => linkActive(c, p, t)) : linkActive(g, p, t));
const ALL_PAGES = SECTIONS.flatMap((s) => s.items.flatMap((g) => (g.children ? g.children.map((c) => ({ href: c.href, label: `${g.label} · ${c.label}` })) : [{ href: g.href, label: g.label }]))).concat({ href: "/admin/settings", label: "Settings" });

function PageSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = q.trim() ? ALL_PAGES.filter((x) => x.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); document.getElementById("admin-search")?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (href: string) => { setQ(""); setOpen(false); router.push(href); };
  return <div className="relative w-full max-w-[460px]">
    <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    <input id="admin-search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      onKeyDown={(e) => { if (e.key === "Enter" && results[0]) go(results[0].href); if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
      placeholder="Search pages…" aria-label="Search admin pages" autoComplete="off"
      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-14 text-[15px] outline-none placeholder:text-slate-500 focus:border-[#FF8A05] focus:ring-2 focus:ring-[#FF8A05]/15" />
    <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] text-slate-500">/</kbd>
    {open && results.length > 0 && <ul className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
      {results.map((r) => <li key={r.href}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.href)} className="w-full px-4 py-2.5 text-left text-[14px] hover:bg-slate-50">{r.label}</button></li>)}
    </ul>}
  </div>;
}

export default function AdminShell({
  children,
}: {
  email?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const tab = useSearchParams()?.get("tab") ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(window.localStorage.getItem("waydidi-admin-sidebar") === "collapsed");
  }, []);
  // Dark mode for the admin only: a class on <html> (so dialogs and sheets follow),
  // remembered on this device, starting from the system setting.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("waydidi-admin-theme"); } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("admin-dark", dark);
    return () => document.documentElement.classList.remove("admin-dark");
  }, [dark]);
  function toggleDark() {
    setDark((d) => { try { window.localStorage.setItem("waydidi-admin-theme", d ? "light" : "dark"); } catch { /* storage blocked */ } return !d; });
  }
  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("waydidi-admin-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }
  const isOpen = (g: NavGroup) => openGroups[g.href] ?? groupActive(g, pathname, tab);
  const active = tabs.find((t) => isActive(pathname, t.href)) ?? tabs[0];
  const title = pathname.startsWith("/admin/settings") ? "Settings" : pathname === "/admin/gifts" ? "Tier gifts" : pathname.startsWith("/admin/gifts/mystery") ? "Mystery gifts" : pathname.startsWith("/admin/journeys") ? "Journey details" : pathname.startsWith("/admin/calendar") ? "Calendar" : active.title;
  return (
    <div className="flex min-h-screen bg-[#F4F5F7] text-[#15161C]">
      <aside className={`sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-slate-200/80 bg-[#FBFBFC] transition-[width] duration-300 md:flex ${collapsed ? "w-[76px]" : "w-[272px]"}`}>
        <div className={`flex h-[72px] items-center border-b border-slate-200/70 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
          {collapsed ? <WaydidiMark className="size-9 text-[#FF8A05]" /> : <WaydidiLogo className="h-[46px] w-auto text-[#FF8A05]" />}
          {!collapsed && <button onClick={toggleSidebar} aria-label="Collapse sidebar" title="Collapse sidebar" className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[#15161C]"><ChevronLeft size={16} /></button>}
        </div>
        {collapsed && <button onClick={toggleSidebar} aria-label="Expand sidebar" title="Expand sidebar" className="mx-auto mt-3 grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[#15161C]"><ChevronRight size={16} /></button>}
        <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-3 py-4">
          {SECTIONS.map((section, si) => <div key={si} className={si ? "mt-5" : ""}>
            {section.title && !collapsed && <p className="mb-1.5 px-3 text-[14px] font-semibold text-slate-800">{section.title}</p>}
            {section.title && collapsed && <div className="mx-3 mb-2 border-t border-slate-200" />}
            <ul className="grid gap-0.5">
              {section.items.map((g) => {
                const Icon = g.icon ?? BookOpen;
                const on = groupActive(g, pathname, tab);
                const row = `flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors ${on ? "bg-[#FFF0DF] font-semibold text-[#C96100]" : "text-slate-700 hover:bg-slate-100/80 hover:text-[#15161C]"} ${collapsed ? "justify-center" : ""}`;
                if (!g.children || collapsed) return <li key={g.href}><Link href={g.children ? g.children[0].href : g.href} prefetch aria-current={on ? "page" : undefined} title={g.label} className={row}><Icon size={18} strokeWidth={on ? 2.4 : 1.9} className="shrink-0" />{!collapsed && <span className="truncate">{g.label}</span>}</Link></li>;
                const open = isOpen(g);
                const id = `nav-${g.href.replaceAll("/", "-")}`;
                return <li key={g.href}>
                  <button type="button" onClick={() => setOpenGroups((o) => ({ ...o, [g.href]: !open }))} aria-expanded={open} aria-controls={id} className={row}>
                    <Icon size={18} strokeWidth={on ? 2.4 : 1.9} className="shrink-0" />
                    <span className="flex-1 truncate text-left">{g.label}</span>
                    <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  <ul id={id} hidden={!open} className="relative mb-1 ml-[21px] mt-0.5 grid gap-0.5 border-l border-slate-200 pl-3">
                    {g.children.map((c) => { const cOn = linkActive(c, pathname, tab); return <li key={c.href}>
                      <Link href={c.href} prefetch aria-current={cOn ? "page" : undefined} className={`flex h-9 items-center rounded-lg px-3 text-[14.5px] ${cOn ? "font-semibold text-[#15161C]" : "text-slate-600 hover:text-[#15161C]"}`}>{cOn && <span className="-ml-[19px] mr-3 h-5 w-[3px] rounded-full bg-[#FF8A05]" aria-hidden="true" />}{c.label}</Link>
                    </li>; })}
                  </ul>
                </li>;
              })}
            </ul>
          </div>)}
        </nav>
        <div className={`flex items-center gap-1 border-t border-slate-200/70 p-3 ${collapsed ? "flex-col" : ""}`}>
          <Link href="/admin/settings" prefetch aria-current={pathname.startsWith("/admin/settings") ? "page" : undefined} title="Settings" className={`flex h-10 min-w-0 flex-1 items-center gap-3 rounded-[10px] px-3 text-[15px] ${collapsed ? "w-full justify-center" : ""} ${pathname.startsWith("/admin/settings") ? "bg-[#FFF0DF] font-semibold text-[#C96100]" : "text-slate-700 hover:bg-slate-100/80"}`}><Settings size={18} className="shrink-0" />{!collapsed && "Settings"}</Link>
          <button type="button" onClick={toggleDark} aria-pressed={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className="grid size-10 shrink-0 place-items-center rounded-[10px] text-slate-700 hover:bg-slate-100/80">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-slate-200/70 bg-white/95 px-4 backdrop-blur sm:px-8">
          <h1 className="min-w-0 shrink-0 truncate text-[20px] font-semibold tracking-[-.01em] md:hidden">{title}</h1>
          <div className="hidden flex-1 md:block"><PageSearch /></div>
          <AvatarMenu />
        </header>
        <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-8">
          <h1 className="hidden text-[28px] font-semibold tracking-[-.02em] md:block">{title}</h1>
        </div>
        <section className="admin-page-slot mx-auto min-h-[calc(100vh-72px)] max-w-[1600px] px-0 pb-32 md:pb-8">
          {children}
        </section>
      </div>
      <MobileTabBar pathname={pathname} />
    </div>
  );
}

// Mobile bottom bar: the first four tabs plus "More" in one row. "More" expands the
// sheet upward to show the rest; it closes again on tap or after picking a page.
function MobileTabBar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const main = tabs.slice(0, 4);
  const more = tabs.slice(4);
  const moreActive = more.find((tab) => isActive(pathname, tab.href));
  const item = (selected: boolean) => `flex min-w-0 flex-col items-center justify-center gap-1 rounded-[21px] px-1 py-2.5 text-[10px] font-black transition-all duration-200 ${selected ? "bg-[#FFF0DF] text-[#D96F00]" : "text-slate-600 active:bg-slate-100"}`;
  const link = ({ href, mobileLabel, icon: Icon }: (typeof tabs)[number]) => {
    const selected = isActive(pathname, href);
    return <Link key={href} href={href} prefetch onClick={() => setOpen(false)} aria-current={selected ? "page" : undefined} className={item(selected)}>
      <Icon size={21} strokeWidth={selected ? 2.6 : 2.1} />
      <span className="w-full truncate text-center">{mobileLabel}</span>
    </Link>;
  };
  const MoreIcon = open ? ChevronDown : moreActive?.icon ?? Grid2x2;
  return <>
    {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/20 md:hidden" />}
    <nav aria-label="Mobile admin sections" className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 rounded-[28px] border border-white/80 bg-white/95 p-2 shadow-[0_14px_45px_rgba(33,23,38,.24)] backdrop-blur-xl md:hidden">
      <div id="admin-more-tabs" hidden={!open} className="mb-1 border-b border-slate-100 pb-1">
        <div className="grid grid-cols-5 gap-1">{more.map(link)}</div>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {main.map(link)}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="admin-more-tabs" className={item(Boolean(moreActive) || open)}>
          <MoreIcon size={21} strokeWidth={moreActive || open ? 2.6 : 2.1} />
          <span className="w-full truncate text-center">{open ? "Less" : moreActive?.mobileLabel ?? "More"}</span>
        </button>
      </div>
    </nav>
  </>;
}
