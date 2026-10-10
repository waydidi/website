import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { googleMapsLink, directionsTo } = await vite.ssrLoadModule("/lib/maps-link.ts");

test("Google Maps share and place links are accepted, even inside a message", () => {
  assert.equal(googleMapsLink("https://maps.app.goo.gl/AbCdEf123"), "https://maps.app.goo.gl/AbCdEf123");
  assert.equal(googleMapsLink("Pickup here: https://maps.app.goo.gl/AbCdEf123 thanks"), "https://maps.app.goo.gl/AbCdEf123");
  assert.equal(googleMapsLink("https://www.google.com/maps/place/Hilton+Pattaya/@12.93,100.88,17z"), "https://www.google.com/maps/place/Hilton+Pattaya/@12.93,100.88,17z");
  assert.equal(googleMapsLink("https://goo.gl/maps/xyz"), "https://goo.gl/maps/xyz");
  assert.equal(googleMapsLink("https://maps.google.co.th/?q=13.7,100.5"), "https://maps.google.co.th/?q=13.7,100.5");
});

test("other links and plain text are refused", () => {
  assert.equal(googleMapsLink("Hilton Pattaya"), null);
  assert.equal(googleMapsLink("https://example.com/maps/abc"), null);
  assert.equal(googleMapsLink("https://www.google.com/search?q=hilton"), null);
  assert.equal(googleMapsLink("https://maps.app.goo.gl.evil.com/x"), null);
  assert.equal(googleMapsLink("javascript:alert(1)"), null);
});

test("without a link, directions go to the address", () => {
  assert.equal(directionsTo("Hilton Pattaya"), "https://www.google.com/maps/dir/?api=1&destination=Hilton%20Pattaya");
});
