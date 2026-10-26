"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { BookingChangeEvent } from "@/lib/booking-change-history";
import { intlLocale } from "@/lib/i18n";

type Data = { events: BookingChangeEvent[]; hasMore: boolean };
export function BookingChangeHistory({ refreshKey }: { refreshKey: string }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<Data | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(false);
      try {
        const response = await fetch(`/api/bookings/manage/change-history?offset=${offset}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("HISTORY_UNAVAILABLE");
        const value = await response.json() as Data;
        if (!controller.signal.aborted) setData(value);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [refreshKey, revision, offset]);
  const money = (minor: number) => new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "THB" }).format(minor / 100);
  return <section aria-labelledby="journey-change-history-title" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="journey-change-history-title" className="text-xl font-black">{t("payment.change.historyTitle")}</h2><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="rounded-full border px-4 py-2 text-sm font-bold disabled:opacity-50">{t("payment.change.refresh")}</button></div>
    <p className="mt-3 text-sm text-slate-600">{t("payment.change.noMoney")}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{t("payment.change.historyError")}</p>}
    <div aria-live="polite" aria-busy={loading}>
      {data?.events.length === 0 && <p className="mt-4 text-sm text-slate-600">{t("payment.change.noHistory")}</p>}
      <ol className="mt-4 divide-y divide-slate-100">{data?.events.map(event => <li key={event.id} className="py-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{t(`payment.change.${event.status}`)}</strong><time dateTime={event.createdAt} className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString(intlLocale(locale), { timeZone: "Asia/Bangkok" })}</time></div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">{t("payment.change.original")}</dt><dd className="font-bold">{money(event.originalMinor)}</dd></div>
          <div><dt className="text-slate-500">{t("payment.change.revised")}</dt><dd className="font-bold">{money(event.revisedMinor)}</dd></div>
          <div><dt className="text-slate-500">{t("payment.change.difference")}</dt><dd className="font-bold">{event.differenceMinor > 0 ? "+" : ""}{money(event.differenceMinor)}</dd></div>
        </dl>
      </li>)}</ol>
      {data && <nav aria-label={t("payment.change.historyTitle")} className="mt-3 flex gap-3"><button type="button" disabled={offset === 0 || loading} onClick={() => { setOffset(value => Math.max(0, value - 20)); setData(null); }} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50">{t("payment.change.newer")}</button><button type="button" disabled={!data.hasMore || loading} onClick={() => { setOffset(value => value + 20); setData(null); }} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50">{t("payment.change.older")}</button></nav>}
    </div>
  </section>;
}
