"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

// Sections with their own chrome. Matched by whole path segment, so e.g. "/driver"
// hides the header on /driver/trip/… but not on the public /drivers page.
const OWN_HEADER = ["/booking/confirmation", "/flights", "/admin", "/driver", "/trip", "/f", "/s"];
const HOMEPAGES = ["/"]; // it places the same header over its hero

export const inSection = (pathname: string, section: string) => pathname === section || pathname.startsWith(`${section}/`);

// The shared site header shows on every public page, including any new page, by default.
export function PublicPathHeader() {
  const pathname = usePathname() ?? "/";
  // Destination pages use the homepage booking hero, which brings its own header.
  if (HOMEPAGES.includes(pathname) || /^\/destinations\/[^/]+$/.test(pathname) || ["/airport-transfer", "/a-to-b-transfer", "/long-journeys"].includes(pathname) || OWN_HEADER.some((s) => inSection(pathname, s))) return null;
  return <div className="public-path-header"><SiteHeader /></div>;
}
