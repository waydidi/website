"use client";

import {
  BookOpen,
  Clock3,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Truck,
  Users,
  Newspaper,
  Route,
  TicketPercent, Gift } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { WaydidiLogo, WaydidiMark } from "@/components/waydidi-logo";

const tabs = [
  {
    href: "/admin/bookings",
    label: "Bookings",
    mobileLabel: "Bookings",
    title: "Bookings",
    icon: BookOpen,
  },
  {
    href: "/admin/dispatch",
    label: "Driver dispatch",
    mobileLabel: "Dispatch",
    title: "Driver dispatch & costs",
    icon: Send,
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
    label: "Pricing areas",
    mobileLabel: "Areas",
    title: "Pricing areas",
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
    href: "/admin/gifts",
    label: "Member gifts",
    mobileLabel: "Gifts",
    title: "Member gifts",
    icon: Gift,
  },
  {
    href: "/admin/blog",
    label: "Blog",
    mobileLabel: "Blog",
    title: "Blog",
    icon: Newspaper,
  },
  {
    href: "/admin/routes",
    label: "Route inclusions",
    mobileLabel: "Routes",
    title: "Route inclusions",
    icon: Route,
  },
  {
    href: "/admin/hourly",
    label: "Hourly pricing",
    mobileLabel: "Hourly",
    title: "Hourly pricing",
    icon: Clock3,
  },
];

export default function AdminShell({
  children,
}: {
  email?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem("waydidi-admin-sidebar") === "collapsed",
    );
  }, []);
  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(
        "waydidi-admin-sidebar",
        next ? "collapsed" : "expanded",
      );
      return next;
    });
  }
  const active = tabs.find((tab) => pathname.startsWith(tab.href)) ?? tabs[0];
  return (
    <div className="flex min-h-screen bg-[#f3f5f8] text-[#211726]">
      <aside
        className={`sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white py-5 transition-[width,padding] duration-300 md:flex ${collapsed ? "w-[82px] px-3" : "w-[250px] px-5"}`}
      >
        <div
          className={`flex items-center transition-all duration-300 ${collapsed ? "justify-center" : "justify-between"}`}
        >
          <div
            className="pointer-events-none flex items-center overflow-hidden text-[#FF8A05]"
            aria-label="Waydidi"
          >
            <span
              className="relative block h-12 transition-[width] duration-300"
              style={{ width: collapsed ? 40 : 126 }}
            >
              <WaydidiLogo
                className={`absolute left-0 top-0 h-[53px] w-auto transition-all duration-200 ${collapsed ? "scale-90 opacity-0" : "scale-100 opacity-100"}`}
              />
              <WaydidiMark
                className={`absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ${collapsed ? "scale-100 opacity-100" : "scale-75 opacity-0"}`}
              />
            </span>
          </div>
          <button
            onClick={toggleSidebar}
            className={`grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 transition-all duration-300 hover:bg-orange-50 hover:text-[#D96F00] ${collapsed ? "absolute left-[62px] top-6 bg-white shadow-sm" : ""}`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <nav
          aria-label="Admin sections"
          className="mt-8 space-y-2 text-sm font-bold"
        >
          {tabs.map(({ href, label, icon: Icon }) => {
            const selected = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                className={`flex min-h-12 items-center gap-3 overflow-hidden rounded-2xl px-3 transition-all duration-300 ${collapsed ? "justify-center" : "justify-start"} ${selected ? "bg-[#FFF0DF] text-[#D96F00]" : "text-slate-600 hover:bg-slate-50 hover:text-[#211726]"}`}
                aria-current={selected ? "page" : undefined}
                title={label}
              >
                <Icon className="shrink-0" size={19} />
                <span
                  className={`whitespace-nowrap transition-all duration-300 ${collapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[180px] translate-x-0 opacity-100"}`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div
          className={`mt-auto flex items-center overflow-hidden border-t border-slate-200 pt-5 transition-all duration-300 ${collapsed ? "justify-center" : "justify-start px-2"}`}
        >
          <div
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[#211726] text-sm font-black text-white"
            aria-label="Waydidi administrator profile"
          >
            WD
          </div>
          <div
            className={`min-w-0 whitespace-nowrap transition-all duration-300 ${collapsed ? "ml-0 max-w-0 -translate-x-2 opacity-0" : "ml-3 max-w-[150px] translate-x-0 opacity-100"}`}
          >
            <p className="truncate text-sm font-black">Waydidi Admin</p>
            <p className="text-xs text-slate-500">Administrator</p>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[82px] items-center justify-between bg-[#FF8A05] px-5 text-white shadow-sm sm:px-8">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.15em] text-white/75">
              Waydidi operations
            </p>
            <h1 className="truncate text-xl font-black sm:text-2xl">
              {active.title}
            </h1>
          </div>
          <div
            className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-white/70 bg-white text-sm font-black text-[#D96F00]"
            aria-label="Waydidi administrator profile"
          >
            WD
          </div>
        </header>
        <section className="admin-page-slot mx-auto min-h-[calc(100vh-82px)] max-w-[1600px] px-0 pb-32 md:pb-8">
          {children}
        </section>
      </div>
      <nav
        aria-label="Mobile admin sections"
        className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-50 grid grid-cols-5 gap-1 rounded-[28px] border border-white/80 bg-white/95 p-2 shadow-[0_14px_45px_rgba(33,23,38,.24)] backdrop-blur-xl md:hidden"
      >
        {tabs.map(({ href, mobileLabel, icon: Icon }) => {
          const selected = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={selected ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[21px] px-1 py-2.5 text-[10px] font-black transition-all duration-200 ${selected ? "bg-[#FFF0DF] text-[#D96F00]" : "text-slate-600 active:bg-slate-100"}`}
            >
              <Icon size={21} strokeWidth={selected ? 2.6 : 2.1} />
              <span className="w-full truncate text-center">{mobileLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
