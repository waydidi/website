"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DropdownMenu } from "radix-ui";
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

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger className="flex cursor-pointer items-center gap-2 rounded-full px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
        {label}
        <ChevronDown
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          size={18}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={20}
          aria-label={label}
          className="z-50 w-64 rounded-2xl bg-white p-2 font-home font-semibold text-ink shadow-xl"
        >
          {links.map((link) => (
            <DropdownMenu.Item key={link.href} asChild>
              <Link
                href={link.href}
                className="block rounded-xl px-4 py-3 outline-none data-[highlighted]:bg-orange-50"
              >
                {link.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
