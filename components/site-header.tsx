"use client";

import Link from "next/link";
import { CarFront, ChevronDown, Menu, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// Every navigation label resolves to a page that actually exists. The header
// and mobile drawer both read from here so they cannot drift apart.
export const navMenus = [
  {
    label: "Ride",
    links: [
      { label: "Airport transfer", href: "/airport-transfer" },
      { label: "A to B", href: "/a-to-b-transfer" },
      { label: "Long journey", href: "/long-journeys" },
    ],
  },
  {
    label: "Trip",
    links: [
      { label: "Hourly private driver", href: "/hourly-driver" },
      { label: "Airport pickup guide", href: "/airport-pickup-instructions" },
    ],
  },
] as const;

export const navLinks = [
  { label: "Destinations", href: "/destinations" },
  { label: "About Waydidi", href: "/about" },
] as const;

function NavDropdown({ label, links }: { label: string; links: readonly { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        {label}
        <ChevronDown className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-full z-50 mt-5 w-64 rounded-2xl bg-white p-2 text-[#21140A] shadow-xl">
          {links.map((link) => (
            <Link
              key={link.href}
              role="menuitem"
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 hover:bg-orange-50 focus-visible:outline-none focus-visible:bg-orange-50"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Site-wide header. `overlay` floats it (fixed) over an orange hero and only
 * paints the background once the page scrolls; otherwise it is sticky and
 * always orange.
 */
type AccountState = { signedIn: false } | { signedIn: true; name: string | null; email: string };

// Signed-in state is fetched after load so every page can stay static.
function useAccount() {
  const [account, setAccount] = useState<AccountState | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/account/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { signedIn: false }))
      .then((data: AccountState) => { if (active) setAccount(data); })
      .catch(() => { if (active) setAccount({ signedIn: false }); });
    return () => { active = false; };
  }, []);
  return account;
}

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const account = useAccount();
  const accountLabel = account?.signedIn ? account.name || "My account" : "Sign in";
  const accountHref = account?.signedIn ? "/account" : "/account/sign-in";

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 18);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const solid = !overlay || scrolled;

  return (
    <header
      className={`z-40 flex h-[59px] w-full items-center justify-between px-5 text-white transition-[background-color,box-shadow] duration-300 lg:h-[97px] lg:px-8 ${overlay ? "fixed inset-x-0 top-0" : "sticky top-0"} ${solid ? "bg-[#FF8A05]" : "bg-transparent"} ${scrolled ? "shadow-lg shadow-orange-950/10" : ""}`}
    >
      <Link href="/" className="inline-flex text-white" aria-label="Waydidi home">
        <WaydidiLogo className="h-12 w-auto sm:h-[62px] lg:h-[83px]" />
      </Link>
      <nav className="hidden items-center gap-10 text-[16px] font-semibold xl:flex">
        {navMenus.map((menu) => (
          <NavDropdown key={menu.label} label={menu.label} links={menu.links} />
        ))}
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-1 py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {link.label}
          </Link>
        ))}
        <Link
          href={accountHref}
          className={`flex items-center gap-2 rounded-full px-1 py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${account ? "" : "invisible"}`}
        >
          <span className="grid size-8 place-items-center rounded-full bg-white/20"><UserRound size={18} /></span>
          <span className="max-w-[140px] truncate">{accountLabel}</span>
        </Link>
        <Link
          href="/booking/manage"
          className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-[#D96F00] transition-colors duration-500 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF8A05]"
        >
          <CarFront size={20} /> Check your booking
        </Link>
      </nav>
      <Sheet>
        <SheetTrigger asChild>
          <button className="flex items-center gap-3 text-lg font-bold xl:hidden" aria-label="Open navigation menu">
            Menu <Menu />
          </button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-[min(430px,92vw)] max-w-none gap-0 border-l border-slate-200 bg-white p-0 text-black sm:max-w-[430px]"
          showCloseButton={false}
        >
          <SheetHeader className="flex-row items-center justify-between border-b border-slate-200 px-6 py-5">
            <SheetTitle className="flex text-[#FF8A05]">
              <WaydidiLogo className="h-20 w-auto" />
              <span className="sr-only">Waydidi</span>
            </SheetTitle>
            <SheetClose
              className="grid size-11 place-items-center rounded-full bg-slate-100 text-black transition hover:bg-slate-200"
              aria-label="Close navigation menu"
            >
              <X size={23} />
            </SheetClose>
          </SheetHeader>
          <nav className="flex-1 overflow-y-auto px-6 py-3 text-black" aria-label="Mobile navigation">
            {navMenus.map((menu) => (
              <div key={menu.label} className="border-b border-slate-200 py-5">
                <p className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-400">{menu.label}</p>
                <div className="grid">
                  {menu.links.map((link) => (
                    <SheetClose asChild key={link.label}>
                      <Link href={link.href} className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]">
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid border-b border-slate-200 py-5">
              <SheetClose asChild>
                <Link href={accountHref} className="flex items-center gap-2 rounded-xl py-3 text-lg font-bold text-[#C96100] hover:text-[#D96F00]">
                  <UserRound size={20} /> {account?.signedIn ? "My account" : "Sign in / create account"}
                </Link>
              </SheetClose>
              {navLinks.map((link) => (
                <SheetClose asChild key={link.href}>
                  <Link href={link.href} className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]">
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
            </div>
          </nav>
          <div className="mt-auto border-t border-slate-200 bg-white px-6 py-6">
            <SheetClose asChild>
              <Link
                href="/booking/manage"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-5 py-4 font-bold text-white"
              >
                <CarFront size={20} /> Check your booking
              </Link>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
