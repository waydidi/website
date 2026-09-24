"use client";

import Link from "next/link";
import { CarFront, ChevronDown, Menu, UserRound, X } from "lucide-react";
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const pathname = usePathname();
  const closeMenu = () => { setMenuOpen(false); setOpenGroup(null); };

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

  return (
    <header
      className={`z-40 flex h-[59px] w-full items-center justify-between px-5 text-white transition-[background-color,box-shadow] duration-300 lg:h-[97px] lg:px-8 ${overlay ? "fixed inset-x-0 top-0" : "sticky top-0"} ${solid ? "bg-[#FF8A05]" : "bg-transparent"} ${scrolled ? "shadow-lg shadow-orange-950/10" : ""}`}
    >
      <Link href="/" className="inline-flex shrink-0 text-white" aria-label={t("nav.home")}>
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
      <div className="flex shrink-0 items-center gap-2 min-[360px]:gap-4 xl:hidden">
        <LocalePicker className="-mr-[3px]" />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          className="grid size-10 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>
      {menuOpen && (
        // Full-screen panel that drops down under the header (no logo inside).
        <nav
          id="mobile-menu"
          aria-label={t("nav.mobileNav")}
          className="fixed inset-x-0 bottom-0 top-[59px] z-30 flex flex-col overflow-y-auto bg-white text-[#211726] animate-in fade-in slide-in-from-top-4 duration-200 motion-reduce:animate-none lg:top-[97px] xl:hidden"
        >
          <ul className="px-6 pt-4">
            {navMenus.map((menu) => {
              const open = openGroup === menu.labelKey;
              return (
                <li key={menu.labelKey}>
                  <button
                    type="button"
                    onClick={() => setOpenGroup(open ? null : menu.labelKey)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between py-4 text-left text-[28px] font-bold tracking-[-.02em]"
                  >
                    {t(menu.labelKey)}
                    <ChevronDown size={24} strokeWidth={2.5} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <ul className="pb-3">
                      {menu.links.map((link) => (
                        <li key={link.href}>
                          <Link href={link.href} onClick={closeMenu} className="block py-2.5 text-lg text-slate-600 hover:text-[#D96F00]">
                            {t(link.labelKey)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={closeMenu} className="block py-4 text-[28px] font-bold tracking-[-.02em] hover:text-[#D96F00]">
                  {t(link.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto grid gap-3 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
            <Link
              href={accountHref}
              onClick={closeMenu}
              className="flex items-center justify-center gap-2 rounded-full border border-slate-300 px-5 py-4 text-base font-semibold"
            >
              <UserRound size={20} /> {account?.signedIn ? t("nav.myAccount") : t("nav.signInCreate")}
            </Link>
            <Link
              href="/booking/manage"
              onClick={closeMenu}
              className="flex items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-5 py-4 text-base font-semibold text-white"
            >
              <CarFront size={20} /> {t("nav.checkBooking")}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
