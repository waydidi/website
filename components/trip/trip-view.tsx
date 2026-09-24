"use client";

import {
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  MapPin,
  Navigation,
  Plane,
  RefreshCw,
  Route,
  Share2,
  Signpost,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { formatDate, intlLocale, localeInfo, locales, type Locale, type MessageKey } from "@/lib/i18n";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Maps JS has no bundled types here
  interface Window { google?: any }
}

type Stage = "confirmed" | "assigned" | "on_the_way" | "waiting" | "on_trip" | "arrived" | "no_show" | "cancelled";
type Point = { latitude: number; longitude: number };
type Trip = {
  reference: string;
  access: "owner" | "shared";
  stage: Stage;
  serviceType: string;
  bookedHours: number | null;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  flightNumber: string | null;
  pickupPoint: Point | null;
  dropoffPoint: Point | null;
  meetingPoint: string | null;
  pickupSign: string | null;
  tripPin: string | null;
  timeline: Array<{ stage: Stage; at: string | null }>;
  location: (Point & { accuracyMetres: number; at: string }) | null;
  eta: { minutes: number; target: "pickup" | "dropoff" } | null;
  standbyPhoto: boolean;
  canShare: boolean;
  updatedAt: string;
};

const POLL_MS = 20_000;
const AUTH_PARAMS = ["token", "key", "share"] as const;

function authQuery() {
  const current = new URLSearchParams(window.location.search);
  const query = new URLSearchParams();
  for (const name of AUTH_PARAMS) {
    const value = current.get(name);
    if (value) query.set(name, value);
  }
  return query.toString();
}

