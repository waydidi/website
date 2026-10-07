"use client";

import type { ReactNode } from "react";

export const inputCls = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-brand";
export const selectCls = "h-11 rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-brand";
export const areaCls = "min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-brand";
export const btnPrimary = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong disabled:opacity-60";
export const btnQuiet = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-700 hover:border-brand hover:text-brand-darker disabled:opacity-60";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1 text-[13px] font-semibold text-slate-800 ${className}`}>{label}{children}{hint && <span className="text-[12px] font-normal text-slate-500">{hint}</span>}</label>;
}

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Comma or line separated text ↔ list. */
export const toList = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

export async function api<T = { ok: boolean }>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

/** Re-encodes a photo as JPEG (max 1600 px) so it shows everywhere, including the itinerary PDF. */
export async function toJpeg(file: File, max = 1600): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (file.type === "image/jpeg" && scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export async function uploadImage(original: File) {
  const file = await toJpeg(original);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/blog/images", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
  return data.url;
}
