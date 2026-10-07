"use client";

import { attachPlaceAutocomplete, loadMaps } from "@/lib/google-places";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PickedPlace = { placeId: string; address: string };

declare global {
  interface Window {
    // Loaded at runtime by the Google Maps script.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

export { loadMaps } from "@/lib/google-places";

/** Address search limited to Thailand; reports the chosen Google place. */
export function PlaceAutocomplete({ id, onPick }: { id: string; onPick: (place: PickedPlace | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    loadMaps().then((ok) => {
      if (!active) return;
      if (!ok || !input.current) return setStatus("unavailable");
      const autocomplete = attachPlaceAutocomplete(input.current, (place) => onPickRef.current(place));
      cleanup = autocomplete.dispose;
      setStatus("ready");
    });
    return () => { active = false; cleanup?.(); };
  }, []);

  return <div>
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-orange-100">
      <MapPin size={18} className="shrink-0 text-brand-text" />
      <input id={id} ref={input} onChange={() => onPickRef.current(null)} disabled={status === "unavailable"} placeholder="Search hotel, address or airport" className="w-full bg-transparent py-3 outline-none disabled:cursor-not-allowed" autoComplete="off" />
    </div>
    {status === "unavailable" ? <p className="mt-2 text-sm text-red-600">Address search is not available right now. Please try again later.</p> : null}
  </div>;
}
