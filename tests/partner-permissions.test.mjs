import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {migrationStatements} from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {const sql=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));if(sql.length)await db.batch(sql.map(s=>db.prepare(s)));}
globalThis.__partnerAuditEnv={DB:db};globalThis.__partnerAuditRole='operations';
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'partner-audit',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0partner-env';if(id==='@/lib/admin'||id===root+'/lib/admin'||id===root+'/lib/admin.ts')return '\0partner-staff';},load(id){if(id==='\0partner-env')return 'export const env=globalThis.__partnerAuditEnv';if(id==='\0partner-staff')return 'export const getWaydidiAdmin=async()=>({id:"test",displayName:"Test",role:globalThis.__partnerAuditRole})';}}],server:{middlewareMode:true,hmr:false}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__partnerAuditEnv;delete globalThis.__partnerAuditRole;});
const stores=await vite.ssrLoadModule('/app/api/admin/storefronts/route.ts'),affiliates=await vite.ssrLoadModule('/app/api/admin/affiliates/route.ts');
const request=(body,method='POST')=>new Request('https://example.invalid/api/admin/storefronts',{method,headers:{origin:'https://example.invalid','content-type':'application/json'},body:JSON.stringify(body)});
test('operations can manage partners but cannot settle storefront or affiliate payouts',async()=>{
 globalThis.__partnerAuditRole='operations';assert.equal((await stores.PATCH(request({id:'missing',settle:true},'PATCH'))).status,403);assert.equal((await affiliates.POST(request({action:'pay',id:'missing'}))).status,403);
 const response=await stores.POST(request({name:'Audit store',slug:'audit-store',discountPercent:5,commissionPercent:8}));assert.equal(response.status,200);
});
test('finance can settle but cannot create or edit commercial partner settings',async()=>{
 globalThis.__partnerAuditRole='finance';assert.equal((await stores.PATCH(request({id:'missing',settle:true},'PATCH'))).status,200);assert.equal((await affiliates.POST(request({action:'pay',id:'missing'}))).status,200);
 assert.equal((await stores.POST(request({name:'Unauthorized store',discountPercent:5,commissionPercent:8}))).status,403);assert.equal((await stores.PATCH(request({id:'missing',toggle:true,active:false},'PATCH'))).status,403);assert.equal((await affiliates.POST(request({action:'kit-prices',prices:{}}))).status,403);
});
test('support and editors cannot bypass partner route guards',async()=>{
 for(const role of ['support','editor']){globalThis.__partnerAuditRole=role;assert.equal((await stores.PATCH(request({id:'missing',settle:true},'PATCH'))).status,403);assert.equal((await affiliates.POST(request({action:'pay',id:'missing'}))).status,403);assert.equal((await affiliates.GET(new Request('https://example.invalid/api/admin/affiliates'))).status,403);}
});
