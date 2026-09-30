import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ configFile: false, appType: "custom", root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(() => vite.close());
const { BookingResultsMap } = await vite.ssrLoadModule("/components/booking-results-map.tsx");
const base = {
  area: { name: "Bangkok", polygons: [[[13.6, 100.4], [13.9, 100.4], [13.9, 100.8], [13.6, 100.4]]] },
  hourly: { hours: 6, itinerary: "Bangkok", serviceArea: "Bangkok", overtimeRate: 300 },
  pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Bangkok", date: "2030-10-01", time: "10:00",
  vehicles: [{ id: "economy_sedan", name: "Economy sedan", tagline: "Affordable", price: 1800, passengers: 2, bags: 2, fits: true }, { id: "comfort_suv", name: "Comfort SUV", tagline: "Roomy", price: 2900, fits: false }],
  selectedVehicle: "economy_sedan", quote: null, loading: false, error: "", checkoutReady: true,
  onSelectVehicle() {}, onEdit() {}, onContinue() {}, onRetry() {},
};
const render = (overrides) => renderToStaticMarkup(React.createElement(BookingResultsMap, { ...base, ...overrides }));

test("hourly operations review retains the map and selectable vehicles without fabricated fares", () => {
  const html = render({ quoteRequest: true, quoteRequestNote: "Operations will verify your addresses." });
  assert.match(html, /Route map from Suvarnabhumi/);
  assert.match(html, /6-hour private driver/);
  assert.match(html, /Operations will verify your addresses/);
  assert.match(html, /On request/);
  assert.match(html, /Quote on request/);
  assert.doesNotMatch(html, /1,800|2,900|Best value|Price held for 30 minutes|FREE Cancellation/);
  const continueButton = html.match(/<button[^>]*>Continue<\/button>/)?.[0];
  assert.ok(continueButton);
  assert.doesNotMatch(continueButton, /disabled=""/);
  assert.match(html, /disabled=""[^>]*aria-pressed="false"/);
});

test("priced hourly results keep actual fares and expiry policy", () => {
  const html = render({});
  assert.match(html, /1,800/);
  assert.match(html, /Price held for 30 minutes/);
  assert.doesNotMatch(html, /Quote on request|On request/);
});

test("an area alone cannot allow continuing without a quote or review authorization", () => {
  const html = render({ checkoutReady: false });
  assert.match(html.match(/<button[^>]*>Continue<\/button>/)?.[0] ?? "", /disabled=""/);
});
