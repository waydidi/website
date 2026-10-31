import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const bundled = await build({stdin:{contents:`import { localizePublicHtml } from './lib/language-html'; export default {async fetch(){return localizePublicHtml(new Response('<html lang="en"><head><title>Private transfer</title><link rel="canonical" href="https://waydidi.com/about"></head><body><h1>Private transfer</h1><code>Private transfer</code><a href="/destinations">Places</a><a href="/account">Account</a></body></html>',{headers:{'content-type':'text/html'}}),{lang:'th',path:'/about',origin:'https://waydidi.com'},async()=>new Map([['Private transfer','รถรับส่ง']]))}}`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf = new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15'});
after(()=>mf.dispose());
test('crawler HTML uses cached translations, excludes protected text, and has localized SEO and links',async()=>{
 const res=await mf.dispatchFetch('https://waydidi.com/th/about');const html=await res.text();
 assert.match(html,/<html lang="th"/);assert.match(html,/<h1>รถรับส่ง<\/h1>/);assert.match(html,/<code>Private transfer<\/code>/);
 assert.match(html,/rel="canonical" href="https:\/\/waydidi.com\/th\/about"/);
 assert.match(html,/hreflang="x-default"/);assert.equal((html.match(/hreflang=/g)||[]).length,13);
 assert.match(html,/href="\/th\/destinations"/);assert.match(html,/href="\/account"/);
});
