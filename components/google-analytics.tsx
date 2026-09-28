"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Staff and partner areas are not counted.
const PRIVATE = /^\/(admin|driver|agency|f\/|trip\/)/;

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }

// Google Analytics 4 (GA_MEASUREMENT_ID in Cloudflare). Sends a page view on every page change.
export function GoogleAnalytics({ id }: { id: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!id || PRIVATE.test(pathname)) return;
    if (!window.gtag) {
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = function gtag() { window.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
      window.gtag("js", new Date());
      window.gtag("config", id, { send_page_view: false });
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(script);
    }
    window.gtag("event", "page_view", { page_path: pathname + window.location.search, page_location: window.location.href, page_title: document.title });
  }, [id, pathname]);
  return null;
}
