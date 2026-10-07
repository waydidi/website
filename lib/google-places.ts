"use client";

export type PlaceBounds = { south: number; west: number; north: number; east: number };
export type SelectedPlace = { placeId: string; address: string; location: { lat: number; lng: number } | null };
type Place = { id: string; displayName?: string; formattedAddress?: string; location?: { lat(): number; lng(): number }; fetchFields(options: { fields: string[] }): Promise<unknown> };
type Prediction = { placeId: string; text: { toString(): string }; toPlace(): Place };
type Places = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(request: { input: string; includedRegionCodes: string[]; sessionToken?: object; locationBias?: PlaceBounds }): Promise<{ suggestions: { placePrediction?: Prediction }[] }> };
};
let loading: Promise<boolean> | null = null;
const ready = () => Boolean(window.google?.maps?.places?.AutocompleteSuggestion);
const bounded = <T,>(promise: Promise<T>, ms: number): Promise<T> => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("MAPS_TIMEOUT")), ms);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});

/** Shares loading across every address input. Errors/timeouts remove the script and permit retry. */
export function loadMaps(): Promise<boolean> {
  if (ready()) return Promise.resolve(true);
  if (loading) return loading;
  loading = (async () => {
    try {
      if (window.google?.maps?.importLibrary) {
        await bounded(window.google.maps.importLibrary("places"), 12000);
        return ready();
      }
      const response = await fetch("/api/maps/config", { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) return false;
      const { apiKey } = await response.json() as { apiKey?: string };
      if (!apiKey) return false;
      return await new Promise<boolean>((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>("script[data-waydidi-google-maps]");
        const script = existing ?? document.createElement("script");
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          script.removeEventListener("load", loaded);
          script.removeEventListener("error", failed);
          if (!ok) script.remove();
          resolve(ok);
        };
        const loaded = () => finish(ready());
        const failed = () => finish(false);
        const timer = setTimeout(failed, 12000);
        script.addEventListener("load", loaded, { once: true });
        script.addEventListener("error", failed, { once: true });
        if (!existing) {
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
          script.async = true;
          script.dataset.waydidiGoogleMaps = "true";
          document.head.appendChild(script);
        }
      });
    } catch { return false; }
  })().finally(() => { loading = null; });
  return loading;
}

