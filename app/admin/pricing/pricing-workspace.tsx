"use client";

import {
  AreaChart,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Crosshair,
  Layers3,
  Map,
  MapPinned,
  MousePointer2,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  Truck,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WaydidiLogo } from "@/components/waydidi-logo";

declare global {
  interface Window {
    google?: any;
  }
}
type Point = { lat: number; lng: number };
type Rule = {
  vehicleId: string;
  basePrice: number;
  includedDistanceKm: number;
  extraPricePerKm: number;
  fixedPrice: number | null;
};
type Area = {
  id: string;
  name: string;
  code: string;
  color: string;
  pricingType: "hybrid" | "fixed" | "manual";
  priority: number;
  status: string;
  version: number;
  polygons: Point[][];
  rules: Rule[];
};
const vehicleNames: Record<string, string> = {
  economy_sedan: "Economy sedan",
  comfort_bmw: "Comfort BMW",
  comfort_suv: "Comfort SUV",
  premium_minivan: "Premium Minivan",
};
const defaultRules = () =>
  Object.keys(vehicleNames).map((vehicleId, index) => ({
    vehicleId,
    basePrice: [800, 1100, 1300, 1600][index],
    includedDistanceKm: 35,
    extraPricePerKm: [12, 16, 18, 22][index],
    fixedPrice: null,
  }));
const blankArea = (): Area => ({
  id: crypto.randomUUID(),
  name: "New pricing area",
  code: `AREA_${Date.now().toString().slice(-6)}`,
  color: "#FF8A05",
  pricingType: "hybrid",
  priority: 50,
  status: "draft",
  version: 1,
  polygons: [[]],
  rules: defaultRules(),
});

