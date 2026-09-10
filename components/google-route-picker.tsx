"use client";

import { MapPin, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
  }
}

export type RouteInfo = {
  distance: string;
  duration: string;
  distanceMeters: number;
  durationSeconds: number;
  pickupPlaceId: string;
  dropoffPlaceId: string;
};

export function GoogleRoutePicker({
  pickup,
  dropoff,
  onPickupChange,
  onDropoffChange,
  onRouteChange,
  pickupOnly = false,
  onPickupPlaceChange,
}: {
  pickup: string;
  dropoff: string;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onRouteChange: (value: RouteInfo | null) => void;
  pickupOnly?: boolean;
  onPickupPlaceChange?: (placeId: string) => void;
}) {
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const pickupPlaceIdRef = useRef("");
  const dropoffPlaceIdRef = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/maps/config", { cache: "no-store" });
      const { apiKey } = (await response.json()) as { apiKey?: string };
      if (!apiKey || cancelled) return;
      if (window.google?.maps) {
        setMapReady(true);
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(
        "script[data-waydidi-google-maps]",
      );
      if (existing) {
        existing.addEventListener(
          "load",
          () => !cancelled && setMapReady(true),
          { once: true },
        );
        return;
      }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
      script.async = true;
      script.dataset.waydidiGoogleMaps = "true";
      script.addEventListener("load", () => !cancelled && setMapReady(true), {
        once: true,
      });
      document.head.appendChild(script);
    }
    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !mapReady ||
      !window.google?.maps ||
      !pickupRef.current ||
      (!pickupOnly && !mapRef.current) ||
      (!pickupOnly && !dropoffRef.current)
    )
      return;
    const maps = window.google.maps;
    const map = mapRef.current ? new maps.Map(mapRef.current, {
      center: { lat: 13.7563, lng: 100.5018 },
      zoom: 10,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    }) : null;
    const renderer = map ? new maps.DirectionsRenderer({
      map,
      polylineOptions: { strokeColor: "#FF8A05", strokeWeight: 5 },
    }) : null;
    const service = new maps.DirectionsService();
    const options = {
      componentRestrictions: { country: "th" },
      fields: ["formatted_address", "geometry", "name"],
    };
    const pickupAutocomplete = new maps.places.Autocomplete(
      pickupRef.current,
      options,
    );
    const dropoffAutocomplete = dropoffRef.current
      ? new maps.places.Autocomplete(dropoffRef.current, options)
      : null;
    const calculate = () => {
      if (!pickupRef.current?.value || !dropoffRef.current?.value) return;
      service.route(
        {
          origin: pickupRef.current.value,
          destination: dropoffRef.current.value,
          travelMode: maps.TravelMode.DRIVING,
        },
        (result: any, status: string) => {
          if (status !== "OK" || !result) {
            setRouteInfo(null);
            onRouteChange(null);
            return;
          }
          renderer?.setDirections(result);
          const leg = result.routes?.[0]?.legs?.[0];
          const info =
            leg?.distance?.text && leg?.duration?.text
              ? {
                  distance: leg.distance.text,
                  duration: leg.duration.text,
                  distanceMeters: Number(leg.distance.value),
                  durationSeconds: Number(leg.duration.value),
                  pickupPlaceId: pickupPlaceIdRef.current,
                  dropoffPlaceId: dropoffPlaceIdRef.current,
                }
              : null;
          setRouteInfo(info);
          onRouteChange(info);
        },
      );
    };
    const selectPickup = () => {
      const place = pickupAutocomplete.getPlace();
      pickupPlaceIdRef.current = place.place_id ?? "";
      onPickupPlaceChange?.(pickupPlaceIdRef.current);
      onPickupChange(
        place.formatted_address || place.name || pickupRef.current?.value || "",
      );
      if (!pickupOnly) window.setTimeout(calculate, 0);
    };
    const selectDropoff = () => {
      const place = dropoffAutocomplete.getPlace();
      dropoffPlaceIdRef.current = place.place_id ?? "";
      onDropoffChange(
        place.formatted_address ||
          place.name ||
          dropoffRef.current?.value ||
          "",
      );
      window.setTimeout(calculate, 0);
    };
    pickupAutocomplete.addListener("place_changed", selectPickup);
    dropoffAutocomplete?.addListener("place_changed", selectDropoff);
    calculate();
    return () => {
      maps.event.clearInstanceListeners(pickupAutocomplete);
      if (dropoffAutocomplete) maps.event.clearInstanceListeners(dropoffAutocomplete);
    };
  }, [mapReady, pickupOnly]);

  const fieldClass =
    "w-full bg-transparent text-[16px] text-slate-950 outline-none placeholder:text-slate-400";
  return (
    <>
      <label className="flex min-h-[64px] items-center gap-3 border-b border-slate-100 px-4 py-3 lg:border-b-0">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]">
          <MapPin size={18} />
        </span>
        <span className="w-full">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            From
          </span>
          <input
            ref={pickupRef}
            required
            value={pickup}
            onChange={(event) => onPickupChange(event.target.value)}
            className={fieldClass}
            placeholder="City, hotel or airport"
            aria-label="Pickup location"
            autoComplete="off"
          />
        </span>
      </label>
      {!pickupOnly && <label className="flex min-h-[64px] items-center gap-3 border-b border-slate-100 px-4 py-3 lg:border-b-0">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]">
          <MapPin size={18} />
        </span>
        <span className="w-full">
          <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            To
          </span>
          <input
            ref={dropoffRef}
            required
            value={dropoff}
            onChange={(event) => onDropoffChange(event.target.value)}
            className={fieldClass}
            placeholder="City, hotel or airport"
            aria-label="Drop-off location"
            autoComplete="off"
          />
        </span>
      </label>}
      {mapReady && !pickupOnly && (
        <div className="col-span-full border-t border-slate-200 bg-white p-3">
          <div
            ref={mapRef}
            className="h-[260px] w-full overflow-hidden rounded-xl bg-slate-100"
            aria-label="Google map showing the pickup and drop-off route"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4 px-1 text-sm font-semibold text-slate-700">
            <span className="flex items-center gap-2">
              <Route size={17} className="text-[#D96F00]" />
              Location details
            </span>
            {routeInfo && (
              <>
                <span>{routeInfo.distance}</span>
                <span className="text-slate-400">
                  Approx. {routeInfo.duration}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
