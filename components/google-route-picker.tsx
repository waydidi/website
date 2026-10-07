"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { attachPlaceAutocomplete, loadMaps, type SelectedPlace } from "@/lib/google-places";
import { MapPin, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";

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
  prefill,
  connectedMobile = false,
  showPreviewMap = false,
  optionalDropoff = false,
  onDropoffPlaceChange,
  bounds,
}: {
  pickup: string;
  dropoff: string;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onRouteChange: (value: RouteInfo | null) => void;
  pickupOnly?: boolean;
  onPickupPlaceChange?: (placeId: string, location?: { lat: number; lng: number } | null) => void;
  /** Known Google place IDs for the current pickup/drop-off text (saved
   *  places, "book again"). Change `nonce` to apply a new prefill. */
  prefill?: { pickupPlaceId?: string; dropoffPlaceId?: string; nonce: number } | null;
  connectedMobile?: boolean;
  showPreviewMap?: boolean;
  /** Hourly: also show an optional drop-off (no route is calculated). */
  optionalDropoff?: boolean;
  onDropoffPlaceChange?: (placeId: string, location?: { lat: number; lng: number } | null) => void;
  /** Favour suggestions inside this box (the chosen hourly area). */
  bounds?: { south: number; west: number; north: number; east: number } | null;
}) {
  const { t } = useI18n();
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const pickupPlaceIdRef = useRef("");
  const dropoffPlaceIdRef = useRef("");
  const calculateRef = useRef<(() => void) | null>(null);
  const autocompletesRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMaps().then((ok) => { if (!cancelled) setMapReady(ok); });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !mapReady ||
      !window.google?.maps ||
      !pickupRef.current ||
      (!pickupOnly && showPreviewMap && !mapRef.current) ||
      (!pickupOnly && !dropoffRef.current)
    )
      return;
    const maps = window.google.maps;
    const map = showPreviewMap && mapRef.current ? new maps.Map(mapRef.current, {
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
    calculateRef.current = calculate;
    const selectPickup = (place: SelectedPlace) => {
      pickupPlaceIdRef.current = place.placeId ?? "";
      onPickupPlaceChange?.(pickupPlaceIdRef.current, place.location);
      onPickupChange(
        place.address || pickupRef.current?.value || "",
      );
      if (!pickupOnly) window.setTimeout(calculate, 0);
    };
    const selectDropoff = (place: SelectedPlace) => {
      dropoffPlaceIdRef.current = place.placeId ?? "";
      onDropoffChange(
        place.address ||
          dropoffRef.current?.value ||
          "",
      );
      onDropoffPlaceChange?.(dropoffPlaceIdRef.current, place.location);
      if (!pickupOnly) window.setTimeout(calculate, 0);
    };
    const pickupAutocomplete = attachPlaceAutocomplete(pickupRef.current, selectPickup);
    const dropoffAutocomplete = dropoffRef.current ? attachPlaceAutocomplete(dropoffRef.current, selectDropoff) : null;
    autocompletesRef.current = [pickupAutocomplete, dropoffAutocomplete].filter(Boolean);
    calculate();
    return () => {
      pickupAutocomplete.dispose();
      dropoffAutocomplete?.dispose();
      renderer?.setMap(null);
      calculateRef.current = null;
      autocompletesRef.current = [];
    };
  }, [mapReady, pickupOnly, showPreviewMap, optionalDropoff]);

  // Hourly: suggestions favour the chosen area (anywhere is still allowed).
  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    for (const a of autocompletesRef.current) a.setBounds(bounds ?? undefined);
  }, [mapReady, bounds, optionalDropoff, pickupOnly]);

  // Apply prefilled place IDs once Maps is ready and the new text has rendered.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.pickupPlaceId !== undefined) {
      pickupPlaceIdRef.current = prefill.pickupPlaceId;
      onPickupPlaceChange?.(prefill.pickupPlaceId);
    }
    if (prefill.dropoffPlaceId !== undefined) dropoffPlaceIdRef.current = prefill.dropoffPlaceId;
    if (!mapReady || pickupOnly) return;
    const timer = window.setTimeout(() => calculateRef.current?.(), 0);
    return () => window.clearTimeout(timer);
    // Runs per prefill (nonce) and once Maps finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce, mapReady]);

  const fieldClass =
    "w-full bg-transparent text-base font-normal text-slate-950 outline-none placeholder:font-normal placeholder:text-slate-400";
  return (
    <>
      <label className={`block min-w-0 ${connectedMobile ? "order-2 md:order-1" : ""}`}>
        <span className={`flex min-h-14 items-center gap-3 px-4 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40 lg:min-h-[88px] lg:gap-3 lg:px-5 ${connectedMobile ? "rounded-[14px] border border-slate-200 shadow-none md:min-h-[80px] md:gap-4 md:px-5 lg:min-h-[64px] lg:gap-3 lg:rounded-none lg:border-0 lg:focus-within:ring-0" : "rounded-xl border border-slate-200 shadow-sm"}`}>
        <MapPin size={20} className="shrink-0 text-slate-950" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block text-[13px]/[20px] font-normal text-slate-500 ${connectedMobile ? "md:text-[17px]/[24px] lg:text-[13px]/[20px]" : ""}`}>{t("route.from")}</span>
          <input
            ref={pickupRef}
            required
            value={pickup}
            onChange={(event) => { pickupPlaceIdRef.current = ""; onPickupPlaceChange?.("", null); setRouteInfo(null); onRouteChange(null); onPickupChange(event.target.value); }}
            className={`${fieldClass} ${connectedMobile ? "md:mt-1 md:text-[19px] md:font-semibold lg:mt-0 lg:text-[15px]" : ""}`}
            placeholder={t("route.pickupPlaceholder")}
            aria-label={t("route.pickupLabel")}
            autoComplete="off"
          />
        </span></span>
      </label>
      {(!pickupOnly || optionalDropoff) && <label className={`block min-w-0 ${connectedMobile ? "order-3 md:order-2 lg:border-l lg:border-slate-200" : "mt-3 lg:mt-0"}`}>
        <span className={`flex min-h-14 items-center gap-3 px-4 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40 lg:min-h-[88px] lg:gap-3 lg:px-5 ${connectedMobile ? "rounded-[14px] border border-slate-200 shadow-none md:min-h-[80px] md:gap-4 md:px-5 lg:min-h-[64px] lg:gap-3 lg:rounded-none lg:border-0 lg:focus-within:ring-0" : "rounded-xl border border-slate-200 shadow-sm"}`}>
        <MapPin size={20} className="shrink-0 text-slate-950" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block text-[13px]/[20px] font-normal text-slate-500 ${connectedMobile ? "md:text-[17px]/[24px] lg:text-[13px]/[20px]" : ""}`}>{optionalDropoff ? "Drop-off (optional)" : t("route.to")}</span>
          <input
            ref={dropoffRef}
            required={!optionalDropoff}
            value={dropoff}
            onChange={(event) => { dropoffPlaceIdRef.current = ""; onDropoffPlaceChange?.("", null); setRouteInfo(null); onRouteChange(null); onDropoffChange(event.target.value); }}
            className={`${fieldClass} ${connectedMobile ? "md:mt-1 md:text-[19px] md:font-semibold lg:mt-0 lg:text-[15px]" : ""}`}
            placeholder={optionalDropoff ? "Same as pickup if empty" : t("route.dropoffPlaceholder")}
            aria-label={t("route.dropoffLabel")}
            autoComplete="off"
          />
        </span></span>
      </label>}
      {showPreviewMap && mapReady && !pickupOnly && (
        <div className={`col-span-full border-t border-slate-200 bg-white p-3 ${connectedMobile ? "order-6 md:order-7 md:col-span-2 lg:col-span-full" : ""}`}>
          <div
            ref={mapRef}
            className="h-[260px] w-full overflow-hidden rounded-xl bg-slate-100"
            aria-label="Google map showing the pickup and drop-off route"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4 px-1 text-[13px]/[20px] font-semibold text-slate-700">
            <span className="flex items-center gap-2">
              <Route size={17} className="text-brand-deep" />
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
