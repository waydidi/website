"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

// Renders the shared site header on every public page except the homepages,
// which place the same header over their hero themselves.
export function PublicPathHeader() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/th" || pathname === "/zh" || pathname.startsWith("/booking/confirmation") || pathname.startsWith("/admin") || pathname.startsWith("/driver") || pathname.startsWith("/trip/")) return null;
  return <div className="public-path-header"><SiteHeader /></div>;
}
