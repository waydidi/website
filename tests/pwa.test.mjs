import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const publicFile = (path) => readFile(new URL(`../public/${path}`, import.meta.url));
const source = (await publicFile("sw.js")).toString();

function worker(network = async () => new Response("fresh")) {
  const handlers = {}, storage = new Map(), writes = [];
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const items = storage.get(name);
      return {
        async addAll(paths) { for (const path of paths) { writes.push(path); items.set(path, new Response(path)); } },
        async match(path) { return items.get(path)?.clone(); },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  let claimed = false;
  const self = { location: { origin: "https://waydidi.example" }, clients: { async claim() { claimed = true; } }, addEventListener: (name, handler) => { handlers[name] = handler; } };
  vm.runInNewContext(source, { self, caches, fetch: network, URL, Response });
  async function lifecycle(name) {
    let work;
    handlers[name]({ waitUntil(promise) { work = promise; } });
    await work;
  }
  function request(path, options = {}) {
    let response;
    const req = { url: new URL(path, self.location.origin).href, method: "GET", mode: "navigate", headers: new Headers(), ...options };
    handlers.fetch({ request: req, respondWith(promise) { response = promise; } });
    return response;
  }
  return { lifecycle, request, storage, writes, claimed: () => claimed };
}

test("manifest icons exist at their declared dimensions and launch on this origin", async () => {
  const manifest = JSON.parse((await publicFile("manifest.webmanifest")).toString());
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const image = await publicFile(icon.src.slice(1));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(`${image.readUInt32BE(16)}x${image.readUInt32BE(20)}`, icon.sizes);
    assert.ok(icon.purpose.includes("maskable"));
  }
  for (const shortcut of manifest.shortcuts) assert.equal(new URL(shortcut.url, "https://waydidi.example").origin, "https://waydidi.example");
});

test("install caches exactly the public offline kit", async () => {
  const w = worker();
  await w.lifecycle("install");
  assert.deepEqual(w.writes, ["/offline.html", "/pwa/icon-192.png", "/pwa/icon-512.png"]);
});

test("offline navigation serves generic help without storing a token-bearing URL", async () => {
  const w = worker(async () => { throw new TypeError("offline"); });
  await w.lifecycle("install");
  for (const path of ["/", "/pay/SECRET", "/admin/payments", "/trip/ABC123?token=PRIVATE", "/th"]) {
    assert.equal(await (await w.request(path)).text(), "/offline.html");
  }
  assert.equal(w.writes.length, 3);
});

test("online private navigation and HTTP failures are preserved without caching", async () => {
  let response = new Response("private payment data", { status: 200 });
  const w = worker(async () => response);
  assert.equal(await w.request("/pay/SECRET"), response);
  response = new Response("unauthorized", { status: 401 });
  assert.equal(await w.request("/admin/payments"), response);
  assert.deepEqual(w.writes, []);
});

test("API, mutations, cross-origin, RSC and script fetches are never intercepted", () => {
  const w = worker();
  assert.equal(w.request("/api/checkout", { method: "POST" }), undefined);
  assert.equal(w.request("/api/bookings/ABC123"), undefined);
  assert.equal(w.request("https://api.stripe.com/v1/payments"), undefined);
  assert.equal(w.request("/?_rsc=abc"), undefined);
  assert.equal(w.request("/", { headers: new Headers({ RSC: "1" }) }), undefined);
  assert.equal(w.request("/assets/app.js", { mode: "cors" }), undefined);
  assert.equal(w.request("/pwa/icon-192.png?token=secret", { mode: "cors" }), undefined);
});

test("activation removes only old Waydidi caches and claims clients", async () => {
  const w = worker();
  w.storage.set("waydidi-pwa-old", new Map());
  w.storage.set("driver-offline-queue", new Map());
  await w.lifecycle("install");
  await w.lifecycle("activate");
  assert.equal(w.storage.has("waydidi-pwa-old"), false);
  assert.equal(w.storage.has("driver-offline-queue"), true);
  assert.equal(w.storage.has("waydidi-pwa-v1"), true);
  assert.equal(w.claimed(), true);
});

test("offline kit assets can load without a network", async () => {
  const w = worker(async () => { throw new TypeError("offline"); });
  await w.lifecycle("install");
  assert.equal(await (await w.request("/pwa/icon-192.png", { mode: "cors" })).text(), "/pwa/icon-192.png");
});

test("missing offline kit returns a readable 503 instead of broken application HTML", async () => {
  const w = worker(async () => { throw new TypeError("offline"); });
  const result = await w.request("/booking/manage");
  assert.equal(result.status, 503);
  assert.match(await result.text(), /offline/);
});
