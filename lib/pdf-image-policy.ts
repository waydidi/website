// Which photos the itinerary PDF may download on the server, and how much of them. Pure (no runtime imports) so it is
// unit tested directly; lib/trip-pdf.ts does the fetching. Photo links come from staff and attraction data, so they
// are untrusted: only our own site and the photo hosts the page's CSP already shows (worker/index.ts img-src) are
// fetched, every redirect is checked again, and bytes and pixels are capped before pdf-lib decodes anything.

export const PDF_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PDF_IMAGE_MAX_PIXELS = 40_000_000;
export const PDF_IMAGE_MAX_REDIRECTS = 3;
/** Photo pages per PDF file; later places still get their page, without a photo. */
export const PDF_IMAGE_MAX_PER_FILE = 30;

const EXACT_HOSTS = new Set(["maps.googleapis.com", "maps.gstatic.com", "upload.wikimedia.org"]);
const SUFFIX_HOSTS = [".googleusercontent.com"];

const ipLiteral = (host: string) => host.startsWith("[") || /^[\d.]+$/.test(host) || /^0x/i.test(host);

/**
 * The URL to download for a stored photo link, or null when it may not be fetched: a site-relative path on our own
 * origin, or https on our own host or an approved photo host. No credentials, ports or IP addresses.
 */
export function pdfImageUrl(raw: string | null | undefined, origin: string): URL | null {
  const value = raw?.trim();
  if (!value || value.length > 2000 || /[\\\s]/.test(value)) return null;
  let site: URL, url: URL;
  try { site = new URL(origin); url = new URL(value, site); } catch { return null; }
  if (value.startsWith("/")) return !value.startsWith("//") && url.origin === site.origin ? url : null;
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (ipLiteral(host)) return null;
  if (host === site.hostname.toLowerCase() || EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s) && host.length > s.length)) return url;
  return null;
}

/** JPEG or PNG and its size, read from the header; null for anything else or a header that can't be read. */
export function imageHeader(bytes: Uint8Array): { type: "jpg" | "png"; width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    // Start-of-frame markers (not DHT 0xC4, JPG 0xC8 or DAC 0xCC) carry the height and width.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { type: "jpg", height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

/** True when the image is small enough to decode into a PDF page. */
export const imageWithinLimits = (h: { width: number; height: number }) => h.width > 0 && h.height > 0 && h.width * h.height <= PDF_IMAGE_MAX_PIXELS;

/** Reads a response body up to `max` bytes; null (and the stream cancelled) as soon as it is larger. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max = PDF_IMAGE_MAX_BYTES): Promise<Uint8Array | null> {
  if (!body) return null;
  const reader = body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}