export function TripView({ reference }: { reference: string }) {
  const { t, locale } = useI18n();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [failure, setFailure] = useState<"not_found" | "expired" | "error" | null>(null);
  const [online, setOnline] = useState(true);
  // Only read in the browser; nothing that depends on it renders before the trip loads.
  const [query] = useState<string | null>(() => (typeof window === "undefined" ? null : authQuery()));

  const load = useCallback(async () => {
    if (query === null) return;
    try {
      const response = await fetch(`/api/trip/${encodeURIComponent(reference)}${query ? `?${query}` : ""}`, { cache: "no-store" });
      if (response.status === 404) { setFailure("not_found"); return; }
      if (response.status === 410) { setFailure("expired"); return; }
      if (!response.ok) throw new Error("Trip unavailable");
      setTrip((await response.json()) as Trip);
      setFailure(null);
    } catch {
      setFailure((current) => current ?? "error");
    }
  }, [reference, query]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const resume = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", resume);
    return () => { window.clearTimeout(first); window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, [load]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const time = (value: string) => new Date(value).toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  if (!trip && failure) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface p-5 text-ink">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-xl">
          <CircleAlert className="mx-auto text-brand-deep" size={44} aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-black">{failure === "expired" ? t("trip.shareExpired") : t("trip.notFound")}</h1>
          <p className="mt-3 text-slate-600">{failure === "expired" ? t("trip.shareExpiredHelp") : t("trip.notFoundHelp")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {failure === "error" && <button type="button" onClick={() => void load()} className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-bold text-ink"><RefreshCw size={18} aria-hidden="true" /> {t("trip.retry")}</button>}
            <Link href="/booking/manage" className="inline-flex h-12 items-center rounded-full border border-slate-300 px-6 font-bold">{t("trip.findBooking")}</Link>
          </div>
        </div>
      </main>
    );
  }
  if (!trip) {
    return (
      <main className="grid min-h-screen place-items-center bg-brand text-white" aria-busy="true">
        <p className="flex items-center gap-3 font-bold"><LoaderCircle className="animate-spin motion-reduce:animate-none" size={28} aria-hidden="true" /> {t("trip.loading")}</p>
      </main>
    );
  }

  const shared = trip.access === "shared";
  // Live location and arrival time are only shared after pickup.
  const live = trip.stage === "on_trip";
  return (
    <main className="min-h-screen bg-surface pb-16 text-ink">
      <header className="bg-brand px-4 pb-10 pt-4 text-white">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <Link href="/" aria-label={t("nav.home")} className="inline-flex text-white"><WaydidiLogo className="h-[48px] w-auto" /></Link>
          <LanguageLinks locale={locale} />
        </div>
        <div className="mx-auto mt-7 max-w-xl">
          <p className="text-xs font-black uppercase tracking-[.16em] text-white/85">{shared ? t("trip.sharedTitle") : t("trip.title")} · {t("trip.reference", { reference: trip.reference })}</p>
          <h1 className="mt-2 text-[2rem] font-black leading-tight tracking-[-.03em]">{t(`trip.headline.${trip.stage}` as MessageKey)}</h1>
          {live && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-black" aria-live="polite">
              <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex size-2.5 rounded-full bg-white" /></span>
              {trip.eta ? t(trip.eta.target === "pickup" ? "trip.eta.pickup" : "trip.eta.dropoff", { minutes: trip.eta.minutes }) : t("trip.eta.unknown")}
            </p>
          )}
          {shared && <p className="mt-3 text-sm text-white/90">{t("trip.sharedNote")}</p>}
        </div>
      </header>

      <div className="mx-auto -mt-5 max-w-xl space-y-4 px-4">
        {!online && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900"><WifiOff size={18} aria-hidden="true" /> {t("trip.offline")}</p>
        )}

        {live && <LiveMap trip={trip} time={time} />}

        {trip.stage === "waiting" && <MeetCard trip={trip} query={query ?? ""} />}

        {(trip.stage === "no_show" || trip.stage === "cancelled") && (
          <section className="rounded-[26px] bg-white p-5 shadow-sm">
            <p className="leading-7 text-slate-700">{trip.stage === "no_show" ? t("trip.noShowHelp") : t("trip.notFoundHelp")}</p>
            <Link href="/contact" className="mt-4 inline-flex h-12 items-center rounded-full bg-ink px-6 font-bold text-white">{t("trip.contact")}</Link>
          </section>
        )}

        {trip.tripPin && (
          <section className="flex items-center gap-4 rounded-[26px] bg-white p-5 shadow-sm">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep"><KeyRound size={22} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[.14em] text-brand-deep">{t("trip.pin.title")}</p>
              <p className="mt-1 text-3xl font-black tracking-[.25em]">{trip.tripPin}</p>
              <p className="mt-1 text-sm text-slate-600">{t("trip.pin.help")}</p>
            </div>
          </section>
        )}

        <section className="rounded-[26px] bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">{t("trip.route.when", { date: formatDate(trip.pickupDate), time: trip.pickupTime })}</p>
          <div className="mt-4 flex gap-3">
            <MapPin className="mt-0.5 shrink-0 text-brand" size={19} aria-hidden="true" />
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("trip.route.pickup")}</p><p className="mt-1 font-bold leading-5">{trip.pickup}</p></div>
          </div>
          <div className="my-3 ml-[9px] h-5 border-l-2 border-dotted border-slate-300" aria-hidden="true" />
          <div className="flex gap-3">
            <Route className="mt-0.5 shrink-0 text-brand" size={19} aria-hidden="true" />
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("trip.route.dropoff")}</p><p className="mt-1 font-bold leading-5">{trip.dropoff}</p></div>
          </div>
          {trip.flightNumber && <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-sm font-bold"><Plane size={15} aria-hidden="true" /> {t("trip.route.flight", { flight: trip.flightNumber })}</p>}
        </section>

        <Timeline trip={trip} time={time} />

        {trip.canShare && <ShareCard reference={trip.reference} query={query ?? ""} />}

        <p className="text-center text-xs text-slate-500">{t("trip.updated", { time: time(trip.updatedAt) })}</p>
      </div>
    </main>
  );
}

function LanguageLinks({ locale }: { locale: Locale }) {
  // Keeps the trip's access key in the address when switching language.
  function open(event: React.MouseEvent<HTMLAnchorElement>, item: Locale) {
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    if (item === "en") params.delete("lang"); else params.set("lang", item);
    const search = params.toString();
    window.location.assign(`${window.location.pathname}${search ? `?${search}` : ""}`);
  }
  return (
    <nav aria-label="Language" className="flex rounded-full bg-white/20 p-1 text-xs font-black">
      {locales.map((item) => (
        <a key={item} href={item === "en" ? "?" : `?lang=${item}`} onClick={(event) => open(event, item)} lang={localeInfo[item].htmlLang} aria-current={item === locale ? "true" : undefined}
          className={`rounded-full px-3 py-1.5 ${item === locale ? "bg-white text-brand-deep" : "text-white"}`}>
          {item === "en" ? "EN" : item === "th" ? "ไทย" : "中文"}
        </a>
      ))}
    </nav>
  );
}

