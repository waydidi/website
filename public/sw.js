/* Only this public offline kit is cached. Pages, APIs, tokens, maps and payment
   requests always use the network; no booking is queued or replayed. Bump the
   version when changing the offline page or its icons. Updates wait until the
   old worker's tabs close, so a checkout/driver session is never auto-reloaded. */
const CACHE_PREFIX = "waydidi-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_PAGE = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_PAGE, "/pwa/icon-192.png", "/pwa/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // RSC/JSON requests must keep their protocol, even if a caller sets navigate.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/") || request.headers.has("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(CACHE_NAME);
        return await cache.match(OFFLINE_PAGE) ?? new Response("You are offline. Reconnect to use Waydidi Travel.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }
  if (!url.search && OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.pathname) ?? fetch(request);
    })());
  }
});
