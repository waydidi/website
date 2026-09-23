"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
      { label: "Destinations", href: "/destinations" },
      { label: "Airport pickup guide", href: "/airport-pickup-instructions" },
    ],
  },
] as const;

export const aboutHref = "/about";

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
        className="flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
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
          className="absolute left-0 top-full z-50 mt-5 w-64 rounded-2xl bg-white p-2 text-[#21140A] shadow-xl"
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
