// Display currencies. Bookings are always priced and charged in THB; other
// currencies are an approximate conversion for the customer's convenience.
export const DISPLAY_CURRENCIES = ["THB", "USD", "AUD", "SGD", "CNY"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
export type Rates = Record<DisplayCurrency, number>;

export const CURRENCY_COOKIE = "waydidi_currency";
export const CURRENCY_EVENT = "waydidi:currency";

// Units of each currency per 1 THB; used only when live rates are unavailable.
export const FALLBACK_RATES: Rates = { THB: 1, USD: 0.0305, AUD: 0.0465, SGD: 0.0395, CNY: 0.218 };

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === "string" && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

export function sanitizeRates(input: unknown): Rates {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rates = { ...FALLBACK_RATES };
  for (const code of DISPLAY_CURRENCIES) {
    const value = source[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) rates[code] = value;
  }
  rates.THB = 1;
  return rates;
}

export function formatMoney(thb: number, currency: DisplayCurrency = "THB", rates: Rates = FALLBACK_RATES) {
  if (currency === "THB") return `THB ${Math.round(thb).toLocaleString("en-US")}`;
  const value = thb * (rates[currency] ?? FALLBACK_RATES[currency]);
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
