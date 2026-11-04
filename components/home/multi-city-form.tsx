"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MULTI_CITY_MAX_LEGS, MULTI_CITY_MIN_LEGS, type MultiCityLeg } from "@/lib/multi-city";
import type { MessageKey } from "@/lib/i18n";

const emptyLeg = (): MultiCityLeg => ({ from: "", to: "", date: "", time: "" });
const inputClass = "mt-1 h-11 w-full min-w-0 rounded-[10px] border border-slate-300 bg-white px-3 text-[15px] text-slate-900";
const labelClass = "block min-w-0 text-[13px] font-semibold text-slate-700";

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

  return <div onKeyDown={keepEnterHere} data-testid="multi-city-form" className="rounded-[16px] bg-white p-4 text-slate-900 shadow-md sm:p-5">
    <p className="text-[15px] text-slate-600">{t("multiCity.intro")}</p>
    <ol className="mt-4 grid gap-4">
      {legs.map((leg, index) => <li key={index} className="rounded-[12px] border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">{t("multiCity.leg")} {index + 1}</p>
          {legs.length > MULTI_CITY_MIN_LEGS && <button type="button" onClick={() => { requestId.current = ""; setLegs((current) => current.filter((_, i) => i !== index)); }} aria-label={`${t("multiCity.remove")} ${index + 1}`} className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Trash2 className="size-4" aria-hidden="true" /></button>}
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={labelClass}>{t("multiCity.from")}<input className={inputClass} value={leg.from} maxLength={140} onChange={(e) => editLeg(index, "from", e.target.value)} /></label>
          <label className={labelClass}>{t("multiCity.to")}<input className={inputClass} value={leg.to} maxLength={140} onChange={(e) => editLeg(index, "to", e.target.value)} /></label>
          <label className={labelClass}>{t("multiCity.date")}<input type="date" className={inputClass} value={leg.date} onChange={(e) => editLeg(index, "date", e.target.value)} /></label>
          <label className={labelClass}>{t("multiCity.time")}<input type="time" className={inputClass} value={leg.time} onChange={(e) => editLeg(index, "time", e.target.value)} /></label>
        </div>
      </li>)}
    </ol>
    {legs.length < MULTI_CITY_MAX_LEGS && <button type="button" onClick={() => { requestId.current = ""; setLegs((current) => [...current, { ...emptyLeg(), from: current[current.length - 1].to }]); }} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 font-semibold text-brand-deep hover:bg-orange-50"><Plus className="size-4" aria-hidden="true" />{t("multiCity.addLeg")}</button>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className={labelClass}>{t("multiCity.name")}<input autoComplete="name" className={inputClass} value={contact.name} maxLength={100} onChange={(e) => editContact("name", e.target.value)} /></label>
      <label className={labelClass}>{t("multiCity.phone")}<input type="tel" autoComplete="tel" className={inputClass} value={contact.phone} maxLength={40} onChange={(e) => editContact("phone", e.target.value)} /></label>
      <label className={labelClass}>{t("multiCity.email")}<input type="email" autoComplete="email" className={inputClass} value={contact.email} maxLength={254} onChange={(e) => editContact("email", e.target.value)} /></label>
      <label className={labelClass}>{t("multiCity.passengers")}<input type="number" min={1} max={20} className={inputClass} value={passengers} onChange={(e) => { requestId.current = ""; setPassengers(Number(e.target.value)); }} /></label>
      <label className={labelClass}>{t("multiCity.bags")}<input type="number" min={0} max={30} className={inputClass} value={luggage} onChange={(e) => { requestId.current = ""; setLuggage(Number(e.target.value)); }} /></label>
    </div>
    <label className={`${labelClass} mt-3`}>{t("multiCity.note")}<textarea rows={2} maxLength={500} className="mt-1 w-full rounded-[10px] border border-slate-300 bg-white p-3 text-[15px] text-slate-900" value={contact.note} onChange={(e) => editContact("note", e.target.value)} /></label>
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
    <button type="button" onClick={submit} disabled={status === "sending"} className="mt-4 min-h-12 w-full rounded-[12px] bg-brand px-6 font-bold text-white disabled:opacity-60 sm:w-auto">{status === "sending" ? t("multiCity.sending") : t("multiCity.submit")}</button>
    <p className="mt-2 text-sm text-slate-500">{t("multiCity.noPayment")}</p>
  </div>;
}
