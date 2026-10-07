"use client";
import { CancellationTerms } from "@/components/home/checkout-summary";
import { VEHICLES, type VehicleId } from "@/lib/vehicles";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare global { interface Window { Stripe?: (key: string) => { initEmbeddedCheckout: (o: { fetchClientSecret: () => Promise<string> }) => Promise<{ mount: (el: HTMLElement) => void; destroy: () => void }> } } }

function loadStripe() {
  return new Promise<void>((resolve, reject) => {
    if (window.Stripe) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Stripe failed to load"));
    document.head.appendChild(s);
  });
}

// Stripe Embedded Checkout on Waydidi's page; Stripe returns to the confirmation page when paid.
export function PayForm({ reference, token, sessionId }: { reference: string; token: string; sessionId: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [journey,setJourney]=useState<{pickup:string;dropoff:string;date:string;time:string;vehicle:string;passengers:number;luggage:number;returnDate:string|null;returnTime:string|null}|null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let checkout: { destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/pay/${encodeURIComponent(reference)}?token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const out = await res.json() as { clientSecret?: string; publishableKey?: string; done?: boolean; error?: string; journey?: typeof journey };
        if (out.done) { window.location.replace(`/booking/confirmation/${reference}?token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`); return; }
        if (!res.ok || !out.clientSecret || !out.publishableKey) throw new Error(out.error ?? "Payment could not be loaded.");
        setJourney(out.journey??null);
        await loadStripe();
        if (cancelled || !window.Stripe || !box.current) return;
        const c = await window.Stripe(out.publishableKey).initEmbeddedCheckout({ fetchClientSecret: async () => out.clientSecret! });
        if (cancelled) { c.destroy(); return; }
        c.mount(box.current); checkout = c; setLoading(false);
      } catch (e) { setError(e instanceof Error ? e.message : "Payment could not be loaded."); setLoading(false); }
    })();
    return () => { cancelled = true; checkout?.destroy(); };
  }, [reference, token, sessionId]);
  return <><aside className="mt-5 rounded-2xl border bg-white p-5" aria-label="Your journey and cancellation terms">{journey?<><p className="font-bold">{journey.pickup} → {journey.dropoff}</p><p className="mt-2">{journey.date} · {journey.time} (Thailand time)</p><p>{VEHICLES[journey.vehicle as VehicleId]?.name??journey.vehicle} · {journey.passengers} passengers · {journey.luggage} checked bags</p>{journey.returnDate&&<p>Return: {journey.returnDate} · {journey.returnTime}</p>}<div className="mt-3 border-t pt-3"><CancellationTerms date={journey.date} time={journey.time}/></div></>:<p role="status">Loading your journey…</p>}</aside><div className="mt-5 overflow-hidden rounded-3xl bg-white p-2 shadow-sm">
    {loading && <p className="flex items-center justify-center gap-2 py-16 text-[15px] text-grey-text"><LoaderCircle size={18} className="animate-spin" />Loading secure payment…</p>}
    {error && <p role="alert" className="p-6 text-center text-[15px] font-semibold text-red-700">{error}</p>}
    <div ref={box} />
  </div></>;
}
