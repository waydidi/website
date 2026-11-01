"use client";
import { useI18n } from "@/components/i18n-provider";
import type { CancellationConfig, CancellationOption } from "@/lib/cancellation-options";
export function CancellationPolicyOptions({config}:{config:CancellationConfig}) {
 const {t}=useI18n();
 if(!config.enabled) return null;
 return <section className="my-8 rounded-card bg-brand-wash p-5" aria-label={t("cancellation.choose")}>
  <h2 className="mb-4 text-2xl font-black">{t("cancellation.choose")}</h2>
  <div className="grid gap-4 sm:grid-cols-3">{(["standard","non_refundable","flexible"] as const).map(option=><PurchasedCancellationPolicy key={option} option={option} hours={config.fullRefundHours}/>)}</div>
  <p className="mt-4 text-sm">{t("cancellation.fareNote")}</p>
 </section>;
}
export function PurchasedCancellationPolicy({option,hours=12}:{option:CancellationOption;hours?:number}) {
 const {t}=useI18n();
 return <p className="text-sm leading-6"><strong>{t(`cancellation.${option}`)}</strong>: {t(`cancellation.${option}Terms`,{hours})}</p>;
}
