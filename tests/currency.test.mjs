import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const currency = await vite.ssrLoadModule("/lib/currency.ts");

test("THB amounts are shown whole and other currencies with two decimals", () => {
  assert.equal(currency.formatMoney(1450, "THB"), "THB 1,450");
  assert.equal(currency.formatMoney(1000, "USD", { ...currency.FALLBACK_RATES, USD: 0.03 }), "USD 30.00");
});

test("bad or missing rates fall back and THB stays 1", () => {
  const rates = currency.sanitizeRates({ USD: -1, AUD: "x", SGD: 0.04, THB: 9 });
  assert.equal(rates.USD, currency.FALLBACK_RATES.USD);
  assert.equal(rates.SGD, 0.04);
  assert.equal(rates.THB, 1);
  assert.equal(currency.isDisplayCurrency("EUR"), false);
});
