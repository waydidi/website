import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
// Exercise the real Worker, language delivery, HTMLRewriter and cache. Replace only
// unrelated notification machinery, auth DB lookup and the vinext renderer boundary.
const stubs={
 'vinext/server/image-optimization':`export const DEFAULT_DEVICE_SIZES=[];export const DEFAULT_IMAGE_SIZES=[];export async function handleImageOptimization(){return new Response('image')}`,
 'vinext/server/app-router-entry':`export default {async fetch(request){const path=new URL(request.url).pathname;return new Response('<html lang="en"><head><title>Private transfer</title></head><body><h1>Private transfer</h1><p>'+path+'</p></body></html>',{headers:{'content-type':'text/html'}})}}`,
 '../lib/site-translate':`export async function cachedTranslations(lang){return new Map([['Private transfer',lang==='th'?'รถรับส่ง':'接送']])}`,
 '../lib/staff-security':`export const STAFF_COOKIE='staff';export function readCookie(){return null}export async function staffForToken(){return null}export function allowedStaffRoute(){return false}`,
 '../lib/operations-automation':`export async function runOperationsAutomation(){}`,
 '../lib/cee/bot':`export async function runCee(){}`,
 '../lib/cee/schedule':`export const WAIT_MS=5000;`,
};
const realWorkerModules=new Set(['../lib/worker-db','../lib/admin-gate','../lib/site','../lib/edge-cache','../lib/language-delivery','../lib/language-html','../lib/language-urls','../lib/maintenance-paths']);
const bundled=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers'],plugins:[{name:'worker-test-boundaries',setup(build){build.onResolve({filter:/.*/},args=>{if(args.importer.endsWith('/worker/index.ts')&&args.path.startsWith('../lib/')&&!realWorkerModules.has(args.path)&&!stubs[args.path])stubs[args.path]='export default {}';return stubs[args.path]?{path:args.path,namespace:'test-boundary'}:null;});build.onLoad({filter:/.*/,namespace:'test-boundary'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{PUBLIC_LANGUAGE_URLS:'1'},d1Databases:['DB']});
after(()=>mf.dispose());
const db=await mf.getD1Database('DB');
await db.prepare('CREATE TABLE site_settings(key TEXT PRIMARY KEY,value TEXT)').run();
test('legacy language paths serve 200 HTML without cookie redirects and retain security headers',async()=>{
 for(const [lang,htmlLang] of [['th','th'],['zh','zh-Hans']]){
  const res=await mf.dispatchFetch(`https://waydidi.com/${lang}/about`,{redirect:'manual',headers:{cookie:'waydidi-lang=fr'}});
  assert.equal(res.status,200);assert.equal(res.headers.get('location'),null);
  assert.ok(res.headers.get('content-security-policy'));assert.equal(res.headers.get('x-frame-options'),'DENY');
  const html=await res.text();assert.match(html,new RegExp(`<html lang="${htmlLang}"`));assert.match(html,new RegExp(`rel="canonical" href="https://waydidi.com/${lang}/about"`));
 }
});
test('localized cache entries cannot cross languages or change unprefixed English',async()=>{
 await new Promise(r=>setTimeout(r,150));
 for(const [path,text] of [['/th/about','รถรับส่ง'],['/zh/about','接送'],['/about','Private transfer']]){
  const res=await mf.dispatchFetch('https://waydidi.com'+path,{headers:{cookie:'waydidi-lang=zh'}});
  const html=await res.text();assert.ok(html.includes(`<h1>${text}</h1>`));
 }
});
test('private and unknown prefixes fail closed before reaching the renderer',async()=>{
 for(const path of ['/th/api/fare-quote','/zh/admin','/th/quote/token','/fr/marketing/token','/zz/about']){
  const res=await mf.dispatchFetch('https://waydidi.com'+path,{redirect:'manual'});assert.equal(res.status,404,path);assert.ok(res.headers.get('content-security-policy'));await res.text();
 }
});
test('localized visitor pages still obey maintenance mode',async()=>{
 // A separate instance avoids the production 20-second maintenance cache.
 const blocked=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{PUBLIC_LANGUAGE_URLS:'1'},d1Databases:['DB']});
 try{
  const maintenanceDb=await blocked.getD1Database('DB');await maintenanceDb.prepare('CREATE TABLE site_settings(key TEXT PRIMARY KEY,value TEXT)').run();await maintenanceDb.prepare("INSERT INTO site_settings VALUES('maintenance','on')").run();
  const res=await blocked.dispatchFetch('https://waydidi.com/th/about');assert.equal(res.status,503);assert.equal(res.headers.get('retry-after'),'3600');assert.equal(res.headers.get('cache-control'),'no-store');await res.text();
 }finally{await blocked.dispose();}
});
