"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

// Light/dark switch for the admin. The admin shell owns the setting (remembered on this device);
// this asks it to change and follows its "waydidi:theme" announcements.
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("admin-dark"));
    const follow = (e: Event) => setDark((e as CustomEvent<boolean>).detail);
    window.addEventListener("waydidi:theme", follow);
    return () => window.removeEventListener("waydidi:theme", follow);
  }, []);
  const pick = (next: boolean) => window.dispatchEvent(new CustomEvent("waydidi:set-theme", { detail: next }));
  const option = (on: boolean) => `flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-semibold transition ${on ? "bg-white text-night shadow-sm" : "text-slate-500 hover:text-night"}`;
  return <div role="radiogroup" aria-label="Appearance" className="flex w-full max-w-xs gap-1 rounded-full bg-slate-100 p-1">
    <button type="button" role="radio" aria-checked={!dark} onClick={() => pick(false)} className={option(!dark)}><Sun size={16} aria-hidden="true" />Light</button>
    <button type="button" role="radio" aria-checked={dark} onClick={() => pick(true)} className={option(dark)}><Moon size={16} aria-hidden="true" />Dark</button>
  </div>;
}
