import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.__pricingPromoCalls = [];
const vite = await createServer({ root, configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true }, resolve: { alias: { '@': root } }, server: { middlewareMode: true }, plugins: [{
  name: 'pricing-promo-boundaries', enforce: 'pre',
  resolveId(id) {
    if (id === 'cloudflare:workers') return '\0promo-env';
    if (id.endsWith('/lib/customer-auth')) return '\0promo-auth';
    if (id.endsWith('/lib/promo-db')) return '\0promo-db';
    if (id.endsWith('/lib/affiliates')) return '\0promo-affiliates';
  },
  load(id) {
    if (id === '\0promo-env') return 'export const env={}';
    if (id === '\0promo-auth') return 'export async function overRateLimit(){return false} export async function currentCustomer(){return {id:"test"}} export async function customerFromRequest(){return {customer:{id:"test",email:"test@example.invalid"}}}';
    if (id === '\0promo-affiliates') return 'export async function affiliateByCode(){return null} export function affiliateDiscount(){throw Error("unexpected affiliate")} export function isSelfReferral(){return false}';
    // Isolate storage/auth only. Real route schemas and real promo math run.
    if (id === '\0promo-db') return `import {discountFor} from ${JSON.stringify(root + '/lib/promo.ts')};
      const promo={discountType:"percent",discountValue:10,minTotal:0,maxDiscount:null};
      export async function checkPromo(input){globalThis.__pricingPromoCalls.push(input);const discount=discountFor(promo,input.total);return {ok:true,discount,finalTotal:input.total-discount}}
      export async function bestCoupon(input){const result=await checkPromo(input);return {code:"SAVE10",title:"Test",discount:result.discount}}`;
  },
}] });
after(async () => { await vite.close(); delete globalThis.__pricingPromoCalls; });
const check = await vite.ssrLoadModule('/app/api/promo/check/route.ts');
const best = await vite.ssrLoadModule('/app/api/promo/best/route.ts');
const rules = await vite.ssrLoadModule('/lib/cancellation-options.ts');
const promo = await vite.ssrLoadModule('/lib/promo.ts');
const config = rules.cancellationConfig({ CANCELLATION_OPTIONS: '1' });
const request = (body, origin = 'https://example.invalid') => new Request('https://example.invalid/api/promo/check', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'SAVE10', serviceType: 'transfer', vehicle: 'economy_sedan', ...body }) });

test('promo and wallet routes accept option-adjusted integer satang without rounding the fare', async () => {
  for (const option of ['standard', 'non_refundable', 'flexible']) {
    const totalMinor = rules.cancellationFareMinor(129000, option, config);
    const expected = promo.discountFor({ discountType: 'percent', discountValue: 10, minTotal: 0, maxDiscount: null }, totalMinor / 100);
    for (const route of [check, best]) {
      const response = await route.POST(request({ totalMinor }));
      assert.equal(response.status, 200, option);
      const body = await response.json();
      assert.equal(body.best?.discount ?? body.discount, expected);
      assert.equal(globalThis.__pricingPromoCalls.at(-1).total, totalMinor / 100);
    }
  }
});

test('promo preview preserves existing amount, origin and input guards', async () => {
  for (const route of [check, best]) {
    assert.equal((await route.POST(request({ total: 1290 }))).status, 200);
    for (const amount of [{}, { total: 1225.5 }, { total: 1290, totalMinor: 129000 }, { totalMinor: 122550.5 }, { totalMinor: -1 }, { totalMinor: 99 }, { totalMinor: 1000000001 }, { totalMinor: '122550' }]) {
      const before = globalThis.__pricingPromoCalls.length;
      assert.equal((await route.POST(request(amount))).status, 400, JSON.stringify(amount));
      assert.equal(globalThis.__pricingPromoCalls.length, before);
    }
    assert.equal((await route.POST(request({ totalMinor: 122550 }, 'https://attacker.invalid'))).status, 403);
  }
});

test('both checkout preview callers send the option-adjusted amount in integer satang', async () => {
  const source = await readFile(root + '/components/home/booking-flow.tsx', 'utf8');
  assert.equal([...source.matchAll(/body: JSON\.stringify\(\{ (?:code, )?totalMinor: Math\.round\(optionFare \* 100\),/g)].length, 2);
});