export default function PricingWorkspace({ email }: { email: string }) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [testResult, setTestResult] = useState("");
  const mapNode = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const mapInstance = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const testMarker = useRef<any>(null);
  const selected = useMemo(
    () => areas.find((area) => area.id === selectedId) ?? null,
    [areas, selectedId],
  );
  const geometryKey = JSON.stringify(selected?.polygons ?? []);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/pricing", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { areas: Area[] };
      setAreas(data.areas);
      setSelectedId((current) => current || data.areas[0]?.id || "");
    }
  }, []);
  useEffect(() => {
    load();
    fetch("/api/maps/config")
      .then((r) => r.json())
      .then(({ apiKey }: { apiKey: string }) => {
        if (!apiKey) return;
        if (window.google?.maps) {
          setMapReady(true);
          return;
        }
        let script = document.querySelector<HTMLScriptElement>(
          "script[data-waydidi-google-maps]",
        );
        if (!script) {
          script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
          script.async = true;
          script.dataset.waydidiGoogleMaps = "true";
          document.head.appendChild(script);
        }
        script.addEventListener("load", () => setMapReady(true), {
          once: true,
        });
      });
  }, [load]);
  useEffect(() => {
    if (!mapReady || !searchInput.current || !window.google?.maps?.places) return;
    const maps = window.google.maps;
    const autocomplete = new maps.places.Autocomplete(searchInput.current, { componentRestrictions:{country:"th"},fields:["formatted_address","geometry","name"] });
    autocomplete.addListener("place_changed",()=>{const place=autocomplete.getPlace();const location=place.geometry?.location;if(!location||!mapInstance.current)return;const point={lat:location.lat(),lng:location.lng()};const inside=(polygon:Point[])=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a.lng>point.lng)!==(b.lng>point.lng))&&point.lat<((b.lat-a.lat)*(point.lng-a.lng))/(b.lng-a.lng||Number.EPSILON)+a.lat)hit=!hit;}return hit;};const match=[...areas].sort((a,b)=>b.priority-a.priority).find(area=>area.status!=="archived"&&area.polygons.some(inside));setTestResult(match?`${place.formatted_address||place.name} → ${match.name} (${match.pricingType})`:`${place.formatted_address||place.name} → Manual quotation`);if(testMarker.current)testMarker.current.setMap(null);testMarker.current=new maps.Marker({map:mapInstance.current,position:point});mapInstance.current.panTo(point);mapInstance.current.setZoom(11);});
    return()=>maps.event.clearInstanceListeners(autocomplete);
  },[mapReady,areas]);
  const update = (patch: Partial<Area>) =>
    setAreas((current) =>
      current.map((area) =>
        area.id === selectedId ? { ...area, ...patch } : area,
      ),
    );
  const updatePoint = (shape: number, points: Point[]) =>
    selected &&
    update({
      polygons: selected.polygons.map((polygon, index) =>
        index === shape ? points : polygon,
      ),
    });
  useEffect(() => {
    if (!mapReady || !mapNode.current || !selected) return;
    const maps = window.google.maps;
    if (!mapInstance.current)
      mapInstance.current = new maps.Map(mapNode.current, {
        center: { lat: 13.2, lng: 101.1 },
        zoom: 6,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    overlays.current.forEach((item) => item.setMap(null));
    overlays.current = [];
    selected.polygons.forEach((points, shapeIndex) => {
      if (points.length < 2) return;
      const polygon = new maps.Polygon({
        map: mapInstance.current,
        paths: points,
        strokeColor: selected.color,
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: selected.color,
        fillOpacity: 0.18,
        editable: true,
      });
      overlays.current.push(polygon);
      const sync = () =>
        updatePoint(
          shapeIndex,
          polygon
            .getPath()
            .getArray()
            .map((item: any) => ({ lat: item.lat(), lng: item.lng() })),
        );
      polygon.getPath().addListener("set_at", sync);
      polygon.getPath().addListener("insert_at", sync);
      polygon.getPath().addListener("remove_at", sync);
    });
    const listener = mapInstance.current.addListener("click", (event: any) => {
      if (!event.latLng) return;
      const shape = Math.max(0, selected.polygons.length - 1);
      updatePoint(shape, [
        ...(selected.polygons[shape] ?? []),
        { lat: event.latLng.lat(), lng: event.latLng.lng() },
      ]);
    });
    return () => maps.event.removeListener(listener);
  }, [mapReady, selectedId, selected?.color, geometryKey]);
  async function save(action: "draft" | "publish" | "archive") {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...selected, action }),
    });
    const result = (await response.json()) as { error?: string };
    setMessage(
      response.ok
        ? action === "publish"
          ? "Pricing area published."
          : action === "archive"
            ? "Area archived."
            : "Draft saved."
        : (result.error ?? "Could not save this area."),
    );
    setBusy(false);
    if (response.ok) load();
  }
  function addArea() {
    const area = blankArea();
    setAreas((current) => [...current, area]);
    setSelectedId(area.id);
  }
  function undo() {
    if (!selected) return;
    const index = selected.polygons.length - 1;
    updatePoint(index, (selected.polygons[index] ?? []).slice(0, -1));
  }
  function newShape() {
    if (selected) update({ polygons: [...selected.polygons, []] });
  }
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#1f1726]">
      <div className="grid min-h-screen lg:grid-cols-[238px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white p-5 lg:flex lg:flex-col">
          <a href="/" className="inline-flex text-[#FF8A05]">
            <WaydidiLogo className="h-14 w-auto" />
          </a>
          <nav className="mt-8 space-y-1 text-sm font-semibold">
            <a
              href="/admin/calendar"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-slate-600 hover:bg-orange-50"
            >
              <CalendarDays size={18} />
              Calendar
            </a>
            <a
              href="/admin/bookings"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-slate-600 hover:bg-orange-50"
            >
              <BookOpen size={18} />
              Bookings
            </a>
            <a
              href="/admin/operations"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-slate-600 hover:bg-orange-50"
            >
              <Truck size={18} />
              Booking operations
            </a>
            <a
              href="/admin/pricing"
              className="flex items-center gap-3 rounded-xl bg-orange-50 px-3 py-3 text-[#D96F00]"
            >
              <MapPinned size={18} />
              Pricing areas
            </a>
            <span className="flex items-center gap-3 rounded-xl px-3 py-3 text-slate-400">
              <AreaChart size={18} />
              Analytics
            </span>
          </nav>
          <div className="mt-auto rounded-2xl bg-[#21140A] p-4 text-white">
            <p className="text-xs text-white/60">Signed in as</p>
            <p className="mt-1 truncate text-sm font-bold">{email}</p>
            <a
              href="/signout-with-chatgpt?return_to=/"
              className="mt-4 inline-flex text-xs font-bold text-[#FFB45F]"
            >
              Sign out
            </a>
          </div>
        </aside>
        <section className="min-w-0">
          <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-[#D96F00]">
                Waydidi operations
              </p>
              <h1 className="text-xl font-black">Pricing areas</h1>
            </div>
            <button
              onClick={addArea}
              className="flex h-11 items-center gap-2 rounded-full bg-[#FF8A05] px-5 text-sm font-bold text-white"
            >
              <Plus size={18} />
              Add area
            </button>
          </header>
          <div className="grid gap-5 p-5 xl:grid-cols-[300px_minmax(0,1fr)] lg:p-8">
            <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between px-2 pb-3">
                <h2 className="font-black">Service map</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">
                  {areas.filter((a) => a.status === "published").length} live
                </span>
              </div>
              <div className="space-y-2">
                {areas.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => setSelectedId(area.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${area.id === selectedId ? "border-[#FF8A05] bg-orange-50" : "border-transparent hover:bg-slate-50"}`}
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: area.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">
                        {area.name}
                      </strong>
                      <span className="text-xs capitalize text-slate-500">
                        {area.pricingType} · {area.status}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      v{area.version}
                    </span>
                  </button>
                ))}
                {areas.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                    Add your first Thailand pricing area.
                  </div>
                )}
              </div>
            </section>
            <section className="min-w-0">
              {selected ? (
                <Tabs defaultValue="map">
                  <TabsList className="mb-4 h-11 rounded-xl bg-white p-1 shadow-sm">
                    <TabsTrigger value="map" className="rounded-lg px-5">
                      Map editor
                    </TabsTrigger>
                    <TabsTrigger value="prices" className="rounded-lg px-5">
                      Vehicle prices
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="rounded-lg px-5">
                      Settings
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="map">
                    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={newShape}
                            className="flex items-center gap-2 rounded-xl bg-[#21140A] px-4 py-2 text-sm font-bold text-white"
                          >
                            <MousePointer2 size={16} />
                            New shape
                          </button>
                          <button
                            onClick={undo}
                            className="grid size-10 place-items-center rounded-xl border border-slate-200"
                            title="Undo point"
                          >
                            <Undo2 size={17} />
                          </button>
                          <button
                            onClick={() => update({ polygons: [[]] })}
                            className="grid size-10 place-items-center rounded-xl border border-slate-200 text-red-600"
                            title="Clear map"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Crosshair size={17} />
                          Click around an area, then drag points to refine it.
                        </div>
                      </div>
                      {mapReady ? (
                        <div
                          ref={mapNode}
                          className="h-[560px] w-full bg-slate-100"
                        />
                      ) : (
                        <div className="grid h-[560px] place-items-center bg-slate-100 p-8 text-center">
                          <div>
                            <Map className="mx-auto text-slate-300" size={46} />
                            <h3 className="mt-4 text-xl font-black">
                              Google Maps key required
                            </h3>
                            <p className="mt-2 max-w-sm text-sm text-slate-500">
                              Configure the browser key to draw and preview
                              Thailand pricing areas.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="prices">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-xl font-black">Vehicle prices</h2>
                          <p className="mt-1 text-sm text-slate-500">
                            Set fixed fares or distance allowances for this
                            area.
                          </p>
                        </div>
                        <span
                          className="rounded-full px-3 py-1 text-xs font-black capitalize"
                          style={{
                            backgroundColor: `${selected.color}22`,
                            color: selected.color,
                          }}
                        >
                          {selected.pricingType}
                        </span>
                      </div>
                      <div className="mt-6 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="text-xs uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="pb-3">Vehicle</th>
                              <th className="pb-3">Base/fixed price</th>
                              <th className="pb-3">Included km</th>
                              <th className="pb-3">Extra per km</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selected.rules.map((rule, index) => (
                              <tr key={rule.vehicleId}>
                                <td className="py-4 font-bold">
                                  {vehicleNames[rule.vehicleId]}
                                </td>
                                {(
                                  [
                                    "basePrice",
                                    "includedDistanceKm",
                                    "extraPricePerKm",
                                  ] as const
                                ).map((key) => (
                                  <td key={key} className="py-3 pr-3">
                                    <input
                                      type="number"
                                      min="0"
                                      value={rule[key]}
                                      onChange={(event) =>
                                        update({
                                          rules: selected.rules.map(
                                            (item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    [key]: Number(
                                                      event.target.value,
                                                    ),
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                      className="h-11 w-32 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#FF8A05]"
                                      disabled={
                                        selected.pricingType === "manual"
                                      }
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="settings">
                    <div className="grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
                      <label className="text-sm font-bold">
                        Area name
                        <input
                          value={selected.name}
                          onChange={(e) => update({ name: e.target.value })}
                          className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4"
                        />
                      </label>
                      <label className="text-sm font-bold">
                        Internal code
                        <input
                          value={selected.code}
                          onChange={(e) =>
                            update({
                              code: e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9_]/g, ""),
                            })
                          }
                          className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 font-mono"
                        />
                      </label>
                      <label className="text-sm font-bold">
                        Pricing method
                        <select
                          value={selected.pricingType}
                          onChange={(e) =>
                            update({
                              pricingType: e.target
                                .value as Area["pricingType"],
                            })
                          }
                          className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4"
                        >
                          <option value="hybrid">Zone + distance hybrid</option>
                          <option value="fixed">Fixed price</option>
                          <option value="manual">Manual quotation</option>
                        </select>
                      </label>
                      <label className="text-sm font-bold">
                        Area color
                        <div className="mt-2 flex h-12 items-center gap-3 rounded-xl border border-slate-200 px-3">
                          <input
                            type="color"
                            value={selected.color}
                            onChange={(e) => update({ color: e.target.value })}
                            className="size-8"
                          />
                          <span className="font-mono text-sm">
                            {selected.color}
                          </span>
                        </div>
                      </label>
                      <label className="text-sm font-bold">
                        Priority
                        <input
                          type="number"
                          min="0"
                          max="999"
                          value={selected.priority}
                          onChange={(e) =>
                            update({ priority: Number(e.target.value) })
                          }
                          className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4"
                        />
                      </label>
                    </div>
                  </TabsContent>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      disabled={busy}
                      onClick={() => save("draft")}
                      className="flex h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 font-bold"
                    >
                      <Save size={18} />
                      Save draft
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => save("publish")}
                      className="flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white"
                    >
                      <Check size={18} />
                      Publish area
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => save("archive")}
                      className="ml-auto h-12 rounded-full px-5 font-bold text-red-600"
                    >
                      Archive
                    </button>
                    {message && (
                      <p className="w-full rounded-xl bg-white p-3 text-sm font-semibold">
                        {message}
                      </p>
                    )}
                  </div>
                  <div className="w-full"><input ref={searchInput} placeholder="Test a hotel, address or destination in Thailand" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#FF8A05]"/>{testResult&&<p className="mt-2 rounded-xl bg-orange-50 px-4 py-3 text-sm font-bold text-orange-950">{testResult}</p>}</div>
                </Tabs>
              ) : (
                <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white">
                  <div className="text-center">
                    <Layers3 className="mx-auto text-slate-300" size={48} />
                    <h2 className="mt-4 text-xl font-black">
                      Select or add an area
                    </h2>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
