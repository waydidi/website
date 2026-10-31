import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({configFile:false, appType:'custom', server:{middlewareMode:true}});
after(() => vite.close());
const { parseLanguagePath, languagePath, languageAlternates } = await vite.ssrLoadModule('/lib/language-urls.ts');
test('legacy and all supported prefixes are served without a redirect and ignore cookies', () => {
 for (const lang of ['th','zh','fr','fil','hi']) assert.deepEqual(parseLanguagePath(`/${lang}/destinations/phuket`), {lang,path:'/destinations/phuket',prefixed:true,valid:true});
 assert.equal(parseLanguagePath('/th').path,'/');
 assert.equal(parseLanguagePath('/zz/about').valid,false);
 assert.equal(parseLanguagePath('/about').lang,'en');
});
test('private, API, assets and token pages cannot be prefixed', () => {
 for (const p of ['/api','/admin','/driver/trip/x','/agency','/account','/booking','/pay/x','/liff','/trip/x','/itinerary/x','/f/x','/s/x','/webhooks/x','/_vinext/x','/favicon.png']) {
  assert.equal(parseLanguagePath('/th'+p).valid,false,p);
  assert.equal(languagePath(p,'th'),p);
 }
});
test('language switching replaces a prefix, preserves query/hash, and English is unprefixed', () => {
 assert.equal(languagePath('/th/about?x=1#ok','fr'),'/fr/about?x=1#ok');
 assert.equal(languagePath('/zh','en'),'/');
 assert.equal(languagePath('/','th'),'/th');
});
test('unprefixed APIs remain reachable and encoded private prefixes fail closed',()=>{
 for(const path of ['/api/fare-quote','/pay/abc','/s/abc']) assert.equal(parseLanguagePath(path).valid,true,path);
 for(const path of ['/th/%61dmin','/fr/%61pi/admin','/zh//account','/th/zz/about','/en/about']) assert.equal(parseLanguagePath(path).valid,false,path);
});

test('private quote and marketing token pages are never language URLs or client-translated', async () => {
 const { untranslatedPath } = await vite.ssrLoadModule('/lib/site-languages.ts');
 for (const path of ['/quote/private-token','/marketing/private-token','/liff','/api/translate','/webhooks/telegram']) {
  assert.equal(parseLanguagePath('/th'+path).valid,false,path);
  assert.equal(languagePath(path,'th'),path);
  assert.equal(untranslatedPath(path),true,path);
 }
});

test('alternates include all languages, self and x-default', () => {
 const a=languageAlternates('/th/about','https://waydidi.com');
 assert.equal(Object.keys(a).length,13);
 assert.equal(a['zh-Hans'],'https://waydidi.com/zh/about');
 assert.equal(a.th,'https://waydidi.com/th/about');
 assert.equal(a['x-default'],a.en);
});
