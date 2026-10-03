"use client";

import type { ReactNode } from "react";

export const inputCls = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]";
export const selectCls = "h-11 rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-[#FF8A05]";
export const areaCls = "min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[15px] outline-none focus:border-[#FF8A05]";
export const btnPrimary = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#FF8A05] px-4 text-[15px] font-semibold text-white hover:bg-[#E67900] disabled:opacity-60";
export const btnQuiet = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-700 hover:border-[#FF8A05] hover:text-[#C96100] disabled:opacity-60";

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

export async function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/blog/images", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
  return data.url;
}
