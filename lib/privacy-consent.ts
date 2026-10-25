export const CONSENT_COOKIE = "waydidi_consent";
export type PrivacyChoices = Record<"functional" | "analytics" | "advertisement", boolean>;

export function parsePrivacyConsent(cookie: string): PrivacyChoices {
  const none = { functional: false, analytics: false, advertisement: false };
  const values = cookie.split(";").map(part => part.trim()).filter(part => part.startsWith(CONSENT_COOKIE + "="));
  if (values.length !== 1) return none;
  try {
    const categories = decodeURIComponent(values[0].slice(CONSENT_COOKIE.length + 1)).split(",");
    if (categories.some(value => !["necessary", "functional", "analytics", "advertisement"].includes(value))) return none;
    return { functional: categories.includes("functional"), analytics: categories.includes("analytics"), advertisement: categories.includes("advertisement") };
  } catch { return none; }
}

export function permitsAnalytics(cookie: string, dnt?: string | null, gpc?: string | boolean | null) {
  return dnt !== "1" && gpc !== "1" && gpc !== true && parsePrivacyConsent(cookie).analytics;
}

// Keep dynamic slugs, account links, booking references and queries out of analytics.
export function publicAnalyticsPath(pathname: string) {
  const paths = ["/", "/about", "/contact", "/destinations", "/blog", "/tours", "/hourly", "/privacy", "/terms", "/refund-policy"];
  return paths.includes(pathname) ? pathname : null;
}
