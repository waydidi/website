"use client";
import { useI18n } from "@/components/i18n-provider";
import { useCurrency } from "@/components/use-currency";
export function VehicleUpgrade({name,difference,onSelect}:{name:string;difference:number;onSelect:()=>void}) {
 const {t}=useI18n();const {money}=useCurrency();
 return <button type="button" onClick={onSelect} className="mt-4 flex min-h-tap w-full items-center justify-between gap-3 rounded-lg border border-brand bg-brand-wash p-4 text-left text-ink">
  <span><strong className="block">{t("vehicle.upgrade",{name})}</strong><span className="text-sm">{t("vehicle.upgradeNote")}</span></span><strong className="shrink-0">{difference>=0?"+":"−"}{money(Math.abs(difference))}</strong>
 </button>;
}
