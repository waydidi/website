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
 *
 * With `{ visible: true }` the check box is shown in the form (it runs on its own and turns to "Success!"),
 * and `getToken()` hands over that result, then starts a fresh check for the next submit.
 */
export function useTurnstile(action: string, options: { visible?: boolean } = {}) {
  const visible = Boolean(options.visible);
  const solved = useRef("");
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const waiting = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const finish = (token: string) => { solved.current = token; waiting.current?.(token); waiting.current = null; };
    fetch("/api/turnstile")
      .then((response) => response.json() as Promise<{ siteKey: string | null }>)
      .then(async ({ siteKey }) => {
        if (!siteKey || cancelled) return;
        await loadScript();
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: siteKey,
          action,
          ...(visible ? { size: "flexible", appearance: "always" } : { execution: "execute", appearance: "interaction-only" }),
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
  }, [action, visible]);

  const getToken = useCallback(() => {
    const id = widgetId.current;
    if (!id || !window.turnstile) return Promise.resolve("");
    if (visible) {
      // The visible check already ran: use its result once, then check again for the next submit (a token works once).
      const ready = solved.current;
      if (ready) { solved.current = ""; window.turnstile.reset(id); return Promise.resolve(ready); }
      return new Promise<string>((resolve) => { waiting.current = resolve; setTimeout(() => { if (waiting.current === resolve) { waiting.current = null; resolve(""); } }, 60_000); });
    }
    return new Promise<string>((resolve) => {
      waiting.current = resolve;
      window.turnstile!.reset(id);
      window.turnstile!.execute(id);
      // A visible challenge may appear; give the visitor time to finish it.
      setTimeout(() => { if (waiting.current === resolve) { waiting.current = null; resolve(""); } }, 60_000);
    });
  }, [visible]);

  return { widget: <div ref={holder} className="empty:hidden" />, getToken };
}
