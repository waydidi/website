"use client";

import { useEffect, useRef } from "react";
import { loadMaps } from "@/components/account/place-autocomplete";

export type PickedPoint = { text: string; lat: number | null; lng: number | null; placeId: string | null };

/** Address box with Google suggestions (Thailand) that also returns the map position. Free typing still works. */
export function PlacePicker({ value, onChange, placeholder, className, id }: { value: string; onChange: (p: PickedPoint) => void; placeholder?: string; className: string; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    let active = true;
    void loadMaps().then((ok) => {
      if (!active || !ok || !ref.current) return;
      const auto = new window.google.maps.places.Autocomplete(ref.current, { componentRestrictions: { country: "th" }, fields: ["formatted_address", "name", "place_id", "geometry"] });
      auto.addListener("place_changed", () => {
        const p = auto.getPlace();
        const text = p.name && p.formatted_address && !p.formatted_address.startsWith(p.name) ? `${p.name}, ${p.formatted_address}` : p.formatted_address || p.name || "";
        const loc = p.geometry?.location;
        onChangeRef.current({ text, lat: loc ? loc.lat() : null, lng: loc ? loc.lng() : null, placeId: p.place_id ?? null });
      });
    });
    return () => { active = false; };
  }, []);
  return <input id={id} ref={ref} value={value} onChange={(e) => onChange({ text: e.target.value, lat: null, lng: null, placeId: null })} placeholder={placeholder} className={className} autoComplete="off" />;
}