/** New Places API, retaining the site's existing inputs, free typing, keyboard and touch support. */
export function attachPlaceAutocomplete(input: HTMLInputElement, onPick: (place: SelectedPlace) => void) {
  const places = window.google.maps.places as Places;
  const list = document.createElement("div"), id = `wd-places-${crypto.randomUUID()}`;
  list.id = id; list.role = "listbox"; list.dataset.noTranslate = "true";
  list.className = "fixed z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white text-sm text-slate-900 shadow-xl";
  list.hidden = true; document.body.appendChild(list);
  const attrs = ["role", "aria-autocomplete", "aria-controls", "aria-expanded", "aria-activedescendant"];
  const previous = new Map(attrs.map((attr) => [attr, input.getAttribute(attr)]));
  input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list"); input.setAttribute("aria-controls", id); input.setAttribute("aria-expanded", "false");
  let alive = true, version = 0, timer: ReturnType<typeof setTimeout> | undefined, active = -1;
  let predictions: Prediction[] = [], sessionToken: object | undefined, bounds: PlaceBounds | undefined;
  const position = () => {
    const rect = input.getBoundingClientRect();
    list.style.left = `${Math.max(8, rect.left)}px`; list.style.top = `${rect.bottom + 4}px`;
    list.style.width = `${Math.min(Math.max(rect.width, 260), window.innerWidth - 16)}px`;
    list.style.maxHeight = `${Math.max(80, window.innerHeight - rect.bottom - 16)}px`;
  };
  const close = () => { list.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); };
  const highlight = () => {
    [...list.querySelectorAll<HTMLElement>("[role=option]")].forEach((el, i) => { el.setAttribute("aria-selected", String(i === active)); el.style.backgroundColor = i === active ? "#fff3e5" : ""; });
    if (active >= 0) input.setAttribute("aria-activedescendant", `${id}-${active}`); else input.removeAttribute("aria-activedescendant");
  };
  const choose = async (prediction: Prediction) => {
    const request = ++version; clearTimeout(timer); close();
    try {
      const place = prediction.toPlace();
      sessionToken = undefined; // fetchFields ends this session; new typing must get a fresh token.
      await bounded(place.fetchFields({ fields: ["id", "displayName", "formattedAddress", "location"] }), 12000);
      if (!alive || request !== version) return;
      const name = place.displayName ?? "", formatted = place.formattedAddress ?? "";
      const address = name && formatted && !formatted.startsWith(name) ? `${name}, ${formatted}` : formatted || name;
      if (!place.id || !address) return;
      input.value = address;
      onPick({ placeId: place.id, address, location: place.location ? { lat: place.location.lat(), lng: place.location.lng() } : null });
    } catch { /* Free typing remains available when Google rejects a request. */ }

  };
  const changed = () => {
    const request = ++version; clearTimeout(timer); close(); predictions = [];
    const text = input.value.trim(); if (text.length < 2 || input.disabled) return;
    timer = setTimeout(async () => {
      try {
        sessionToken ??= new places.AutocompleteSessionToken();
        const result = await bounded(places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text, includedRegionCodes: ["th"], sessionToken, ...(bounds ? { locationBias: bounds } : {}) }), 10000);
        if (!alive || request !== version || document.activeElement !== input) return;
        predictions = result.suggestions.flatMap((s) => s.placePrediction ? [s.placePrediction] : []);
        list.replaceChildren();
        predictions.forEach((prediction, i) => {
          const option = document.createElement("div"); option.role = "option"; option.id = `${id}-${i}`; option.setAttribute("aria-selected", "false");
          option.className = "cursor-pointer px-4 py-3 hover:bg-orange-50"; option.textContent = prediction.text.toString();
          option.addEventListener("pointerdown", (event) => { event.preventDefault(); void choose(prediction); }); list.appendChild(option);
        });
        if (predictions.length) {
          const attribution = document.createElement("img"); attribution.src = "https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"; attribution.alt = "Powered by Google"; attribution.className = "ml-auto mr-4 my-2 h-[18px]"; list.appendChild(attribution);
          position(); list.hidden = false; input.setAttribute("aria-expanded", "true");
        }
      } catch { if (alive && request === version) close(); }
    }, 250);
  };
  const keydown = (event: KeyboardEvent) => {
    if (list.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); active = (active + (event.key === "ArrowDown" ? 1 : -1) + predictions.length) % predictions.length; highlight(); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); void choose(predictions[active]); }
  };
  const blur = () => { ++version; clearTimeout(timer); close(); };
  input.addEventListener("input", changed); input.addEventListener("keydown", keydown); input.addEventListener("blur", blur);
  window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
  return { setBounds: (value?: PlaceBounds) => { bounds = value; }, dispose: () => {
    alive = false; ++version; clearTimeout(timer); list.remove();
    input.removeEventListener("input", changed); input.removeEventListener("keydown", keydown); input.removeEventListener("blur", blur);
    window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true);
    for (const [attr, value] of previous) { if (value === null) input.removeAttribute(attr); else input.setAttribute(attr, value); }
  } };
}

/** Resolve freely typed text without invoking the retired AutocompleteService. */
export async function resolveGooglePlaceId(text: string): Promise<string | null> {
  if (text.trim().length < 2 || !await loadMaps()) return null;
  try {
    const places = window.google.maps.places as Places;
    const result = await bounded(places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: text.trim(), includedRegionCodes: ["th"] }), 10000);
    return result.suggestions[0]?.placePrediction?.placeId ?? null;
  } catch { return null; }
}
