"use client";

import { useEffect, useRef } from "react";
import { attachPlaceAutocomplete, loadMaps, resolveGooglePlaceId } from "@/lib/google-places";

// Text box with Google place suggestions (Thailand). Typing freely still works if Maps is unavailable.
// onPlace reports the Google place ID when a suggestion is picked (null while typing freely).
export function PlaceInput({ value, onChange, placeholder, className, inputRef, disabled, onPlace }: { value: string; onChange: (v: string) => void; placeholder: string; className: string; inputRef?: React.RefObject<HTMLInputElement | null>; disabled?: boolean; onPlace?: (placeId: string | null) => void }) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const onChangeRef = useRef(onChange);
  const onPlaceRef = useRef(onPlace);
  useEffect(() => { onChangeRef.current = onChange; onPlaceRef.current = onPlace; }, [onChange, onPlace]);

  useEffect(() => {
    if (disabled) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void loadMaps().then((ok) => {
      if (!active || !ok || !ref.current) return;
      cleanup = attachPlaceAutocomplete(ref.current, (place) => {
        onChangeRef.current(place.address); onPlaceRef.current?.(place.placeId);
      }).dispose;
    });
    return () => { active = false; cleanup?.(); };
  }, [ref, disabled]);

  return <input ref={ref} value={value} onChange={(e) => { onChange(e.target.value); onPlace?.(null); }} placeholder={placeholder} className={className} autoComplete="off" disabled={disabled} />;
}

/** Best Google match for typed text (Thailand), when no suggestion was picked. */
export const resolvePlaceId = resolveGooglePlaceId;
