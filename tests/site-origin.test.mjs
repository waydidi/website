import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'});
after(()=>vite.close());
const {SITE_URL,publicSiteUrl}=await vite.ssrLoadModule('/lib/site.ts');
test('primary domain replaces stale Workers and www public URL settings',()=>{
 for(const setting of [undefined,'https://waydidi-website.contact-waydidi.workers.dev/','https://www.waydidi.com','http://waydidi.com/','invalid'])assert.equal(publicSiteUrl(setting),'https://waydidi.com');
 assert.equal(SITE_URL,'https://waydidi.com');
 assert.equal(publicSiteUrl('https://preview.example.invalid/'),'https://preview.example.invalid');
});
