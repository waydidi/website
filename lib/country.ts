// "TH" → "🇹🇭 Thailand". Pure helpers, safe on server and client.
export const countryFlag = (code: string) => code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
export function countryName(code: string) {
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}
export const countryLabel = (code: string | null | undefined) => (code && /^[A-Za-z]{2}$/.test(code) ? `${countryFlag(code)} ${countryName(code)}` : null);