function Timeline({ trip, time }: { trip: Trip; time: (value: string) => string }) {
  const { t } = useI18n();
  const order: Stage[] = ["confirmed", "assigned", "on_the_way", "waiting", "on_trip", "arrived"];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  // Times from another day also show the date (dd/mm).
  const stamp = (value: string) => {
    const day = new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    return day === today ? time(value) : `${formatDate(day).slice(0, 5)} ${time(value)}`;
  };
  const terminal = trip.stage === "no_show" || trip.stage === "cancelled";
  const reached = terminal ? -1 : order.indexOf(trip.stage);
  return (
    <section className="rounded-[26px] bg-white p-5 shadow-sm" aria-labelledby="trip-timeline">
      <h2 id="trip-timeline" className="text-lg font-black">{t("trip.timeline")}</h2>
      <ol className="mt-5">
        {order.map((stage, index) => {
          const at = trip.timeline.find((item) => item.stage === stage)?.at ?? null;
          const done = terminal ? Boolean(at) : index < reached;
          const current = index === reached;
          return (
            <li key={stage} className="grid grid-cols-[34px_1fr] gap-3" aria-current={current ? "step" : undefined}>
              <div className="flex flex-col items-center">
                <span className={`grid size-8 place-items-center rounded-full border-2 text-sm font-black ${done ? "border-brand bg-brand text-ink" : current ? "border-brand bg-brand-soft text-brand-deep" : "border-slate-200 text-slate-400"}`}>
                  {done ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                {index < order.length - 1 && <span className={`min-h-7 w-0.5 flex-1 ${done ? "bg-brand" : "bg-slate-200"}`} aria-hidden="true" />}
              </div>
              <div className="pb-5">
                <p className={`font-black ${done || current ? "text-ink" : "text-slate-500"}`}>{t(`trip.stage.${stage}` as MessageKey)}</p>
                {at && <p className="text-sm text-slate-500">{stamp(at)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {terminal && <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-800">{t(`trip.stage.${trip.stage}` as MessageKey)}</p>}
    </section>
  );
}

function MeetCard({ trip, query }: { trip: Trip; query: string }) {
  const { t } = useI18n();
  return (
    <section className="overflow-hidden rounded-[26px] bg-white shadow-sm">
      {trip.standbyPhoto && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- private, uncached evidence photo */}
          <img src={`/api/trip/${encodeURIComponent(trip.reference)}/photo${query ? `?${query}` : ""}`} alt={t("trip.meet.photoAlt")} className="aspect-[4/3] w-full object-cover" onError={(event) => { const figure = event.currentTarget.closest("figure"); if (figure) figure.hidden = true; }} />
          <figcaption className="px-5 pt-3 text-xs font-semibold text-slate-500">{t("trip.meet.photoCaption")}</figcaption>
        </figure>
      )}
      <div className="p-5">
        <h2 className="text-lg font-black">{t("trip.meet.title")}</h2>
        {trip.pickupSign && (
          <p className="mt-3 flex items-start gap-3 rounded-2xl bg-brand-soft p-4 font-bold text-ink">
            <Signpost className="mt-0.5 shrink-0 text-brand-deep" size={20} aria-hidden="true" /> {t("trip.meet.sign", { name: trip.pickupSign })}
          </p>
        )}
        {trip.meetingPoint && (
          <div className="mt-3 rounded-2xl bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("trip.meet.point")}</p>
            <p className="mt-1 font-bold leading-6">{trip.meetingPoint}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function LiveMap({ trip, time }: { trip: Trip; time: (value: string) => string }) {
  const { t } = useI18n();
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Maps JS objects
  const mapState = useRef<{ map: any; car: any; target: any } | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const target = trip.dropoffPoint;
  const targetLabel = t("trip.map.dropoff");

  useEffect(() => {
    let cancelled = false;
    async function loadMaps() {
      if (window.google?.maps) { setMapsReady(true); return; }
      const response = await fetch("/api/maps/config", { cache: "no-store" });
      const { apiKey } = (await response.json()) as { apiKey?: string };
      if (!apiKey || cancelled) return;
      const existing = document.querySelector<HTMLScriptElement>("script[data-waydidi-google-maps]");
      if (existing) { existing.addEventListener("load", () => !cancelled && setMapsReady(true), { once: true }); return; }
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
      script.async = true;
      script.dataset.waydidiGoogleMaps = "true";
      script.addEventListener("load", () => !cancelled && setMapsReady(true), { once: true });
      document.head.appendChild(script);
    }
    loadMaps().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const car = trip.location;
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    if (!mapState.current) {
      const map = new maps.Map(mapRef.current, { disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "cooperative", mapId: "DEMO_MAP_ID" });
      const dot = (fill: string, scale: number) => ({ path: maps.SymbolPath.CIRCLE, fillColor: fill, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 4, scale });
      mapState.current = {
        map,
        car: new maps.Marker({ map, title: t("trip.map.driver"), icon: dot("#FF8A05", 11), zIndex: 2 }),
        target: new maps.Marker({ map, title: targetLabel, icon: dot("#21140A", 8), zIndex: 1 }),
      };
    }
    const { map, car: carMarker, target: targetMarker } = mapState.current;
    const bounds = new maps.LatLngBounds();
    if (car) { const position = { lat: car.latitude, lng: car.longitude }; carMarker.setPosition(position); carMarker.setVisible(true); bounds.extend(position); } else carMarker.setVisible(false);
    if (target) { const position = { lat: target.latitude, lng: target.longitude }; targetMarker.setPosition(position); targetMarker.setTitle(targetLabel); targetMarker.setVisible(true); bounds.extend(position); } else targetMarker.setVisible(false);
    if (car && target) map.fitBounds(bounds, 56);
    else if (car || target) { map.setCenter(bounds.getCenter()); map.setZoom(14); }
  }, [mapsReady, car, target, targetLabel, t]);

  const openUrl = car ? `https://www.google.com/maps/search/?api=1&query=${car.latitude},${car.longitude}` : null;
  return (
    <section className="overflow-hidden rounded-[26px] bg-white shadow-sm">
      <div className="relative h-72 bg-[linear-gradient(135deg,#f0eee9,#dfe7df)]">
        <div ref={mapRef} className="absolute inset-0" role="img" aria-label={t("trip.map.label")} />
        {!mapsReady && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <Navigation className="text-brand-deep" size={34} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span className="font-semibold text-slate-600">{car ? t("trip.map.lastSeen", { time: time(car.at) }) : t("trip.map.waiting")}</span>
        {openUrl && (
          <a href={openUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-black text-brand-deep">
            {t("trip.map.open")} <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}

function ShareCard({ reference, query }: { reference: string; query: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"" | "copied" | "stopped" | "error">("");

  async function call(action: "create" | "revoke") {
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/trip/${encodeURIComponent(reference)}/share${query ? `?${query}` : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { url?: string };
      if (!response.ok) throw new Error();
      if (action === "create") setUrl(result.url ?? null); else { setUrl(null); setStatus("stopped"); }
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: t("trip.share.message"), url }); return; } catch { /* closed, fall back to copy */ }
    }
    try { await navigator.clipboard.writeText(url); setStatus("copied"); } catch { setStatus("error"); }
  }

  return (
    <section className="rounded-[26px] bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-black"><Share2 size={19} className="text-brand-deep" aria-hidden="true" /> {t("trip.share.title")}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t("trip.share.help")}</p>
      {url ? (
        <div className="mt-4 space-y-3">
          <p className="break-all rounded-2xl bg-surface p-3 text-sm font-semibold text-slate-700">{url}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void send()} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-black text-ink">
              {typeof navigator !== "undefined" && "share" in navigator ? <Share2 size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {typeof navigator !== "undefined" && "share" in navigator ? t("trip.share.send") : t("trip.share.copy")}
            </button>
            <button type="button" disabled={busy} onClick={() => void call("revoke")} className="h-12 rounded-full border border-slate-300 font-bold disabled:opacity-50">{t("trip.share.stop")}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void call("create")} className="flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-black text-white disabled:opacity-50">
            {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />} {t("trip.share.create")}
          </button>
          <button type="button" disabled={busy} onClick={() => void call("revoke")} className="h-12 rounded-full px-4 text-sm font-bold text-slate-600 underline-offset-4 hover:underline disabled:opacity-50">{t("trip.share.stop")}</button>
        </div>
      )}
      <p aria-live="polite" className="mt-3 text-sm font-semibold text-slate-600">
        {status === "copied" ? t("trip.share.copied") : status === "stopped" ? t("trip.share.stopped") : status === "error" ? t("trip.share.error") : ""}
      </p>
    </section>
  );
}
