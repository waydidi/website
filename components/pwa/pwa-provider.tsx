"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PwaState = {
  installed: boolean;
  canPrompt: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};
const PwaContext = createContext<PwaState>({ installed: false, canPrompt: false, install: async () => "unavailable" });
export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const frame = requestAnimationFrame(syncInstalled);
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", syncInstalled);

    // Local Vite/HMR must not acquire a persistent production worker.
    if (process.env.NODE_ENV === "production" && window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Browsing and booking still work if installation is unavailable.
      });
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", syncInstalled);
    };
  }, []);

  async function install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!prompt) return "unavailable";
    try {
      // Invoke prompt immediately inside the user's click gesture.
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
      return choice.outcome;
    } catch { setPrompt(null); return "unavailable"; }
  }

  return <PwaContext.Provider value={{ installed, canPrompt: Boolean(prompt), install }}>{children}</PwaContext.Provider>;
}
