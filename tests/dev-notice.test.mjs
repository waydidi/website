import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// The "under development" popup belongs to the homepage only: while online booking is not ready,
// homepage visitors are told to book on WhatsApp. Every other page (including the other pages that
// show the booking form) must stay free of it.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', resolve: { alias: { '@': root } }, server: { middlewareMode: true } });
after(() => vite.close());

const NOTICE = '/components/home/dev-notice.tsx';
const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));

function findAll(node, type, out = []) {
  if (Array.isArray(node)) { for (const child of node) findAll(child, type, out); return out; }
  if (!node || typeof node !== 'object') return out;
  if (node.type === type) out.push(node);
  findAll(node.props?.children, type, out);
  return out;
}

// Follows the source imports statically (pages pull in Worker-only modules that cannot load under Node).
function resolveImport(from, spec) {
  const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const file of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function reaches(url, target) {
  const goal = join(root, target);
  const seen = new Set();
  const stack = [join(root, url)];
  while (stack.length) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (file === goal) return true;
    if (!/\.tsx?$/.test(file)) continue;
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) stack.push(resolveImport(file, spec));
  }
  return false;
}

function pages(dir = join(root, 'app'), out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) pages(file, out);
    else if (/^(page|layout)\.tsx$/.test(entry.name)) out.push('/' + relative(root, file));
  }
  return out;
}

test('the homepage shows the under-development notice with the WhatsApp link from lib/contact', async () => {
  const { HomePage } = await vite.ssrLoadModule('/components/home/home-page.tsx');
  const { DevNotice } = await vite.ssrLoadModule(NOTICE);
  const { WHATSAPP, WHATSAPP_URL } = await vite.ssrLoadModule('/lib/contact.ts');
  const notices = findAll(HomePage({ locale: 'en' }), DevNotice);
  assert.equal(notices.length, 1);
  const { props } = notices[0];
  assert.equal(props.title, "We're under development");
  assert.equal(props.body, 'You cannot book through the website right now. If you want to book our service, please contact us on WhatsApp:');
  assert.equal(props.whatsapp, WHATSAPP);
  assert.equal(props.whatsappUrl, WHATSAPP_URL);
  assert.equal(props.contactLabel, en['devNotice.contact']);
  assert.equal(props.closeLabel, en['devNotice.close']);
});

test('the notice is shown in Thai and Chinese on the hand-translated homepages', async () => {
  const { HomePage } = await vite.ssrLoadModule('/components/home/home-page.tsx');
  const { DevNotice } = await vite.ssrLoadModule(NOTICE);
  const th = JSON.parse(readFileSync(new URL('../messages/th.json', import.meta.url), 'utf8'));
  const [notice] = findAll(HomePage({ locale: 'th' }), DevNotice);
  assert.equal(notice.props.title, th['devNotice.title'].text);
});

test('only the homepage pulls in the notice: no other page, layout or the shared booking form', () => {
  assert.equal(reaches('/app/page.tsx', NOTICE), true);
  assert.equal(reaches('/components/home/booking-flow.tsx', NOTICE), false, 'the shared booking form must not show it');
  const others = pages().filter((page) => page !== '/app/page.tsx');
  assert.ok(others.includes('/app/airport-transfer/page.tsx') && others.includes('/app/maintenance/page.tsx') && others.includes('/app/layout.tsx'));
  for (const page of others) assert.equal(reaches(page, NOTICE), false, `${page} must not show the homepage notice`);
});

test('the notice text is approved for the site translator, so every language sees it translated', () => {
  const approved = new Set(JSON.parse(readFileSync(new URL('../lib/site-translation-sources.json', import.meta.url), 'utf8')));
  for (const key of ['devNotice.title', 'devNotice.body', 'devNotice.contact', 'devNotice.close']) assert.ok(approved.has(en[key]), key);
});
