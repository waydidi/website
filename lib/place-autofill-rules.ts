// Admin → Attractions "Fill from Google Maps" and "Find free photos": reading what Google and Wikimedia Commons send
// into checked values. Pure (no runtime imports) so it is unit tested directly. Photos are only offered when their
// licence lets Waydidi store and reuse them without showing a credit to customers: public domain and CC0 (owner's choice;
// CC BY / CC BY-SA would need the credit on every customer page). Anything else is left out. The source is still noted
// in the place's internal Photo credit / licence field.

export type FreePhoto = { title: string; thumb: string; url: string; width: number; height: number; licence: string; author: string; credit: string; page: string };

type CommonsPage = { title?: string; imageinfo?: { url?: string; thumburl?: string; thumbwidth?: number; thumbheight?: number; width?: number; height?: number; mime?: string; descriptionurl?: string;
  extmetadata?: Record<string, { value?: unknown } | undefined> }[] };

const FREE = /^(public domain|pd\b|cc0)/i;
const IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Only https files on Wikimedia's own image server may be downloaded (nothing else, so the import cannot fetch other sites). */
export function isCommonsFileUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "upload.wikimedia.org" && u.pathname.startsWith("/wikipedia/commons/") && !u.username && !u.password && !u.port;
  } catch { return false; }
}

/** Plain text from Commons' HTML metadata (author names often come as links). */
export const plainText = (value: unknown) => (typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "");

/** Where the photo came from, kept with the place (not shown to customers), e.g. "Photo: Jane Doe, CC0, Wikimedia Commons". */
export const photoCredit = (author: string, licence: string) => `Photo: ${author || "unknown author"}, ${licence}, Wikimedia Commons`;

/**
 * The usable photos in a Commons API answer (prop=imageinfo with url, size, mime and extmetadata): public domain or
 * CC0, JPEG/PNG/WebP, at least 800 px wide, from Wikimedia's image server. Largest first, at most `max`.
 */
export function commonsPhotos(answer: unknown, max = 24): FreePhoto[] {
  const pages = Object.values(((answer as { query?: { pages?: Record<string, CommonsPage> } })?.query?.pages) ?? {});
  const out: FreePhoto[] = [];
  for (const p of pages) {
    const info = p?.imageinfo?.[0];
    if (!info || typeof p.title !== "string") continue;
    const licence = plainText(info.extmetadata?.LicenseShortName?.value);
    // The 1600 px copy is what gets stored; the picker shows a 400 px one of the same file.
    const url = info.thumburl ?? info.url ?? "", thumb = url.replace(/\/1600px-/, "/400px-");
    if (!FREE.test(licence) || !IMAGE.has(info.mime ?? "") || (info.width ?? 0) < 800 || !isCommonsFileUrl(url)) continue;
    const author = plainText(info.extmetadata?.Artist?.value).slice(0, 120);
    out.push({ title: p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, ""), thumb, url, width: info.thumbwidth ?? info.width ?? 0, height: info.thumbheight ?? info.height ?? 0,
      licence, author, credit: photoCredit(author, licence), page: typeof info.descriptionurl === "string" && info.descriptionurl.startsWith("https://commons.wikimedia.org/") ? info.descriptionurl : "" });
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, max);
}

/** Adds new credits to the place's credit line once each, keeping what staff already wrote. Max 1500 characters (the field's limit). */
export function mergeCredits(existing: string | null, added: string[]): string {
  const parts = (existing ?? "").split(/\s*;\s*/).filter(Boolean);
  for (const c of added) if (!parts.includes(c)) parts.push(c);
  return parts.join("; ").slice(0, 1500);
}
