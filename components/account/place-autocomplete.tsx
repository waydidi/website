"use client";

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

// Loads the Maps JavaScript API once, sharing the script tag used by the
// homepage route picker. Resolves false when no API key is configured.
function loadMaps(): Promise<boolean> {
  return fetch("/api/maps/config", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ apiKey?: string }>)
    .then(({ apiKey }) => new Promise<boolean>((resolve) => {
      if (!apiKey) return resolve(false);
      if (window.google?.maps?.places) return resolve(true);
      const existing = document.querySelector<HTMLScriptElement>("script[data-waydidi-google-maps]");
      if (existing) return existing.addEventListener("load", () => resolve(true), { once: true });
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
      script.async = true;
      script.dataset.waydidiGoogleMaps = "true";
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => resolve(false), { once: true });
      document.head.appendChild(script);
    }))
    .catch(() => false);
}

/** Address search limited to Thailand; reports the chosen Google place. */
export function PlaceAutocomplete({ id, onPick }: { id: string; onPick: (place: PickedPlace | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);

  useEffect(() => {
    let active = true;
    loadMaps().then((ok) => {
      if (!active) return;
      if (!ok || !input.current) return setStatus("unavailable");
      const autocomplete = new window.google.maps.places.Autocomplete(input.current, {
        componentRestrictions: { country: "th" },
        fields: ["place_id", "formatted_address", "name"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const address = place.name && place.formatted_address && !place.formatted_address.startsWith(place.name)
          ? `${place.name}, ${place.formatted_address}` : place.formatted_address || place.name || "";
        onPickRef.current(place.place_id && address ? { placeId: place.place_id, address } : null);
      });
      setStatus("ready");
    });
    return () => { active = false; };
  }, []);

  return <div>
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 focus-within:border-[#FF8A05] focus-within:ring-4 focus-within:ring-orange-100">
      <MapPin size={18} className="shrink-0 text-[#D96F00]" />
      <input id={id} ref={input} onChange={() => onPickRef.current(null)} disabled={status === "unavailable"} placeholder="Search hotel, address or airport" className="w-full bg-transparent py-3 outline-none disabled:cursor-not-allowed" autoComplete="off" />
    </div>
    {status === "unavailable" ? <p className="mt-2 text-sm text-red-600">Address search is not available right now. Please try again later.</p> : null}
  </div>;
}
