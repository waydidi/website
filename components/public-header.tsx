"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

// Sections with their own chrome. Matched by whole path segment, so e.g. "/driver"
// hides the header on /driver/trip/… but not on the public /drivers page.
const OWN_HEADER = ["/booking/confirmation", "/admin", "/driver", "/trip"];
const HOMEPAGES = ["/", "/th", "/zh"]; // they place the same header over their hero

export const inSection = (pathname: string, section: string) => pathname === section || pathname.startsWith(`${section}/`);

// The shared site header shows on every public page, including any new page, by default.
export function PublicPathHeader() {
  const pathname = usePathname() ?? "/";
  if (HOMEPAGES.includes(pathname) || OWN_HEADER.some((s) => inSection(pathname, s))) return null;
  return <div className="public-path-header"><SiteHeader /></div>;
}
