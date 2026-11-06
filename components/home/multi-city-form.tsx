"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { MULTI_CITY_MAX_LEGS, MULTI_CITY_MIN_LEGS, type MultiCityLeg } from "@/lib/multi-city";
import type { MessageKey } from "@/lib/i18n";

const emptyLeg = (): MultiCityLeg => ({ from: "", to: "", date: "", time: "" });
const cellClass = "block min-w-0 bg-white focus-within:bg-orange-50 px-4 py-2.5 lg:px-0 lg:py-1";
const cellLabel = "block text-[12px] font-semibold leading-4 text-slate-800";
const cellInput = "block h-6 w-full min-w-0 border-0 bg-transparent p-0 text-[15px] leading-6 text-slate-900 focus:outline-none";

// Rendered inside the booking search <form>, so it submits with a button and never as a nested form.
export function MultiCityForm({ t }: { t: (key: MessageKey) => string }) {
  const [legs, setLegs] = useState<MultiCityLeg[]>([emptyLeg(), emptyLeg()]);
  const [contact, setContact] = useState({ name: "", phone: "", email: "", note: "" });
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState(2);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const requestId = useRef("");

  const editLeg = (index: number, field: keyof MultiCityLeg, value: string) => {
    requestId.current = "";
    setLegs((current) => current.map((leg, i) => {
      if (i === index) return { ...leg, [field]: value };
      // The next leg usually starts where this one ends.
      if (field === "to" && i === index + 1 && (!leg.from || leg.from === current[index].to)) return { ...leg, from: value };
      return leg;
    }));
  };
  const editContact = (field: keyof typeof contact, value: string) => { requestId.current = ""; setContact((current) => ({ ...current, [field]: value })); };
  const keepEnterHere = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLButtonElement)) event.preventDefault(); };

  async function submit() {
    if (status !== "idle") return;
    setStatus("sending"); setError("");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/multi-city-requests", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, ...contact, passengers, luggage, legs }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { if (response.status === 409) requestId.current = ""; throw new Error(result.error ?? t("multiCity.error")); }
      setStatus("sent");
    } catch (e) { setError(e instanceof Error ? e.message : t("multiCity.error")); setStatus("idle"); }
  }

  if (status === "sent") return <div role="status" className="rounded-[16px] bg-white p-6 text-slate-900 shadow-md"><p className="text-lg font-bold">{t("multiCity.sentTitle")}</p><p className="mt-2 text-slate-600">{t("multiCity.sentBody")}</p></div>;

  return <div onKeyDown={keepEnterHere} data-testid="multi-city-form" className="text-slate-900">
    <p className="sr-only">{t("multiCity.intro")}</p>
    <div className="rounded-[24px] bg-white/15 p-2 sm:rounded-[28px] sm:p-2.5">
      <ol className="grid gap-2">
        {legs.map((leg, index) => <li key={index} className="grid gap-px overflow-hidden rounded-[20px] bg-slate-200 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.15fr_auto] lg:items-stretch lg:gap-0 lg:rounded-full lg:bg-white lg:py-[5px] lg:pl-4 lg:pr-2">
          <label className={`${cellClass} lg:border-r lg:border-slate-200`}><span className={cellLabel}>{t("multiCity.from")}</span><input className={cellInput} value={leg.from} maxLength={140} onChange={(e) => editLeg(index, "from", e.target.value)} /></label>
          <label className={`${cellClass} lg:border-r lg:border-slate-200 lg:pl-5`}><span className={cellLabel}>{t("multiCity.to")}</span><input className={cellInput} value={leg.to} maxLength={140} onChange={(e) => editLeg(index, "to", e.target.value)} /></label>
          <div className={`${cellClass} grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 lg:pl-5`}>
            <label className="min-w-0"><span className={cellLabel}>{t("multiCity.date")}</span><input type="date" className={cellInput} value={leg.date} onChange={(e) => editLeg(index, "date", e.target.value)} /></label>
            <label className="min-w-0"><span className={cellLabel}>{t("multiCity.time")}</span><input type="time" className={cellInput} value={leg.time} onChange={(e) => editLeg(index, "time", e.target.value)} /></label>
          </div>
          <div className="flex items-center justify-center bg-white px-2 sm:col-span-2 lg:col-span-1 lg:w-11 lg:px-0">
            {legs.length > MULTI_CITY_MIN_LEGS ? <button type="button" onClick={() => { requestId.current = ""; setLegs((current) => current.filter((_, i) => i !== index)); }} aria-label={`${t("multiCity.remove")} ${index + 1}`} className="inline-flex size-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><X className="size-5" aria-hidden="true" /></button> : <span className="hidden size-10 lg:block" aria-hidden="true" />}
          </div>
        </li>)}
      </ol>
      {legs.length < MULTI_CITY_MAX_LEGS && <button type="button" onClick={() => { requestId.current = ""; setLegs((current) => [...current, { ...emptyLeg(), from: current[current.length - 1].to }]); }} className="mx-auto mt-2 flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Plus className="size-4" aria-hidden="true" />{t("multiCity.addLeg")}</button>}
    </div>
    <div className="mt-3 grid gap-px overflow-hidden rounded-[20px] bg-slate-200 sm:grid-cols-3 lg:gap-0 lg:rounded-full lg:bg-white lg:py-[5px] lg:px-4">
      <label className={`${cellClass} lg:border-r lg:border-slate-200`}><span className={cellLabel}>{t("multiCity.name")}</span><input autoComplete="name" className={cellInput} value={contact.name} maxLength={100} onChange={(e) => editContact("name", e.target.value)} /></label>
      <label className={`${cellClass} lg:border-r lg:border-slate-200 lg:pl-5`}><span className={cellLabel}>{t("multiCity.phone")}</span><input type="tel" autoComplete="tel" className={cellInput} value={contact.phone} maxLength={40} onChange={(e) => editContact("phone", e.target.value)} /></label>
      <label className={`${cellClass} lg:pl-5`}><span className={cellLabel}>{t("multiCity.email")}</span><input type="email" autoComplete="email" className={cellInput} value={contact.email} maxLength={254} onChange={(e) => editContact("email", e.target.value)} /></label>
    </div>
    <label className="mt-3 block rounded-[20px] bg-white px-4 py-2.5 lg:rounded-full lg:px-5"><span className={cellLabel}>{t("multiCity.note")}</span><input maxLength={500} className={cellInput} value={contact.note} onChange={(e) => editContact("note", e.target.value)} /></label>
    {error && <p role="alert" className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid grid-cols-2 gap-3 rounded-[20px] bg-white px-5 py-2.5 sm:gap-6 lg:rounded-full">
        <label className="min-w-0"><span className={cellLabel}>{t("multiCity.passengers")}</span><input type="number" min={1} max={20} className={`${cellInput} sm:w-24`} value={passengers} onChange={(e) => { requestId.current = ""; setPassengers(Number(e.target.value)); }} /></label>
        <label className="min-w-0"><span className={cellLabel}>{t("multiCity.bags")}</span><input type="number" min={0} max={30} className={`${cellInput} sm:w-24`} value={luggage} onChange={(e) => { requestId.current = ""; setLuggage(Number(e.target.value)); }} /></label>
      </div>
      <button type="button" onClick={submit} disabled={status === "sending"} className="min-h-[54px] rounded-full bg-[#0E0F12] px-8 text-[16px] font-semibold text-white shadow-lg shadow-orange-900/20 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60">{status === "sending" ? t("multiCity.sending") : t("multiCity.submit")}</button>
    </div>
    <p className="mt-2 text-sm text-white/85">{t("multiCity.noPayment")}</p>
  </div>;
}
