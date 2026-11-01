import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';

// Pages per test case: `head` is the page's own <head> content, `headers` its response headers.
const pages = {
 noindex: {path:'/agencies/register', head:'<meta name="robots" content="noindex, nofollow"><link rel="canonical" href="https://waydidi.com/agencies">'},
 noindexHeader: {path:'/about', head:'', headers:{'x-robots-tag':'noindex'}},
 self: {path:'/about', head:'<link rel="canonical" href="https://waydidi.com/about"><link rel="alternate" hreflang="th" href="https://waydidi.com/old">'},
 elsewhere: {path:'/blog/category/news', head:'<link rel="canonical" href="https://waydidi.com/blog">'},
 none: {path:'/flights', head:''},
 external: {path:'/about', head:'<link rel="canonical" href="https://partner.example/about">'},
};
const bundled = await build({stdin:{contents:`import { localizePublicHtml } from './lib/language-html'; const pages=${JSON.stringify(pages)};
export default {async fetch(req){const u=new URL(req.url);const p=pages[u.searchParams.get('case')];
 return localizePublicHtml(new Response('<html><head><title>T</title>'+p.head+'</head><body><p>x</p></body></html>',{headers:{'content-type':'text/html',...(p.headers||{})}}),{lang:u.searchParams.get('lang'),path:p.path,origin:'https://waydidi.com'},async()=>new Map())}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf = new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15'});
after(()=>mf.dispose());
const get = async (c, lang='th') => (await mf.dispatchFetch(`https://waydidi.com/?case=${c}&lang=${lang}`)).text();
const canonicals = html => [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m=>m[1]);
const alternates = html => Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m=>[m[1],m[2]]));

for (const c of ['noindex','noindexHeader']) for (const lang of ['th','en']) test(`a noindex page emits no canonical or hreflang alternates (${c}, ${lang})`, async () => {
 const html = await get(c, lang);
 assert.deepEqual(canonicals(html), []);
 assert.equal((html.match(/hreflang=/g)||[]).length, 0);
});
test('a public page has exactly one self canonical matching its language prefix and hreflang set', async () => {
 const html = await get('self');
 assert.deepEqual(canonicals(html), ['https://waydidi.com/th/about']);
 const alt = alternates(html);
 assert.equal(alt.th, 'https://waydidi.com/th/about');
 assert.equal(alt.en, 'https://waydidi.com/about');
 assert.equal(alt['x-default'], 'https://waydidi.com/about');
 assert.equal(Object.keys(alt).length, 13);
 assert.deepEqual(canonicals(await get('none')), ['https://waydidi.com/th/flights']);
});
test('a page-supplied canonical pointing elsewhere is kept, localized, with matching alternates', async () => {
 const html = await get('elsewhere');
 assert.deepEqual(canonicals(html), ['https://waydidi.com/th/blog']);
 assert.equal(alternates(html).en, 'https://waydidi.com/blog');
 const external = await get('external');
 assert.deepEqual(canonicals(external), ['https://partner.example/about']);
 assert.equal((external.match(/hreflang=/g)||[]).length, 0);
});

// Sitemap: no URL may resolve to a page that declares robots noindex.
const vite = await createServer({configFile:false, appType:'custom', resolve:{alias:{'@':process.cwd()}}, server:{middlewareMode:true}});
after(() => vite.close());
const { sitemapEntries } = await vite.ssrLoadModule('/lib/sitemap-entries.ts');
const pageFile = async segments => {
 // Resolve a URL path to its app/ page the way the App Router does: static segment first, then [param].
 let dir = 'app';
 for (const s of segments) {
  if (existsSync(`${dir}/${s}`)) { dir += '/' + s; continue; }
  const { readdirSync } = await import('node:fs');
  const dyn = readdirSync(dir).find(d => /^\[[^.]+\]$/.test(d));
  if (!dyn) return null;
  dir += '/' + dyn;
 }
 return existsSync(`${dir}/page.tsx`) ? `${dir}/page.tsx` : null;
};
test('the sitemap lists no noindex page, in any language', async () => {
 const { publicPages, destinations } = await vite.ssrLoadModule('/lib/public-content.ts');
 const { SITE_LANGS } = await vite.ssrLoadModule('/lib/site-languages.ts');
 const prefix = new RegExp(`^/(${SITE_LANGS.map(l=>l.code).join('|')})(?=/|$)`);
 const entries = sitemapEntries({siteUrl:'https://waydidi.com', languageUrls:true, transferSlugs:['bkk-airport-to-bangkok'],
  pageSlugs:publicPages.map(p=>p.slug), destinationSlugs:destinations.map(d=>d.slug),
  posts:[{slug:'p',date:'2026-01-01',categories:['News']}], packages:[{slug:'k',updatedAt:'2026-01-01'}], categorySlug:c=>c.toLowerCase()});
 assert.ok(entries.length > 50);
 for (const { url } of entries) {
  const path = new URL(url).pathname.replace(prefix, '') || '/';
  const file = await pageFile(path.split('/').filter(Boolean));
  assert.ok(file, `no page for ${url}`);
  assert.doesNotMatch(await readFile(file, 'utf8'), /index:\s*false/, `${url} (${file}) is noindex but in the sitemap`);
 }
});
