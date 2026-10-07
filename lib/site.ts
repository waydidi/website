// The single public origin used by pages, confirmation links and integrations.
export const SITE_URL = "https://waydidi.com";
/** Alternate public hostnames redirect page visits to the single live site. */
export const LEGACY_HOSTS = ["www.waydidi.com", "waydidi-website.contact-waydidi.workers.dev"];

/** Normalize historical production settings while keeping explicit preview origins usable. */
export function publicSiteUrl(configured?: string) {
  if (!configured) return SITE_URL;
  try {
    const url = new URL(configured);
    return [new URL(SITE_URL).hostname, ...LEGACY_HOSTS].includes(url.hostname) ? SITE_URL : url.origin;
  } catch { return SITE_URL; }
}
