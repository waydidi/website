import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Attributes and meta content hold entity-encoded text, like text nodes. Lookups must use the decoded
// string (the catalog key), and the translation must be written back encoded exactly once.
// Keys must be approved repository copy (lib/site-translation-sources.json).
const page = '<html><head><title>T</title><meta name="description" content="Bangkok &amp; Central"></head><body>'
 + '<img alt="Bangkok &amp; Central" src="/a.jpg"><a href="/x" title="Couldn&apos;t save.">x</a><button aria-label="Couldn&#39;t load.">y</button>'
 + '<input placeholder="Bangkok &#x26; Central"><img alt="Uncached &amp; original" src="/b.jpg"></body></html>';
const catalog = {'Bangkok & Central':'กรุงเทพฯ & "ภาคกลาง"', "Couldn't save.":'บันทึกไม่ได้ <b>', "Couldn't load.":'โหลดไม่ได้'};
const bundled = await build({stdin:{contents:`import { localizePublicHtml } from './lib/language-html'; const catalog=${JSON.stringify(catalog)};
export default {async fetch(req){return localizePublicHtml(new Response(${JSON.stringify(page)},{headers:{'content-type':'text/html'}}),{lang:new URL(req.url).searchParams.get('lang'),path:'/about',origin:'https://waydidi.com'},async(_lang,texts)=>new Map(texts.filter(t=>t in catalog).map(t=>[t,catalog[t]])))}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf = new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15'});
after(()=>mf.dispose());
const get = async lang => (await mf.dispatchFetch('https://waydidi.com/?lang='+lang)).text();
// What a browser would read back from a double-quoted attribute.
const decode = s => s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e.toLowerCase()]);
const attr = (html, re) => { const m = html.match(re); assert.ok(m, `missing ${re}`); return decode(m[1]); };

test('attribute and meta values with entities are looked up decoded and written back encoded once', async () => {
 const html = await get('th');
 assert.equal(attr(html, /<img alt="([^"]*)" src="\/a.jpg"/), 'กรุงเทพฯ & "ภาคกลาง"');
 assert.equal(attr(html, /<a href="\/th\/x" title="([^"]*)"/), 'บันทึกไม่ได้ <b>');
 assert.equal(attr(html, /<button aria-label="([^"]*)"/), 'โหลดไม่ได้');
 assert.equal(attr(html, /<input placeholder="([^"]*)"/), 'กรุงเทพฯ & "ภาคกลาง"');
 assert.equal(attr(html, /<meta name="description" content="([^"]*)"/), 'กรุงเทพฯ & "ภาคกลาง"');
 assert.doesNotMatch(html, /&amp;amp;|&amp;quot;/);
 // Written back fully encoded, so a translation such as "R&amp;D" cannot be misread as an entity.
 assert.ok(html.includes('<img alt="กรุงเทพฯ &amp; &quot;ภาคกลาง&quot;" src="/a.jpg">'));
 assert.ok(html.includes('title="บันทึกไม่ได้ &lt;b&gt;"'));
});
for (const lang of ['th','en']) test(`untranslated attribute values stay byte-for-byte unchanged (${lang})`, async () => {
 const html = await get(lang);
 assert.ok(html.includes('<img alt="Uncached &amp; original" src="/b.jpg">'));
 if (lang === 'en') assert.ok(html.includes('<img alt="Bangkok &amp; Central" src="/a.jpg">'));
});
