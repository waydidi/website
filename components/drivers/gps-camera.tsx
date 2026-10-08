"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { freshEvidenceGps, ictTime, type EvidencePolicy, type EvidenceType } from "@/lib/evidence-rules";
import { readQueuedStep, saveQueuedStep, clearQueuedStep, type QueuedDriverStep } from "@/lib/driver-step-queue";
type Gps = {latitude:number;longitude:number;accuracy:number};
type Saved = {id:string;event_type:string;received_at:string;device_captured_at:string;confirmed_at:string|null;status_event_id:string|null};
const button="min-h-12 rounded-xl border px-4 py-3 font-semibold disabled:opacity-50";
export function GpsCamera({assignmentId,reference,leg,type,policy,onSaved,onBusy}:{assignmentId:string;reference:string;leg:string;type:EvidenceType;policy:EvidencePolicy;onSaved:(id:string|null)=>void;onBusy:(busy:boolean)=>void}) {
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),input=useRef<HTMLInputElement>(null),generation=useRef(0),lock=useRef(false);
 const [camera,setCamera]=useState(false),[file,setFile]=useState<Blob|null>(null),[gps,setGps]=useState<Gps|null>(null),[captured,setCaptured]=useState(""),[id,setId]=useState(""),[saved,setSaved]=useState<Saved|null>(null),[preparing,setPreparing]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(""),[locationState,setLocationState]=useState("");
 useEffect(()=>{onBusy(preparing||busy||camera||Boolean(file&&!saved));return()=>onBusy(false);},[preparing,busy,camera,file,saved,onBusy]);
 const storageKey=`evidence:${assignmentId}:${type}`;
 const stop=useCallback(()=>{generation.current++;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false);},[]);
 useEffect(()=>()=>{generation.current++;stream.current?.getTracks().forEach(t=>t.stop());},[]);
 useEffect(()=>{ const hide=()=>{if(document.hidden)stop();};document.addEventListener("visibilitychange",hide);return()=>document.removeEventListener("visibilitychange",hide);},[stop]);
 useEffect(()=>{if(camera&&video.current)video.current.srcObject=stream.current;},[camera]);
 const url=useMemo(()=>file?URL.createObjectURL(file):"",[file]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 useEffect(()=>{let active=true; void (async()=>{
  const draft=await readQueuedStep(storageKey); if(!active)return;
  if(draft&&Date.now()-Date.parse(draft.occurredAt)<6*3600000){setFile(draft.photo);setId(draft.id);setCaptured(draft.occurredAt);setGps(draft.latitude!==null?{latitude:draft.latitude,longitude:draft.longitude!,accuracy:draft.accuracy!}:null);} else if(draft){await clearQueuedStep(storageKey);}
  const response=await fetch("/api/driver/trips/session/evidence",{cache:"no-store"});if(!response.ok)return;
  const result=await response.json();if(!active)return;
  const existing=(result.evidence as Saved[]).find(e=>e.event_type===type&&!e.status_event_id&&(!draft||e.id===draft.id));
  if(existing){setSaved(existing);onSaved(existing.id);}
 })().catch(()=>{});return()=>{active=false;};},[storageKey,type,onSaved]);
 async function locate():Promise<Gps|null>{
  setGps(null);setLocationState("Getting fresh location…");const version=++generation.current;
  const result=await new Promise<Gps|null>(resolve=>{
   if(!navigator.geolocation){resolve(null);return;}
   navigator.geolocation.getCurrentPosition(p=>resolve(!freshEvidenceGps(p.timestamp)?null:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),()=>resolve(null),{enableHighAccuracy:true,maximumAge:0,timeout:policy.gps_timeout_ms});
  });
  if(version!==generation.current)return null;
  setGps(result);setLocationState(result?(result.accuracy>policy.max_accuracy_m?"GPS accuracy is poor. Retry in an open area.":"Fresh device-reported GPS") : "Location unavailable. Retry or save without GPS; a mandatory GPS policy needs an operations exception.");return result;
 }
 async function open(){
  if(lock.current)return;setError("");
  if(!navigator.mediaDevices?.getUserMedia){input.current?.click();return;}
  lock.current=true;setPreparing(true);const version=++generation.current;
  try {
   const nextStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
   if(version!==generation.current){nextStream.getTracks().forEach(t=>t.stop());return;}
   stream.current?.getTracks().forEach(t=>t.stop());stream.current=nextStream;setCamera(true);
  } catch {setError("Camera unavailable. Use the phone camera button below.");}
  finally {lock.current=false;setPreparing(false);}
 }
 async function normalize(source:HTMLVideoElement|HTMLImageElement,width:number,height:number){
  if(!width||!height)throw new Error("Camera is not ready. Try again.");
  const ratio=Math.min(1,1280/Math.max(width,height)),canvas=document.createElement("canvas");canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  canvas.getContext("2d")!.drawImage(source,0,0,canvas.width,canvas.height);
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not prepare photo.")),"image/jpeg",0.82));
 }
 async function accept(blob:Blob){
  stop();const time=new Date().toISOString(),eventId=crypto.randomUUID();setFile(blob);setCaptured(time);setId(eventId);setSaved(null);onSaved(null);
  const draft:QueuedDriverStep={id:eventId,assignmentId:storageKey,status:type,note:"",occurredAt:time,latitude:null,longitude:null,accuracy:null,photo:blob,photoName:"capture.jpg"};
  try{await saveQueuedStep(draft);}catch{setError("This browser cannot keep the photo after refresh. Save it before leaving.");}
  const version=generation.current+1;
  const point=await locate();
  if(generation.current!==version)return;
  try{await saveQueuedStep({...draft,latitude:point?.latitude??null,longitude:point?.longitude??null,accuracy:point?.accuracy??null});}catch{setError("This browser cannot keep the photo after refresh. Save it before leaving.");}
 }
 async function take(){if(!video.current||lock.current)return;lock.current=true;setPreparing(true);try{await accept(await normalize(video.current,video.current.videoWidth,video.current.videoHeight));}catch(e){setError((e as Error).message);}finally{lock.current=false;setPreparing(false);}}
 async function fallback(value:File|undefined){
  if(!value||lock.current)return;if(value.size>25*1024*1024){setError("Choose a photo smaller than 25 MB.");return;}
  lock.current=true;setPreparing(true);const objectUrl=URL.createObjectURL(value);try{const img=new Image();img.src=objectUrl;await img.decode();await accept(await normalize(img,img.naturalWidth,img.naturalHeight));}catch{setError("This format could not be opened. Retake as a compatible photo.");}finally{URL.revokeObjectURL(objectUrl);lock.current=false;setPreparing(false);}
 }
 async function retryLocation(){
  if(file&&id) await saveQueuedStep({id,assignmentId:storageKey,status:type,note:"",occurredAt:captured,latitude:null,longitude:null,accuracy:null,photo:file,photoName:"capture.jpg"}).catch(()=>{});
  const point=await locate();
  if(file&&id) await saveQueuedStep({id,assignmentId:storageKey,status:type,note:"",occurredAt:captured,latitude:point?.latitude??null,longitude:point?.longitude??null,accuracy:point?.accuracy??null,photo:file,photoName:"capture.jpg"}).catch(()=>setError("Could not store this GPS update for refresh recovery."));
 }
 async function upload(){
  if(!file||!id||lock.current)return;lock.current=true;setBusy(true);onBusy(true);setError("");setProgress(0);
  try{
   const form=new FormData();form.set("id",id);form.set("eventType",type);form.set("deviceCapturedAt",captured);form.set("photo",file,"capture.jpg");if(gps){form.set("latitude",String(gps.latitude));form.set("longitude",String(gps.longitude));form.set("accuracy",String(gps.accuracy));}
   const result=await new Promise<{evidence:Saved}>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/driver/trips/session/evidence");xhr.timeout=90000;xhr.upload.onprogress=e=>{if(e.lengthComputable)setProgress(Math.round(e.loaded/e.total*100));};xhr.onerror=()=>reject(new Error("Connection lost. Retry this photo."));xhr.ontimeout=()=>reject(new Error("Upload timed out. Retry this photo."));xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(data.error??"Upload failed."));}catch(e){reject(e);}};xhr.send(form);});
   setSaved(result.evidence);onSaved(result.evidence.id);await clearQueuedStep(storageKey);
  }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <section className="mt-4 space-y-3 rounded-2xl border border-orange-200 p-4" aria-label="GPS timestamp camera">
  <h3 className="font-bold">{type==="pickup"?"Pickup":"Drop-off"} GPS Camera</h3>
  <p className="text-sm text-slate-600">Photograph the trip location, avoiding guests, IDs and private documents. After capture, we ask for location to record this photo’s GPS accuracy.</p>
  {camera?<><video ref={video} autoPlay playsInline muted className="max-h-96 w-full rounded-xl object-contain"/><button type="button" onClick={()=>void take()} disabled={preparing} className={button}>Capture photo</button><button type="button" onClick={stop} className={button}>Close camera</button></>:<button type="button" onClick={()=>void open()} disabled={busy||preparing} className={button+" bg-[#FE8B05] text-slate-950"}>{file||saved?"Retake":"Take Photo"}</button>}
  <button type="button" disabled={busy||preparing} onClick={()=>input.current?.click()} className={button}>Use phone camera</button>
  <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take photo with phone camera" onChange={e=>{void fallback(e.target.files?.[0]);e.target.value="";}}/>
  {(file||saved)&&<div className="overflow-hidden rounded-xl bg-slate-900 text-white">
   <img src={saved?`/api/driver/trips/session/evidence/${saved.id}`:url} alt={`${type} evidence preview`} className="max-h-[600px] w-full object-contain"/>
   {!saved&&<div className="space-y-1 border-t-4 border-[#FE8B05] p-4 text-sm"><WaydidiLogo className="h-8 w-auto"/><strong>{type.toUpperCase()} PHOTO · {reference} / {leg}</strong><p>Device capture (unverified): {captured?ictTime(captured):""}</p><p>Server time will be recorded when uploaded.</p><p>{gps?`${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} · ±${Math.round(gps.accuracy)} m`:"Location unavailable"}</p><p>Address unavailable</p>{gps&&<a href={`https://www.google.com/maps/search/?api=1&query=${gps.latitude},${gps.longitude}`} target="_blank" rel="noreferrer" className="underline">Open map</a>}</div>}
  </div>}
  {!saved&&file&&<><p role="status" className="text-sm">{locationState}</p><button type="button" disabled={busy||preparing} className={button} onClick={()=>void retryLocation()}>Retry Location</button><button type="button" disabled={busy||preparing||locationState==="Getting fresh location…"} className={button+" bg-[#FE8B05] text-slate-950"} onClick={()=>void upload()}>{busy?progress<100?`Uploading ${progress}%` : "Processing photo…":"Save photo"}</button></>}
  {!saved&&file&&<button type="button" disabled={busy||preparing} className={button} onClick={()=>{generation.current++;setFile(null);setGps(null);setSaved(null);onSaved(null);void clearQueuedStep(storageKey);}}>Discard photo</button>}
  {saved&&<p role="status" className="text-sm text-emerald-800">Photo saved privately. Confirm the trip step below when ready. Saving a photo does not change trip status.</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
