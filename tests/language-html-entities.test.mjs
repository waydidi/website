import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const page = `<html><head><title>Private transfer</title></head><body><p>Don&#x27;t miss Tom &amp; Jerry</p><p>Meet &amp; Greet</p><p>${'Uncached &amp; original. '.repeat(4000)}</p></body></html>`;
const bundled = await build({stdin:{contents:`import { localizePublicHtml } from './lib/language-html'; export default {async fetch(req){return localizePublicHtml(new Response(${JSON.stringify(page)},{headers:{'content-type':'text/html'}}),{lang:new URL(req.url).searchParams.get('lang'),path:'/about',origin:'https://waydidi.com'},async(_lang,texts)=>{if(!texts.includes('Meet & Greet'))throw Error('lookup text was not decoded');return new Map([['Meet & Greet','A & B <script>alert(1)</script>']]);})}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf = new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15'});
after(()=>mf.dispose());
for (const lang of ['en','th']) test(`untranslated entity text and streamed cache misses stay byte-for-byte unchanged (${lang})`,async()=>{
 const html=await (await mf.dispatchFetch('https://waydidi.com/?lang='+lang)).text();
 assert.ok(html.includes('<p>Don&#x27;t miss Tom &amp; Jerry</p>'));
 assert.ok(html.includes(`<p>${'Uncached &amp; original. '.repeat(4000)}</p>`));
});
test('decoded entity text matches cache keys and untrusted translations are escaped once',async()=>{
 const html=await (await mf.dispatchFetch('https://waydidi.com/?lang=th')).text();
 assert.ok(html.includes('<p>A &amp; B &lt;script&gt;alert(1)&lt;/script&gt;</p>'));
 assert.ok(!html.includes('<p>A & B <script>'));
});
