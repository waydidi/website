"use client";
import Image from "next/image";
import { useI18n } from "@/components/i18n-provider";
import { useCurrency } from "@/components/use-currency";
import type { RouteStopCard } from "@/lib/route-stop-selection";

export function RouteStopChoice({ offers, selected, onToggle, totalMinor, pending, error }: {
  offers: RouteStopCard[]; selected: string[]; onToggle: (id: string) => void; totalMinor: number; pending: boolean; error: boolean;
}) {
  const { t } = useI18n(); const { money } = useCurrency();
  if (!offers.length) return null;
  return <fieldset className="mx-auto my-5 max-w-[1120px] rounded-card border border-slate-200 bg-white p-5">
    <legend className="px-2 font-bold">{t("routeStops.choose")}</legend>
    <p className="mb-4 text-sm text-slate-600">{t("routeStops.description")}</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{offers.map(offer => {
      const checked = selected.includes(offer.id);
      return <label key={offer.id} className={`overflow-hidden rounded-lg border ${checked ? "border-brand bg-brand-wash" : "border-slate-200"}`}>
        {offer.photo && <Image src={offer.photo} alt="" width={480} height={240} className="h-36 w-full object-cover" />}
        <span className="flex min-h-tap gap-3 p-4">
          <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 3} onChange={() => onToggle(offer.id)} className="mt-1 accent-brand" />
          <span><strong className="block">{offer.name}</strong><span className="mt-1 block text-sm">{t("routeStops.duration", { minutes: offer.durationMinutes })}</span><span className="mt-2 block font-bold">+{money(offer.priceMinor / 100)}</span></span>
        </span>
      </label>;
    })}</div>
    <p className="mt-4 text-sm text-slate-600">{t("routeStops.comfort")}</p>
    <p className="mt-2 font-bold" aria-live="polite">{pending ? t("routeStops.checking") : error ? t("routeStops.error") : t("routeStops.total", { amount: money(totalMinor / 100) })}</p>
  </fieldset>;
}
