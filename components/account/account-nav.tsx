"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CarFront, House, Settings, UserRound } from "lucide-react";

const items = [
  { href: "/account", label: "Overview", icon: House },
  { href: "/account/trips", label: "My trips", icon: CarFront },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/account" ? pathname === href : pathname.startsWith(href);
}

export function AccountNav({ variant }: { variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();
  if (variant === "sidebar") return <nav className="mt-4 grid gap-1" aria-label="Account">
    {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 font-bold transition ${isActive(pathname, href) ? "bg-[#FFF0DF] text-[#C96100]" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={19} />{label}</Link>)}
  </nav>;
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Account">
    {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-xs font-bold ${isActive(pathname, href) ? "text-[#D96F00]" : "text-slate-500"}`}><Icon size={21} />{label}</Link>)}
  </nav>;
}
