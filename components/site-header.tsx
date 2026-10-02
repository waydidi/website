"use client";

import Link from "next/link";
import { CarFront, ChevronRight, Menu, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavDropdown, navLinks, navMenus } from "@/components/home/nav";
import { useI18n } from "@/components/i18n-provider";
import { LocalePicker } from "@/components/locale-picker";
import { WaydidiLogo } from "@/components/waydidi-logo";

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

  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const closeMenu = () => setMenuOpen(false);

  // Close the menu after navigating.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  // While the full-screen menu is open: lock page scroll, close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const solid = !overlay || scrolled || menuOpen;
  // Once the page scrolls, the bar turns white with Waydidi-orange logo, links and button.
  const light = scrolled && !menuOpen;

  return (
    <header
      className={`z-40 flex h-[69px] w-full items-center justify-between px-5 transition-[background-color,color,box-shadow] duration-300 lg:h-[97px] lg:px-8 ${overlay ? "fixed inset-x-0 top-0" : "sticky top-0"} ${light ? "bg-white text-[#E57A00] shadow-[0_2px_12px_rgba(0,0,0,.08)]" : solid ? "bg-[#FF8A05] text-white" : "bg-transparent text-white"}`}
    >
      <Link href="/" className={`inline-flex shrink-0 transition-colors duration-300 ${light ? "text-[#FF8A05]" : "text-white"}`} aria-label={t("nav.home")}>
        {/* Explicit widths (logo is 810:308): Safari collapses a width-less
            mask span to 0px when its container is allowed to shrink. */}
        <WaydidiLogo className="h-[40px] w-[105px] min-[360px]:h-[53px] min-[360px]:w-[139px] sm:h-[68px] sm:w-[179px] lg:h-[91px] lg:w-[240px]" />
      </Link>
      <nav className="hidden items-center gap-10 text-[16px] font-semibold xl:flex">
        {navMenus.map((menu) => (
          <NavDropdown key={menu.labelKey} label={t(menu.labelKey)} links={menu.links.map((link) => ({ href: link.href, label: t(link.labelKey) }))} />
        ))}
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-1 py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            {t(link.labelKey)}
          </Link>
        ))}
        <LocalePicker />
        <Link
          href={accountHref}
          className={`flex items-center gap-2 rounded-full px-1 py-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${account ? "" : "invisible"}`}
        >
          <span className={`grid size-8 place-items-center rounded-full ${light ? "bg-orange-50" : "bg-white/20"}`}><UserRound size={18} /></span>
          <span className="max-w-[140px] truncate">{accountLabel}</span>
        </Link>
        <Link
          href="/booking/manage"
          className={`flex h-12 items-center gap-2 rounded-full px-6 font-bold transition-colors duration-300 ${light ? "bg-[#FF8A05] text-white hover:bg-[#E67900]" : "bg-white text-[#D96F00] hover:bg-orange-50"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF8A05]`}
        >
          <CarFront size={20} /> {t("nav.checkBooking")}
        </Link>
      </nav>
      <div className="flex shrink-0 items-center gap-2 min-[360px]:gap-4 xl:hidden">
        <LocalePicker className="-mr-[3px]" />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          className="grid size-10 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>
      {menuOpen && (
        // Side drawer from the right (Daytrip-style): about 82% of the screen, max 340px.
        <div className="fixed inset-0 z-50 xl:hidden">
          <button type="button" aria-label={t("nav.closeMenu")} onClick={closeMenu} className="absolute inset-0 bg-black/40 animate-in fade-in duration-200 motion-reduce:animate-none" />
          <nav
            id="mobile-menu"
            aria-label={t("nav.mobileNav")}
            className="absolute inset-y-0 right-0 flex w-[82vw] max-w-[340px] flex-col overflow-y-auto bg-white text-[#211726] shadow-2xl animate-in slide-in-from-right duration-300 motion-reduce:animate-none"
          >
            <div className="flex justify-end px-5 pt-[calc(1rem+env(safe-area-inset-top))]">
              <button type="button" onClick={closeMenu} className="flex items-center gap-1 rounded-full px-2 py-1 text-[17px] font-semibold text-[#E57A00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05]">
                Hide <ChevronRight size={22} strokeWidth={2.25} />
              </button>
            </div>
            <div className="px-5 pt-3 text-[#211726]"><LocalePicker /></div>
            <ul className="px-5 pt-5">
              {navMenus.map((menu) => (
                <li key={menu.labelKey} className="mb-4">
                  <p className="text-[16px] text-slate-500">{t(menu.labelKey)}</p>
                  <ul className="mt-2 border-l-[1.5px] border-slate-200 pl-5">
                    {menu.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} onClick={closeMenu} className="block py-2 text-[17px] font-semibold text-[#E57A00] hover:underline">
                          {t(link.labelKey)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={closeMenu} className="block py-2.5 text-[17px] font-semibold text-[#E57A00] hover:underline">
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-auto grid justify-items-start gap-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-8">
              <Link href={accountHref} onClick={closeMenu} className="flex items-center gap-2 rounded-full bg-[#FFF0DF] px-5 py-3 text-[16px] font-semibold text-[#E57A00]">
                <UserRound size={20} /> {account?.signedIn ? t("nav.myAccount") : t("nav.signIn")}
              </Link>
              <Link href="/booking/manage" onClick={closeMenu} className="flex items-center gap-2 rounded-full bg-[#FF8A05] px-5 py-3 text-[16px] font-semibold text-white">
                <CarFront size={20} /> {t("nav.checkBooking")}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
