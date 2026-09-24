"use client";

import Link from "next/link";
import { CarFront, Menu, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavDropdown, navLinks, navMenus } from "@/components/home/nav";
import { useI18n } from "@/components/i18n-provider";
import { LocalePicker } from "@/components/locale-picker";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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

/**
 * Site-wide header. `overlay` floats it (fixed) over an orange hero and only
 * paints the background once the page scrolls; otherwise it is sticky and
 * always orange. Labels are translated on pages wrapped in I18nProvider and
 * fall back to English elsewhere.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const account = useAccount();
  const { t } = useI18n();
  const accountLabel = account?.signedIn ? account.name || t("nav.myAccount") : t("nav.signIn");
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
      <Link href="/" className="inline-flex text-white" aria-label={t("nav.home")}>
        <WaydidiLogo className="h-12 w-auto sm:h-[62px] lg:h-[83px]" />
      </Link>
      <nav className="hidden items-center gap-10 text-[16px] font-semibold xl:flex">
        {navMenus.map((menu) => (
          <NavDropdown key={menu.labelKey} label={t(menu.labelKey)} links={menu.links.map((link) => ({ href: link.href, label: t(link.labelKey) }))} />
        ))}
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-1 py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {t(link.labelKey)}
          </Link>
        ))}
        <LocalePicker />
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
          <CarFront size={20} /> {t("nav.checkBooking")}
        </Link>
      </nav>
      <div className="flex items-center gap-4 xl:hidden">
      <LocalePicker />
      <Sheet>
        <SheetTrigger asChild>
          <button className="grid size-10 place-items-center rounded-full" aria-label={t("nav.openMenu")}>
            <Menu size={28} />
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
              aria-label={t("nav.closeMenu")}
            >
              <X size={23} />
            </SheetClose>
          </SheetHeader>
          <nav className="flex-1 overflow-y-auto px-6 py-3 text-black" aria-label={t("nav.mobileNav")}>
            {navMenus.map((menu) => (
              <div key={menu.labelKey} className="border-b border-slate-200 py-5">
                <p className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-400">{t(menu.labelKey)}</p>
                <div className="grid">
                  {menu.links.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link href={link.href} className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]">
                        {t(link.labelKey)}
                      </Link>
                    </SheetClose>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid border-b border-slate-200 py-5">
              <SheetClose asChild>
                <Link href={accountHref} className="flex items-center gap-2 rounded-xl py-3 text-lg font-bold text-[#C96100] hover:text-[#D96F00]">
                  <UserRound size={20} /> {account?.signedIn ? t("nav.myAccount") : t("nav.signInCreate")}
                </Link>
              </SheetClose>
              {navLinks.map((link) => (
                <SheetClose asChild key={link.href}>
                  <Link href={link.href} className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]">
                    {t(link.labelKey)}
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
                <CarFront size={20} /> {t("nav.checkBooking")}
              </Link>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
      </div>
    </header>
  );
}
