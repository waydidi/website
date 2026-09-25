/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runOperationsAutomation } from "../lib/operations-automation";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
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
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // Public blog pages are cached at the edge for 5 minutes (saving a post in admin clears them).
    const blogPage = request.method === "GET" && /^\/(th\/|zh\/)?blog(\/|$)/.test(url.pathname) && !url.searchParams.has("preview");
    const edgeCache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
    if (blogPage && edgeCache) {
      const hit = await edgeCache.match(url.toString()).catch(() => undefined);
      if (hit) return withSecurityHeaders(hit, url);
    }
    const response = await handler.fetch(request, env, ctx);
    if (blogPage && edgeCache && response.status === 200) {
      const copy = new Response(response.clone().body, response);
      copy.headers.set("Cache-Control", "public, max-age=0, s-maxage=300");
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
