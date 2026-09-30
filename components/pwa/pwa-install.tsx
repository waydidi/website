"use client";

import { useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { getMessages, type Locale } from "@/lib/i18n";

type Platform = "ios" | "android" | "desktop";
export function PwaInstall({ locale = "en" }: { locale?: Locale }) {
  const { installed, canPrompt, install } = usePwa();
  const messages = getMessages(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [busy, setBusy] = useState(false);
  if (installed) return null;

  function showInstructions() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(ios ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop");
    dialog.current?.showModal();
  }
  async function onInstall() {
    if (!canPrompt) { showInstructions(); return; }
    setBusy(true);
    try { if (await install() === "unavailable") showInstructions(); }
    finally { setBusy(false); }
  }

  return <div className="mt-5">
    <button type="button" onClick={onInstall} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-60">
      <Download size={16} aria-hidden="true" />{messages["pwa.install"]}
    </button>
    <p className="mt-2 max-w-60 text-xs leading-relaxed text-white">{messages["pwa.description"]}</p>
    <dialog ref={dialog} aria-labelledby={`pwa-title-${locale}`} aria-describedby={`pwa-description-${locale}`} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/50">
      <div className="flex items-start justify-between gap-4">
        <h2 id={`pwa-title-${locale}`} className="text-xl font-bold">{messages["pwa.title"]}</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label={messages["pwa.close"]} className="rounded-full p-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#FE8B05]"><X size={20} aria-hidden="true" /></button>
      </div>
      <p id={`pwa-description-${locale}`} className="mt-4 text-sm leading-relaxed">{messages[`pwa.${platform}`]}</p>
      <p className="mt-4 rounded-xl bg-orange-50 p-3 text-sm leading-relaxed">{messages["pwa.onlineRequired"]}</p>
      <button type="button" onClick={() => dialog.current?.close()} className="mt-5 w-full rounded-full bg-slate-900 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FE8B05]">{messages["pwa.done"]}</button>
    </dialog>
  </div>;
}
