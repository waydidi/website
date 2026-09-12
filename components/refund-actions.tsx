"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

export function RefundActions({reference}:{reference:string}){
  const router=useRouter(),[mode,setMode]=useState<"idle"|"decline">("idle"),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function decide(action:"approve"|"decline"){
    if(action==="approve"&&!confirm(`Approve the refund for ${reference}? Money will be returned through Stripe.`))return;
    setBusy(true);setError("");
    const response=await fetch("/api/admin/refunds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference,action,reason})});
    const result=await response.json() as {error?:string};setBusy(false);
    if(!response.ok){setError(result.error??"Refund decision failed.");return;}
    router.refresh();
  }
  if(mode==="decline")return <div className="min-w-64 space-y-2"><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={300} rows={2} placeholder="Reason for declining" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"/><div className="flex gap-2"><button disabled={busy||reason.trim().length<3} onClick={()=>decide("decline")} className="rounded-full bg-[#211726] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">Confirm decline</button><button disabled={busy} onClick={()=>setMode("idle")} className="rounded-full border px-4 py-2 text-xs font-bold">Back</button></div>{error&&<p className="text-xs font-semibold text-red-700">{error}</p>}</div>;
  return <div><div className="flex gap-2"><button disabled={busy} onClick={()=>decide("approve")} className="inline-flex items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy?<Loader2 className="animate-spin" size={14}/>:<Check size={14}/>}Approve refund</button><button disabled={busy} onClick={()=>setMode("decline")} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-xs font-bold"><X size={14}/>Decline</button></div>{error&&<p className="mt-2 text-xs font-semibold text-red-700">{error}</p>}</div>;
}
