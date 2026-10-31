import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({configFile:false,appType:'custom',server:{middlewareMode:true}});
after(()=>vite.close());
const { languageDelivery } = await vite.ssrLoadModule('/lib/language-delivery.ts');
test('URL language replaces untrusted internal headers and never redirects for a cookie',()=>{
 const req = new Request('https://waydidi.com/th/about?q=1',{headers:{cookie:'waydidi-lang=zh','x-waydidi-language':'ru'}});
 const out=languageDelivery(req,true);
 assert.equal(out.request.url,'https://waydidi.com/about?q=1');
 assert.equal(out.lang,'th'); assert.equal(out.request.headers.get('x-waydidi-language'),'th');
 assert.equal(languageDelivery(new Request('https://waydidi.com/about',{headers:{cookie:'waydidi-lang=th'}}),true).lang,'en');
});
test('excluded prefixed paths fail closed and flag defaults to legacy behavior',()=>{
 assert.equal(languageDelivery(new Request('https://waydidi.com/fr/api/admin'),true).valid,false);
 assert.equal(languageDelivery(new Request('https://waydidi.com/zh/about'),false).enabled,false);
});
