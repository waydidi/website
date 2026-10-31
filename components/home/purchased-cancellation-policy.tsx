"use client";
import { useI18n } from "@/components/i18n-provider";
import type { CancellationOption } from "@/lib/cancellation-options";
export function PurchasedCancellationPolicy({option,hours=12}:{option:CancellationOption;hours?:number}) {
 const {t}=useI18n();
 return <p className="text-sm leading-6"><strong>{t(`cancellation.${option}`)}</strong>: {t(`cancellation.${option}Terms`,{hours})}</p>;
}
