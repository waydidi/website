// Runs Non's 100 planned questions against the real model, with fake price tools, and writes a
// report to read through by hand. Costs real API money (~100 short requests).
//   ANTHROPIC_API_KEY=... node scripts/cee-eval.mjs [first-n]
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
if (!process.env.ANTHROPIC_API_KEY) { console.error('Set ANTHROPIC_API_KEY'); process.exit(1); }
const root = fileURLToPath(new URL('..', import.meta.url));
globalThis.__ceeEval = { env: {} };
const vite = await createServer({ root, configFile: false, appType: 'custom', resolve: { alias: { '@': root } }, server: { middlewareMode: true },
  plugins: [{ name: 'env', enforce: 'pre', resolveId: (id) => (id === 'cloudflare:workers' ? '\0env' : undefined), load: (id) => (id === '\0env' ? 'export const env=globalThis.__ceeEval.env' : undefined) }] });
const { ceeTurn } = await vite.ssrLoadModule('/lib/cee/bot.ts');
const questions = JSON.parse(await readFile(root + 'tests/fixtures/cee-questions.json', 'utf8')).slice(0, Number(process.argv[2]) || 100);
const car = (vehicle, name, seats, bags, price) => ({ vehicle, name, seats, bags, price, bookUrl: `https://waydidi.com/?rebook=chat&vehicle=${vehicle}` });
const log = [];
const tools = {
  searchKnowledge: async (q, city) => { log.push(['search_knowledge', { q, city }]); return { notes: [], places: [] }; },
  quoteTransfer: async (i) => { log.push(['quote_transfer', i]); return { ok: true, kind: 'transfer', summary: `${i.pickup} → ${i.dropoff}`, cars: [car('economy_sedan', 'Economy sedan', 2, 2, 1500), car('comfort_suv', 'Comfort SUV', 4, 4, 2100), car('premium_minivan', 'Premium minivan', 10, 8, 2600)].filter((c) => c.seats >= i.passengers && c.bags >= i.bags), notes: ['Private car, price per car.'] }; },
  quoteHourly: async (i) => { log.push(['quote_hourly', i]); return { ok: true, kind: 'hourly', summary: `${i.city} ${i.hours}h`, cars: [car('comfort_suv', 'Comfort SUV', 4, 4, 600 * i.hours)], notes: ['Minimum 3 hours.'] }; },
  findPackages: async (city) => { log.push(['find_packages', city]); return [{ name: `${city} highlights day trip`, kind: 'day', fromPrice: 2900, url: `https://waydidi.com/trips/${city}-highlights` }]; },
};
const client = new Anthropic();
let md = '', totalUsd = 0, totalMs = 0;
for (const q of questions) {
  log.length = 0;
  const t0 = Date.now();
  let out; try { out = await ceeTurn([{ sender: 'visitor', body: q.message }], client, { tools, mode: process.env.CEE_MODE || 'fast' }); } catch (e) { out = { reply: `ERROR ${e.message}`, handover: null }; }
  const ms = Date.now() - t0; totalMs += ms; totalUsd += out.usd ?? 0;
  md += `## ${q.n}. ${q.group}: ${q.message}\nExpected: ${q.expect}\n\n${out.model ?? ''} · ${(ms / 1000).toFixed(1)} s · $${(out.usd ?? 0).toFixed(4)}\nTools: ${log.map(([n, i]) => `${n}(${JSON.stringify(i)})`).join(', ') || 'none'}${out.handover ? `\nHandover: ${out.handover.reason}` : ''}\n\n> ${(out.reply ?? '(no reply)').replace(/\n/g, '\n> ')}\n\n`;
  process.stdout.write('.');
}
md = `# Non eval\n\n${questions.length} questions · average ${(totalMs / questions.length / 1000).toFixed(1)} s · total $${totalUsd.toFixed(3)} (about ${totalUsd ? Math.round(questions.length / totalUsd) : '∞'} replies per $1)\n\n` + md;
await writeFile(root + 'cee-eval-report.md', md);
console.log('\nWrote cee-eval-report.md');
await vite.close();
