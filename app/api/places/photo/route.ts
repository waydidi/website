import { env } from "cloudflare:workers";
import { PHOTO_NAME, photoSig } from "@/lib/cee/places";
import { constantTimeEqual } from "@/lib/security";

// Photo for a place card in the chat. Only links Non created (signed) work; the browser caches it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("n") ?? "", sig = url.searchParams.get("s") ?? "";
  if (!PHOTO_NAME.test(name) || !constantTimeEqual(sig, await photoSig(name))) return new Response("Not found", { status: 404 });
  const key = (env as unknown as Record<string, string>).GOOGLE_MAPS_SERVER_KEY;
  if (!key) return new Response("Not found", { status: 404 });
  const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=240&skipHttpRedirect=true&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
  const out = res.ok ? await res.json() as { photoUri?: string } : {};
  if (!out.photoUri?.startsWith("https://")) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: out.photoUri, "Cache-Control": "public, max-age=86400" } });
}
