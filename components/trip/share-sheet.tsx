"use client";

import { Copy, LoaderCircle, MessageSquareText, Share2, X } from "lucide-react";
import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useI18n } from "@/components/i18n-provider";

// "Share my trip": an icon in the trip header that opens a bottom sheet (same style as the
// language picker). The view-only link is created on first open; each app gets the link prefilled.
type App = { name: string; color: string; href?: (text: string, url: string) => string; native?: boolean };
const APPS: App[] = [
  { name: "Message", color: "#34C759", href: (text, url) => `sms:?&body=${encodeURIComponent(`${text} ${url}`)}` },
  { name: "WhatsApp", color: "#25D366", href: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  { name: "LINE", color: "#06C755", href: (_text, url) => `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}` },
  // KakaoTalk only allows direct sharing through its SDK with an app key, so it goes through the
  // phone's share menu (KakaoTalk is listed there when installed).
  { name: "Kakao", color: "#FEE500", native: true },
  { name: "Messenger", color: "#0084FF", href: (_text, url) => `fb-messenger://share/?link=${encodeURIComponent(url)}` },
];

export function ShareTripButton({ reference, query }: { reference: string; query: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"" | "copied" | "stopped" | "error">("");
  const leg = new URLSearchParams(query).get("leg");

  async function call(action: "create" | "revoke") {
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/trip/${encodeURIComponent(reference)}/share${leg ? `?leg=${leg}` : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { url?: string };
      if (!response.ok) throw new Error();
      if (action === "create") setUrl(result.url ?? null); else { setUrl(null); setStatus("stopped"); }
    } catch { setStatus("error"); } finally { setBusy(false); }
  }
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !url && !busy) void call("create");
  }
  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setStatus("copied"); } catch { setStatus("error"); }
  }
  async function native() {
    if (!url) return;
    if (navigator.share) { try { await navigator.share({ title: t("trip.share.message"), text: t("trip.share.message"), url }); return; } catch { return; } }
    await copy();
  }

  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Trigger aria-label={t("trip.share.title")} className="grid size-10 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
      <Share2 size={22} aria-hidden="true" />
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content className="font-home fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] flex-col rounded-t-[20px] bg-white text-navy shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom sm:inset-x-auto sm:left-1/2 sm:w-[520px] sm:-translate-x-1/2">
        <div className="flex items-end justify-between border-b border-[#EEF1F6] px-6 pt-6 sm:px-8">
          <DialogPrimitive.Title className="relative pb-4 text-lg font-bold leading-none text-navy">{t("trip.share.title")}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="mb-3 grid size-9 place-items-center rounded-full text-navy hover:bg-slate-100" aria-label={t("locale.close")}><X size={24} strokeWidth={2} /></DialogPrimitive.Close>
        </div>
        <DialogPrimitive.Description className="px-6 pt-4 text-sm leading-6 text-slate-600 sm:px-8">{t("trip.share.help")}</DialogPrimitive.Description>
        <div className="overflow-y-auto px-6 pb-8 pt-5 sm:px-8">
          {busy && !url ? <p className="flex items-center gap-2 py-6 text-sm text-slate-500"><LoaderCircle className="animate-spin motion-reduce:animate-none" size={18} aria-hidden="true" />{t("trip.share.create")}…</p>
            : url ? <>
              <ul className="grid grid-cols-5 gap-2">
                {APPS.map((app) => {
                  const icon = <span className="grid size-12 place-items-center rounded-full" style={{ background: app.color }} aria-hidden="true">
                    {app.name === "Message" ? <MessageSquareText size={22} className="text-white" /> : <span className={`text-[13px] font-extrabold ${app.name === "Kakao" ? "text-[#3A1D1D]" : "text-white"}`}>{app.name === "WhatsApp" ? "WA" : app.name === "Messenger" ? "M" : app.name === "LINE" ? "LINE" : "K"}</span>}
                  </span>;
                  const cls = "flex flex-col items-center gap-1.5 rounded-xl py-2 text-[12px] font-medium text-navy hover:bg-[#F5F7FA]";
                  return <li key={app.name}>{app.native
                    ? <button type="button" onClick={() => void native()} className={`${cls} w-full`}>{icon}{app.name}</button>
                    : <a href={app.href!(t("trip.share.message"), url)} target="_blank" rel="noreferrer" className={cls}>{icon}{app.name}</a>}</li>;
                })}
              </ul>
              <button type="button" onClick={() => void copy()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F5F7FA] font-semibold text-navy"><Copy size={18} aria-hidden="true" />{t("trip.share.copy")}</button>
              <button type="button" disabled={busy} onClick={() => void call("revoke")} className="mt-2 h-11 w-full rounded-xl text-sm font-semibold text-slate-600 hover:underline disabled:opacity-50">{t("trip.share.stop")}</button>
            </> : <button type="button" disabled={busy} onClick={() => void call("create")} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white disabled:opacity-50"><Share2 size={18} aria-hidden="true" />{t("trip.share.create")}</button>}
          <p aria-live="polite" className="mt-3 text-sm font-semibold text-slate-600">
            {status === "copied" ? t("trip.share.copied") : status === "stopped" ? t("trip.share.stopped") : status === "error" ? t("trip.share.error") : ""}
          </p>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
