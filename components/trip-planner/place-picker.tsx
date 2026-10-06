"use client";

import { useEffect, useRef } from "react";
import { attachPlaceAutocomplete, loadMaps } from "@/lib/google-places";

export type PickedPoint = { text: string; lat: number | null; lng: number | null; placeId: string | null };

/** Address box with Google suggestions (Thailand) that also returns the map position. Free typing still works. */
export function PlacePicker({ value, onChange, placeholder, className, id }: { value: string; onChange: (p: PickedPoint) => void; placeholder?: string; className: string; id?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    void loadMaps().then((ok) => {
      if (!active || !ok || !ref.current) return;
      cleanup = attachPlaceAutocomplete(ref.current, (place) => {
        onChangeRef.current({ text: place.address, lat: place.location?.lat ?? null, lng: place.location?.lng ?? null, placeId: place.placeId });
      }).dispose;
    });
    return () => { active = false; cleanup?.(); };
  }, []);
  return <input id={id} ref={ref} value={value} onChange={(e) => onChange({ text: e.target.value, lat: null, lng: null, placeId: null })} placeholder={placeholder} className={className} autoComplete="off" />;
}
