// Google Maps links an admin pastes in Telegram for a booking's pickup or drop-off. Only Google Maps
// addresses are accepted (share links and map/place/directions pages), so a driver never gets sent
// to another site.

const MAPS_HOSTS = /^(maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+|g\.co)$/i;

/** The first Google Maps link in the text, or null. */
export function googleMapsLink(text: string): string | null {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    let url: URL;
    try { url = new URL(match[0].replace(/[).,]+$/, "")); } catch { continue; }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (!MAPS_HOSTS.test(url.hostname)) continue;
    const host = url.hostname.toLowerCase();
    const isMaps = host === "maps.app.goo.gl" || host.startsWith("maps.google.")
      || (host === "goo.gl" && url.pathname.startsWith("/maps"))
      || (host === "g.co" && url.pathname.startsWith("/kgs"))
      || (/^(www\.)?google\./.test(host) && url.pathname.startsWith("/maps"));
    if (!isMaps) continue;
    url.protocol = "https:";
    return url.toString().slice(0, 500);
  }
  return null;
}

/** Directions to an address in Google Maps (used when no link was set). */
export const directionsTo = (place: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;
