"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import type { MessageKey } from "@/lib/i18n";

export const aboutHref = "/about";

type NavLink = { labelKey: MessageKey; href: string };
export type NavItem = { type: "menu"; labelKey: MessageKey; links: readonly NavLink[] } | ({ type: "link" } & NavLink);

// The header's items, in the same order and with the same shape as Daytrip's: a services menu, a destinations link,
// a travel agents and business menu, and a driver link, then the language button and Sign in (drawn by the header).
// "Check your booking", the travel guides and About live in the phone menu and the footer.
export const navItems: readonly NavItem[] = [
  {
    type: "menu",
    labelKey: "nav.ourServices",
    links: [
      { labelKey: "nav.aToB", href: "/a-to-b-transfer" },
      { labelKey: "nav.airportTransfer", href: "/airport-transfer" },
      { labelKey: "nav.hourlyDriver", href: "/hourly-driver" },
      { labelKey: "nav.dayTrips", href: "/trips" },
    ],
  },
  { type: "link", labelKey: "nav.ourDestinations", href: "/destinations" },
  {
    type: "menu",
    labelKey: "nav.travelAgentsB2B",
    links: [
      { labelKey: "nav.agentLogin", href: "/agency" },
      { labelKey: "nav.travelAgents", href: "/agencies" },
      { labelKey: "nav.partners", href: "/partners" },
    ],
  },
  { type: "link", labelKey: "nav.becomeDriver", href: "/drivers" },
];

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
      <DropdownMenu.Trigger className="flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
        {label}
        <ChevronDown
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          size={14}
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
