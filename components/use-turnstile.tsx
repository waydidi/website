"use client";

import { useCallback, useEffect, useRef } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error("turnstile")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Invisible Cloudflare Turnstile check. Put `widget` inside the form and call
 * `getToken()` just before submitting. Returns "" when Turnstile is not set up;
 * the server then lets the request through.
 */
export function useTurnstile(action: string) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const waiting = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const finish = (token: string) => { waiting.current?.(token); waiting.current = null; };
    fetch("/api/turnstile")
      .then((response) => response.json() as Promise<{ siteKey: string | null }>)
      .then(async ({ siteKey }) => {
        if (!siteKey || cancelled) return;
        await loadScript();
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: siteKey,
          action,
          execution: "execute",
          appearance: "interaction-only",
          callback: (token: string) => finish(token),
          "error-callback": () => finish(""),
          "expired-callback": () => finish(""),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action]);

  const getToken = useCallback(() => {
    const id = widgetId.current;
    if (!id || !window.turnstile) return Promise.resolve("");
    return new Promise<string>((resolve) => {
      waiting.current = resolve;
      window.turnstile!.reset(id);
      window.turnstile!.execute(id);
      // A visible challenge may appear; give the visitor time to finish it.
      setTimeout(() => { if (waiting.current === resolve) { waiting.current = null; resolve(""); } }, 60_000);
    });
  }, []);

  return { widget: <div ref={holder} className="empty:hidden" />, getToken };
}
