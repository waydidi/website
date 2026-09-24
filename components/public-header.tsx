"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

// Renders the shared site header on every public page except the homepage,
// which places the same header over its hero itself.
export function PublicPathHeader() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/booking/confirmation") || pathname.startsWith("/admin") || pathname.startsWith("/driver")) return null;
  return <div className="public-path-header"><SiteHeader /></div>;
}
