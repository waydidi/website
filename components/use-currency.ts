"use client";

import { useCallback, useEffect, useState } from "react";
import { CURRENCY_COOKIE, CURRENCY_EVENT, FALLBACK_RATES, formatMoney, isDisplayCurrency, sanitizeRates, type DisplayCurrency, type Rates } from "@/lib/currency";

let ratesPromise: Promise<Rates> | null = null;
function loadRates() {
  ratesPromise ??= fetch("/api/exchange-rates").then((r) => r.json()).then((b: { rates?: unknown }) => sanitizeRates(b.rates)).catch(() => FALLBACK_RATES);
  return ratesPromise;
}

function readCurrency(): DisplayCurrency {
  try {
    const value = document.cookie.split("; ").find((c) => c.startsWith(`${CURRENCY_COOKIE}=`))?.slice(CURRENCY_COOKIE.length + 1);
    return isDisplayCurrency(value) ? value : "THB";
  } catch { return "THB"; }
}

// The currency chosen in the header picker, with a formatter for THB amounts.
export function useCurrency() {
  const [currency, setCurrency] = useState<DisplayCurrency>("THB");
  const [rates, setRates] = useState<Rates>(FALLBACK_RATES);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrency(readCurrency());
    const onChange = () => setCurrency(readCurrency());
    window.addEventListener(CURRENCY_EVENT, onChange);
    let alive = true;
    loadRates().then((r) => alive && setRates(r));
    return () => { alive = false; window.removeEventListener(CURRENCY_EVENT, onChange); };
  }, []);
  const money = useCallback((thb: number) => formatMoney(thb, currency, rates), [currency, rates]);
  return { currency, money, thb: (value: number) => formatMoney(value, "THB") };
}
