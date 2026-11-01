"use client";
import { useI18n } from "@/components/i18n-provider";
import { useCurrency } from "@/components/use-currency";
import { cancellationFareMinor, type CancellationConfig, type CancellationOption } from "@/lib/cancellation-options";

export function CancellationChoice({config,option,onChange,fare,online,hours}:{config:CancellationConfig;option:CancellationOption;onChange:(value:CancellationOption)=>void;fare:number;online:boolean;hours:number}) {
 const {t}=useI18n(); const {money}=useCurrency();
 const options:CancellationOption[]=["standard",...(online&&hours>48?["non_refundable" as const]:[]),"flexible"];
 return <fieldset className="mx-auto my-5 max-w-[1120px] rounded-card border bg-white p-5">
  <legend className="px-2 font-bold">{t("cancellation.choose")}</legend>
  <div className="grid gap-3 sm:grid-cols-3">{options.map(value=><label key={value} className={`flex min-h-tap cursor-pointer gap-3 rounded-lg border p-4 ${value===option?"border-brand bg-brand-wash":"border-slate-200"}`}>
   <input type="radio" name="cancellation-option" value={value} checked={value===option} onChange={()=>onChange(value)} className="mt-1 accent-brand" />
   <span><strong className="block">{t(`cancellation.${value}`)}</strong><span className="mt-1 block text-sm">{t(`cancellation.${value}Terms`,{hours:config.fullRefundHours})}</span><span className="mt-2 block font-bold">{money(cancellationFareMinor(Math.round(fare*100),value,config)/100)}</span></span>
  </label>)}</div>
  <p className="mt-3 text-sm text-slate-600">{t("cancellation.fareNote")}</p>
 </fieldset>;
}
