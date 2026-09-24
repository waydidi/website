"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CarFront, House, MapPin, ReceiptText, Settings, UserRound, Users } from "lucide-react";

const items = [
  { href: "/account", label: "Overview", icon: House, tab: true },
  { href: "/account/trips", label: "My trips", icon: CarFront, tab: true },
  { href: "/account/receipts", label: "Receipts", icon: ReceiptText, tab: true },
  { href: "/account/places", label: "Saved places", icon: MapPin, tab: false },
  { href: "/account/passengers", label: "Travellers", icon: Users, tab: false },
  { href: "/account/profile", label: "Profile", icon: UserRound, tab: true },
  { href: "/account/settings", label: "Settings", icon: Settings, tab: false },
];
// The mobile tab bar has room for four items; the rest are linked from Profile.
const tabItems = items.filter((item) => item.tab);

function isActive(pathname: string, href: string) {
  return href === "/account" ? pathname === href : pathname.startsWith(href);
}

export function AccountNav({ variant }: { variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();
  if (variant === "sidebar") return <nav className="mt-4 grid gap-1" aria-label="Account">
    {items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={isActive(pathname, href) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 font-bold transition ${isActive(pathname, href) ? "bg-[#FFF0DF] text-[#C96100]" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={19} />{label}</Link>)}
  </nav>;
  // Pages without their own tab (places, travellers, settings) highlight Profile.
  const tabActive = (href: string) => isActive(pathname, href) || (href === "/account/profile" && !tabItems.some((item) => item.href !== "/account" && pathname.startsWith(item.href)) && pathname !== "/account");
  return <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Account">
    {tabItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={tabActive(href) ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-xs font-bold ${tabActive(href) ? "text-[#D96F00]" : "text-slate-500"}`}><Icon size={21} />{label}</Link>)}
  </nav>;
}
