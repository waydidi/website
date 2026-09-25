"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MessageKey } from "@/lib/i18n";

export const navMenus = [
  {
    labelKey: "nav.ride",
    links: [
      { labelKey: "nav.airportTransfer", href: "/airport-transfer" },
      { labelKey: "nav.aToB", href: "/a-to-b-transfer" },
      { labelKey: "nav.longJourney", href: "/long-journeys" },
    ],
  },
  {
    labelKey: "nav.trip",
    links: [
      { labelKey: "nav.hourlyDriver", href: "/hourly-driver" },
      { labelKey: "nav.pickupGuide", href: "/airport-pickup-instructions" },
    ],
  },
] as const satisfies readonly { labelKey: MessageKey; links: readonly { labelKey: MessageKey; href: string }[] }[];

export const aboutHref = "/about";

// Shown as top-level links after the dropdowns.
export const navLinks = [
  { labelKey: "nav.destinations", href: "/destinations" },
  { labelKey: "nav.blog", href: "/blog" },
  { labelKey: "nav.about", href: aboutHref },
] as const satisfies readonly { labelKey: MessageKey; href: string }[];

export function NavDropdown({
  label,
  links,
}: {
  label: string;
  links: readonly { label: string; href: string }[];
}) {
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
        className="flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        {label}
        <ChevronDown
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          size={18}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-50 mt-5 w-64 rounded-2xl bg-white p-2 text-ink shadow-xl"
        >
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
