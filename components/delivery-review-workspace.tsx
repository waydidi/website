"use client";

import { useEffect, useState } from "react";
import { deliveryKinds, reviewReasonLabels, type DeliveryKind, type DeliveryReviewInput } from "@/lib/delivery-review-rules";
import type { publicDeliveryJob } from "@/lib/delivery-review-db";

type Job=Awaited<ReturnType<typeof publicDeliveryJob>>;
type HistoryRow={sequence:number;request_id:string;actor_id:string;action:string;reason:keyof typeof reviewReasonLabels;previous_status:string;previous_attempts:number;created_at:string;provider_message_id:string|null};
type Detail={job:Job;history:{items:HistoryRow[];hasMore:boolean;offset:number};retryEnabled:boolean};
type Listing={items:Job[];hasMore:boolean;offset:number;retryEnabled:boolean};
const field="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const button="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-40";
const time=(value:unknown)=>typeof value==="string"?new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Bangkok"}):"Not recorded";
const actionReasons={retry:["confirmed_absent","configuration_corrected"],confirm_delivered:["verified_in_provider"],close:["not_required","duplicate_notification","expired_trip","unrecoverable_legacy"]} as const;

export function DeliveryReviewWorkspace({initialSelected=null}:{initialSelected?:{kind:DeliveryKind;id:string}|null}){
  const [listing,setListing]=useState<Listing|null>(null),[listCompletedKey,setListCompletedKey]=useState("");
  const [detailResult,setDetailResult]=useState<{key:string;data:Detail|null}|null>(null);
  const [kind,setKind]=useState<DeliveryKind|"all">("all"),[state,setState]=useState("open"),[offset,setOffset]=useState(0),[historyOffset,setHistoryOffset]=useState(0);
  const [selected,setSelected]=useState<{kind:DeliveryKind;id:string}|null>(initialSelected),[revision,setRevision]=useState(0);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[pending,setPending]=useState<DeliveryReviewInput|null>(null);
  const [action,setAction]=useState<DeliveryReviewInput["action"]>("retry"),[reason,setReason]=useState<DeliveryReviewInput["reason"]>("confirmed_absent"),[absent,setAbsent]=useState(false),[receipt,setReceipt]=useState("");
  const [destinationType,setDestinationType]=useState<"group"|"private"|"">(""),[destination,setDestination]=useState(""),[root,setRoot]=useState(false);
  const listKey=JSON.stringify([kind,state,offset,revision]),detailKey=JSON.stringify([selected?.kind,selected?.id,historyOffset,revision]);
  const detail=detailResult?.key===detailKey?detailResult.data:null;
  const listLoading=listCompletedKey!==listKey,detailLoading=Boolean(selected)&&detailResult?.key!==detailKey;
  useEffect(()=>{
    const abort=new AbortController();
    void fetch(`/api/admin/delivery-reviews?kind=${kind}&state=${state}&offset=${offset}`,{cache:"no-store",signal:abort.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not load delivery reviews.");if(!abort.signal.aborted)setListing(data);}).catch(error=>{if(!abort.signal.aborted)setError(error instanceof Error?error.message:"Could not load delivery reviews.");}).finally(()=>{if(!abort.signal.aborted)setListCompletedKey(listKey);});
    return()=>abort.abort();
  },[kind,state,offset,listKey]);
  useEffect(()=>{
    if(!selected)return;
    const abort=new AbortController();
    void fetch(`/api/admin/delivery-reviews?kind=${selected.kind}&jobId=${encodeURIComponent(selected.id)}&offset=${historyOffset}`,{cache:"no-store",signal:abort.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error??"Could not load this delivery.");if(abort.signal.aborted)return;setAbsent(false);setRoot(false);setDetailResult({key:detailKey,data});setReceipt(data.job.providerMessageId??"");setDestination(data.job.destination?String(data.job.destination):"");setDestinationType(data.job.receiptDestinationType??"");}).catch(error=>{if(!abort.signal.aborted){setDetailResult({key:detailKey,data:null});setError(error instanceof Error?error.message:"Could not load this delivery.");}});
    return()=>abort.abort();
  },[selected,historyOffset,detailKey]);
  async function submit(body:DeliveryReviewInput){
    setBusy(true);setError("");setNotice("");setPending(body);
    try{
      const response=await fetch("/api/admin/delivery-reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){if(response.status<500)setPending(null);throw new Error(data.error??"Could not confirm the review result. Retry the same request.");}
      if(response.status!==200||data.ok!==true||data.requestId!==body.requestId||typeof data.replayed!=="boolean")throw new Error("The review was not acknowledged. Retry the same review request.");
      setPending(null);setAbsent(false);setRoot(false);setHistoryOffset(0);setRevision(value=>value+1);
      setNotice(body.action==="retry"?"Review recorded. The original message is queued for the delivery worker.":"Review recorded. No message was queued.");
    }catch(error){setError(error instanceof Error?error.message:"Could not confirm the result. Retry the same request.");}
    finally{setBusy(false);}
  }
  const job=detail?.job;
  const canApply=job?.canReview&&(action==="retry"?job.canRetry:action==="close"?job.canClose:job.canConfirm);
  return <main className="grid gap-6 p-4 md:p-6">
    <header><h1 className="text-2xl font-bold">Delivery reviews</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Check the provider before deciding. Reviews preserve the previous outcome and record who made the decision. A retry uses the original message and its remaining budget.</p></header>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {listing&&!listing.retryEnabled&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Owner retry is disabled. You can still record a provider receipt or close a notification after checking it was absent.</p>}
    {pending&&!busy&&<button type="button" className={`${button} justify-self-start`} onClick={()=>void submit(pending)}>Retry the same review request</button>}
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold">Delivery type<select aria-label="Delivery type" className={field} value={kind} onChange={event=>{setKind(event.target.value as DeliveryKind|"all");setOffset(0);}}><option value="all">All types</option>{deliveryKinds.map(k=><option key={k} value={k}>{k==="booking"?"Booking email / PDF":k==="telegram"?"Telegram messages":k==="assignment"?"Driver assignment": "Website chat"}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Show<select className={field} value={state} onChange={event=>{setState(event.target.value);setOffset(0);}}><option value="open">Needs attention</option><option value="all">All outcomes</option></select></label>
        <button type="button" className={button} disabled={busy} onClick={()=>{setError("");setNotice("");setRevision(value=>value+1);}}>Refresh</button>
      </div>
      {!listing?<p className="mt-4 text-sm">{listLoading?"Loading deliveries…":"Could not load deliveries. Refresh to retry."}</p>:<>
        <ul className="mt-4 divide-y divide-slate-100">{listing.items.map(item=><li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{item.reference||"Unscoped notification"} · {item.channel} · {item.status}</p><p className="mt-1 text-xs text-slate-500">{item.kind} · {item.attempts} attempts · {time(item.createdAt)} Bangkok</p></div><button type="button" className={button} disabled={busy||Boolean(pending)} aria-label={`Review ${item.kind} ${item.reference||item.id}`} onClick={()=>{setSelected({kind:item.kind,id:item.id});setHistoryOffset(0);setAbsent(false);setRoot(false);setError("");setNotice("");}}>Review</button></li>)}</ul>
        {!listing.items.length&&<p className="py-4 text-sm text-slate-500">No deliveries in this view.</p>}
        <div className="mt-3 flex gap-3"><button type="button" className={button} disabled={!offset} onClick={()=>setOffset(value=>Math.max(0,value-50))}>Previous deliveries</button><button type="button" className={button} disabled={!listing.hasMore} onClick={()=>setOffset(value=>value+50)}>Next deliveries</button></div>
      </>}
    </section>
    {selected&&!detail&&<p className="text-sm">{detailLoading?"Loading selected delivery…":"Could not load the selected delivery. Refresh to retry."}</p>}
    {job&&<section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Selected delivery">
      <h2 className="text-lg font-bold">{job.reference||"Notification"} · {job.status}</h2>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Destination</dt><dd>{job.destination||"Not configured"}</dd></div><div><dt className="font-semibold">Attempts</dt><dd>{job.attempts}</dd></div><div><dt className="font-semibold">Last attempt</dt><dd>{time(job.attemptedAt)}</dd></div><div><dt className="font-semibold">Next eligible attempt</dt><dd>{time(job.nextAttemptAt)}</dd></div></dl>
      {job.lastError&&<p className="mt-3 text-sm text-amber-900">{job.lastError}</p>}
      {job.retryBlockedReason&&<p className="mt-3 text-sm text-slate-600">{job.retryBlockedReason}</p>}
      {!job.canReview?<p className="mt-4 text-sm">This outcome is resolved or currently processing. Its history remains available below.</p>:<form className="mt-5" onSubmit={event=>{event.preventDefault();if(!canApply||pending)return;void submit({requestId:crypto.randomUUID(),kind:job.kind,jobId:job.id,expectedVersion:job.version,action,reason,confirmedAbsent:absent,providerMessageId:action==="confirm_delivered"?receipt:"",...(action==="confirm_delivered"&&job.kind==="chat"?{destinationType:destinationType as "group"|"private",destinationId:destination,useAsRoot:root}:{destinationId:"",useAsRoot:false})});}}>
        <fieldset disabled={busy||Boolean(pending)} className="grid max-w-2xl gap-3">
          <label className="grid gap-1 text-sm font-semibold">Decision<select className={field} value={action} onChange={event=>{const next=event.target.value as DeliveryReviewInput["action"];setAction(next);setReason(actionReasons[next][0]);setAbsent(false);setRoot(false);}}><option value="retry">Queue original message</option><option value="confirm_delivered">Record observed delivery receipt</option><option value="close">Close without delivery</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Reason<select className={field} value={reason} onChange={event=>setReason(event.target.value as DeliveryReviewInput["reason"])}>{actionReasons[action].map(key=><option key={key} value={key}>{reviewReasonLabels[key]}</option>)}</select></label>
          {action==="confirm_delivered"?<>
            <label className="grid gap-1 text-sm font-semibold">Observed provider message ID<input required maxLength={200} className={field} value={receipt} onChange={event=>setReceipt(event.target.value)}/></label>
            {job.kind==="chat"&&<>
              <label className="grid gap-1 text-sm font-semibold">Receipt destination type<select required className={field} value={destinationType} onChange={event=>{setDestinationType(event.target.value as "group"|"private");setRoot(false);}}><option value="">Choose after checking the receipt</option><option value="group">Group</option><option value="private">Private staff chat</option></select></label>
              <label className="grid gap-1 text-sm font-semibold">Observed Telegram chat ID<input required className={field} value={destination} onChange={event=>setDestination(event.target.value)}/></label>
              {destinationType==="group"&&!job.hasRoot&&<label className="flex gap-2 text-sm"><input required={job.needsRoot} type="checkbox" checked={root} onChange={event=>setRoot(event.target.checked)}/>Use this observed group message as the conversation’s first card.</label>}
            </>}
          </>:<label className="flex items-start gap-2 text-sm"><input required type="checkbox" checked={absent} onChange={event=>setAbsent(event.target.checked)}/>I checked the provider or storage and this delivery did not succeed.</label>}
          <button type="submit" className={`${button} justify-self-start bg-brand text-white`} disabled={!canApply}>Record decision</button>
        </fieldset>
      </form>}
      <h3 className="mt-6 font-bold">Immutable review history</h3>
      {!detail?.history.items.length&&<p className="mt-2 text-sm text-slate-500">No review decisions recorded.</p>}
      <ol className="mt-2 divide-y divide-slate-100">{detail?.history.items.map(row=><li key={row.sequence} className="py-3 text-sm"><p className="font-semibold">{row.action} · {reviewReasonLabels[row.reason]}</p><p className="mt-1 text-xs text-slate-600">{time(row.created_at)} Bangkok · staff {row.actor_id} · previously {row.previous_status} after {row.previous_attempts} attempts</p>{row.provider_message_id&&<p className="mt-1 text-xs">Observed receipt: {row.provider_message_id}</p>}</li>)}</ol>
      <div className="mt-3 flex gap-3"><button type="button" className={button} disabled={!historyOffset||busy} onClick={()=>setHistoryOffset(value=>Math.max(0,value-50))}>Newer reviews</button><button type="button" className={button} disabled={!detail?.history.hasMore||busy} onClick={()=>setHistoryOffset(value=>value+50)}>Older reviews</button></div>
    </section>}
  </main>;
}
