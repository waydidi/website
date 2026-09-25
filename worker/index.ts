/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runOperationsAutomation } from "../lib/operations-automation";

interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  DB: unknown; // D1 binding; queries go through getDb() in db/index.ts
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      // Without the ASSETS binding (not set on this deployment) the optimizer can't read
      // files, so send the browser to the original image instead of failing with a 500.
      if (!env.ASSETS) {
        const src = (url.searchParams.get("url") ?? "").replaceAll("\\", "/");
        if (!src.startsWith("/") || src.startsWith("//")) return new Response("Bad image URL", { status: 400 });
        return Response.redirect(new URL(src, url.origin).toString(), 302);
      }
      const assets = env.ASSETS;
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => assets.fetch(new Request(new URL(path, request.url))),
        transformImage: env.IMAGES ? async (body, { width, format, quality }) => {
          const result = await env.IMAGES!.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        } : undefined,
      }, allowedWidths);
    }

    // Public, same-for-everyone responses are kept at the edge so most visitors never
    // wait for the database: blog pages 5 min (saving a post clears them), public
    // data feeds 1–5 min.
    const ttl = request.method === "GET" ? edgeTtl(url) : 0;
    const edgeCache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
    if (ttl && edgeCache) {
      const hit = await edgeCache.match(url.toString()).catch(() => undefined);
      if (hit) return withSecurityHeaders(hit, url);
    }
    const response = await handler.fetch(request, env, ctx);
    if (ttl && edgeCache && response.status === 200 && !response.headers.has("Set-Cookie")) {
      const copy = new Response(response.clone().body, response);
      copy.headers.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
      ctx.waitUntil(edgeCache.put(url.toString(), copy).catch(() => undefined));
    }
    return withSecurityHeaders(response, url);
  },
  async scheduled(controller: { scheduledTime: number }, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runOperationsAutomation(new Date(controller.scheduledTime)));
  },
};

function withSecurityHeaders(response: Response, url: URL) {
    const secured = new Response(response.body, response);
    // The workers.dev preview address must not compete with the real domain in search.
    if (url.hostname.endsWith(".workers.dev")) secured.headers.set("X-Robots-Tag", "noindex, nofollow");
    secured.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    secured.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
    secured.headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org https://maps.gstatic.com https://maps.googleapis.com https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://maps.googleapis.com https://maps.gstatic.com; connect-src 'self' https://router.project-osrm.org https://maps.googleapis.com https://*.googleapis.com https://maps.gstatic.com; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com");
    return secured;
}

export default worker;

/** Seconds a public GET response may be served from the edge cache (0 = never). */
function edgeTtl(url: URL) {
  if (/^\/(th\/|zh\/)?blog(\/|$)/.test(url.pathname) && !url.searchParams.has("preview")) return 300;
  if (url.pathname === "/api/promotions") return 60;
  if (url.pathname === "/api/route-inclusions") return 300;
  return 0;
}
