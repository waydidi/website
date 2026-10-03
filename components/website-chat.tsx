"use client";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useEffect, useState, useCallback, useSyncExternalStore, type FormEvent } from "react";
import { usePathname } from "next/navigation";
type Message={sender:string;body:string;created_at:string};
export function OpenWebsiteChat({className,children}:{className?:string;children:React.ReactNode}) {
 return <button type="button" className={className} onClick={()=>window.dispatchEvent(new Event("waydidi:open-chat"))}>{children}</button>;
}
// The booking flow lives on home and destination pages, so route checks alone
// cannot tell when the customer has entered vehicle selection or checkout.
function subscribeToBookingStage(onChange: () => void) {
 const observer = new MutationObserver(onChange);
 observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-booking-stage"] });
 return () => observer.disconnect();
}
function bookingInProgress() {
 const stage = document.documentElement.dataset.bookingStage;
 return Boolean(stage && stage !== "search");
}
export function WebsiteChat() {
 const path = usePathname();
 const activeBooking = useSyncExternalStore(subscribeToBookingStage, bookingInProgress, () => false);
 const bookingPage = /^\/(pay|booking\/confirmation)(\/|$)/.test(path ?? "");
 if (activeBooking || bookingPage) return null;
 return <WebsiteChatPanel />;
}
function WebsiteChatPanel() {
 const [open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([]),[text,setText]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener("waydidi:open-chat",show);return()=>window.removeEventListener("waydidi:open-chat",show);},[]);
 const load=useCallback(async()=>{const response=await fetch("/api/chat",{cache:"no-store"});if(response.ok)setMessages((await response.json()).messages);},[]);
 useEffect(()=>{if(!open)return;const first=setTimeout(()=>void load().catch(()=>setError("Chat unavailable. Please use our contact page.")),0);const timer=setInterval(()=>void load().catch(()=>undefined),10000);return()=>{clearTimeout(first);clearInterval(timer);};},[open,load]);
 async function send(e:FormEvent){e.preventDefault();if(busy||!text.trim())return;setBusy(true);setError("");try{const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text})});const data=await r.json();if(!r.ok)throw new Error(data.error);setText("");await load();}catch(cause){setError(cause instanceof Error?cause.message:"Message could not be sent.");}finally{setBusy(false);}}
 return <div className="fixed bottom-24 right-4 z-[85] sm:bottom-6">{open?<section aria-label="Chat with Waydidi" className="w-[min(360px,calc(100vw-32px))] rounded-2xl border bg-white p-4 text-ink shadow-xl"><div className="flex justify-between"><h2 className="font-bold">Ask Waydidi</h2><button aria-label="Close chat" onClick={()=>setOpen(false)}>✕</button></div><p className="mt-2 text-sm text-slate-600">Send a message to our team. Replies appear here when a staff member is available. For urgent help, <Link href="/contact" className="underline">contact us</Link>.</p><p className="mt-2 text-xs text-slate-500">Please keep passwords, payment details, and sensitive documents out of chat.</p><div className="my-3 max-h-64 space-y-3 overflow-y-auto" aria-live="polite">{messages.map((m,i)=><div key={`${m.created_at}:${i}`} className={`rounded-lg p-3 ${m.sender==="staff"?"bg-orange-50":"bg-slate-100"}`}><strong className="text-xs">{m.sender==="staff"?"Waydidi team":"You"}</strong><p className="whitespace-pre-wrap break-words text-sm">{m.body}</p></div>)}</div><form onSubmit={send}><label className="sr-only" htmlFor="website-chat-message">Your message</label><textarea id="website-chat-message" rows={2} maxLength={2000} value={text} onChange={e=>setText(e.target.value)} className="w-full resize-none rounded-lg border p-2" placeholder="How can we help?" required/><p role="alert" className="text-sm text-red-700">{error}</p><button disabled={busy||!text.trim()} className="mt-2 w-full rounded-full bg-orange-500 p-3 font-bold text-white disabled:opacity-50">{busy?"Sending…":"Send message"}</button></form></section>:<button onClick={()=>setOpen(true)} aria-label="Ask Waydidi" title="Ask Waydidi" className="grid size-14 place-items-center rounded-full bg-[#FF8A05] text-white shadow-lg hover:bg-[#E67900] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8A05]"><MessageCircle size={26} aria-hidden="true"/></button>}</div>;
}
