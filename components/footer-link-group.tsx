import Link from "next/link";
import { ChevronDown } from "lucide-react";

type FooterLink = { label: string; href: string };

/**
 * One group of footer links. Phones: a section that opens and closes (title, chevron, thin line
 * above; below the last group, the footer's own divider closes the list). From `sm` up: a plain
 * column, always open.
 * Uses <details>, so it works without JavaScript and with the keyboard.
 */
export function FooterLinkGroup({ title, links }: { title: string; links: FooterLink[] }) {
  return <div className="border-t border-white/30 sm:border-0">
    <details className="group sm:hidden">
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-black [&::-webkit-details-marker]:hidden">
        <h3>{title}</h3>
        <ChevronDown size={22} strokeWidth={2.2} aria-hidden="true" className="shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ul className="space-y-1 pb-5 text-base text-white/90">
        {links.map((link) => <li key={link.href}><Link href={link.href} className="flex min-h-tap items-center hover:text-white hover:underline">{link.label}</Link></li>)}
      </ul>
    </details>
    <div className="hidden sm:block">
      <h3 className="font-black">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-white/90">
        {links.map((link) => <li key={link.href}><Link href={link.href} className="hover:text-white hover:underline">{link.label}</Link></li>)}
      </ul>
    </div>
  </div>;
}
