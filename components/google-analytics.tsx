"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { browserAnalyticsAllowed, publicAnalyticsPath } from "@/lib/privacy-consent";

// Staff and partner areas are not counted.

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }

// Google Analytics 4 (GA_MEASUREMENT_ID in Cloudflare). Sends a page view on every page change.
export function GoogleAnalytics({ id }: { id: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!id) return;
    const disable = (value: boolean) => { (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = value; };
    const send = () => {
    const path = publicAnalyticsPath(pathname);
    const allowed = Boolean(path) && browserAnalyticsAllowed();
    disable(!allowed);
    if (!allowed || !path) return;
    const page = { page_path: path, page_location: window.location.origin + path, page_title: "Waydidi", page_referrer: "" };
    if (!window.gtag) {
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = function gtag() { window.dataLayer!.push(arguments); }; // eslint-disable-line prefer-rest-params
      window.gtag("js", new Date());
      window.gtag("config", id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, ...page });
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(script);
    }
    window.gtag("set", page);
    window.gtag("event", "page_view", page);
    };
    send();
    window.addEventListener("waydidi:consent", send);
    return () => { disable(true); window.removeEventListener("waydidi:consent", send); };
  }, [id, pathname]);
  return null;
}
