// Which GET responses the Worker keeps in Cloudflare's edge cache, and for how long.
// Only pages whose HTML is the same for every visitor belong here: sign-in state, language
// and currency are applied in the browser after the page loads. A page that reads cookies
// or the customer session on the server (e.g. /help) must never be listed.
// Unit tested in tests/edge-cache.test.mjs.

const PUBLIC_PAGES = /^\/(destinations(\/[a-z0-9-]+)?|about|contact|faq|airport-transfer|a-to-b-transfer|long-journeys|hourly-driver|luggage-policy|airport-pickup-instructions|safety-driver-standards|drivers|agencies|partners|terms|privacy|refund-policy)$/;

/** Seconds a public GET response may be served from the edge cache (0 = never). */
export function edgeTtl(url: URL) {
  if (/^\/(th\/|zh\/)?blog(\/|$)/.test(url.pathname) && !url.searchParams.has("preview")) return 300;
  if (url.pathname === "/api/promotions") return 60;
  if (url.pathname === "/api/route-inclusions") return 300;
  if (url.pathname === "/" || PUBLIC_PAGES.test(url.pathname)) return 300;
  // Tour packages show prices staff edit, so they refresh sooner.
  if (/^\/trips\/[a-z0-9-]{3,80}$/.test(url.pathname)) return 120;
  return 0;
}

const SESSION_COOKIES = ["waydidi_account", "waydidi_admin_session"];

/**
 * Only a signed-out request may fill the cache. Cached pages do not depend on sign-in, but
 * this keeps a future server-rendered "Hi, name" from ever being stored and shown to others.
 */
export function mayFillEdgeCache(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  return !SESSION_COOKIES.some((name) => new RegExp(`(?:^|;\\s*)${name}=[^;]+`).test(cookies));
}
