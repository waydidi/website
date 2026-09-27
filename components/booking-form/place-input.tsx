"use client";

import { useEffect, useRef } from "react";
import { loadMaps } from "@/components/account/place-autocomplete";

// Text box with Google place suggestions (Thailand). Typing freely still works if Maps is unavailable.
export function PlaceInput({ value, onChange, placeholder, className, inputRef, disabled }: { value: string; onChange: (v: string) => void; placeholder: string; className: string; inputRef?: React.RefObject<HTMLInputElement | null>; disabled?: boolean }) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    void loadMaps().then((ok) => {
      if (!active || !ok || !ref.current) return;
      const autocomplete = new window.google.maps.places.Autocomplete(ref.current, {
        componentRestrictions: { country: "th" },
        fields: ["formatted_address", "name"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const address = place.name && place.formatted_address && !place.formatted_address.startsWith(place.name)
          ? `${place.name}, ${place.formatted_address}` : place.formatted_address || place.name || "";
        if (address) onChangeRef.current(address);
      });
    });
    return () => { active = false; };
  }, [ref, disabled]);

  return <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={className} autoComplete="off" disabled={disabled} />;
}
