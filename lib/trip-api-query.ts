// The query for the customer trip API: the leg plus the link's access code. The code also goes with
// each request (not only the cookie the page gets), because some phones (Safari opened from Telegram
// or LINE) don't send that cookie back.
const ACCESS_KEYS = ["token", "key", "share", "ride"] as const;
export function tripApiQuery(pageQuery: string | null) {
  const from = new URLSearchParams(pageQuery ?? ""), to = new URLSearchParams();
  for (const key of ["leg", ...ACCESS_KEYS]) { const value = from.get(key); if (value) to.set(key, value); }
  const text = to.toString();
  return text ? `?${text}` : "";
}
