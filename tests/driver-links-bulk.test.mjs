import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationStatements } from './helpers/migrations.mjs';

// The admin Bookings page gets every card's driver link in two reads (not two per booking).
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));
 if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));
}
globalThis.__links={env:{DB:d1}};
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},plugins:[{name:'env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0env';},load(id){if(id==='\0env')return 'export const env=globalThis.__links.env';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__links;});
const links=await vite.ssrLoadModule('/lib/trip-links.ts');
const {sha256}=await vite.ssrLoadModule('/lib/security.ts');
const at='2026-10-13T00:00:00Z', future='2099-01-01T00:00:00Z';

test('only bookings with a live assigned driver get a link, and it matches the one-by-one function',async()=>{
 await d1.prepare("INSERT INTO drivers(id,full_name,phone,driver_type,status,created_at,updated_at) VALUES('d1','A','0812345678','outsource','active',?,?)").bind(at,at).run();
 for(const ref of ['L1','L2','L3','L4'])await d1.prepare("INSERT INTO booking_links(booking_reference,leg,driver_token,created_at) VALUES(?,'outbound',?,?)").bind(ref,'tok-'+ref,at).run();
 const assign=async(ref,{revoked=null,expires=future}={})=>d1.prepare("INSERT INTO booking_assignments(id,booking_reference,leg,driver_id,token_hash,current_status,assigned_by,assigned_at,token_expires_at,revoked_at,updated_at) VALUES(?,?,'outbound','d1',?,'assigned','t',?,?,?,?)").bind('a-'+ref,ref,await sha256('tok-'+ref),at,expires,revoked,at).run();
 await assign('L1'); await assign('L2',{revoked:at}); await assign('L3',{expires:'2000-01-01T00:00:00Z'}); // L4 has a link but no driver yet
 const pairs=['L1','L2','L3','L4','L5'].map(reference=>({reference,leg:'outbound'}));
 const bulk=await links.assignedDriverUrls(pairs);
 assert.deepEqual([...bulk.keys()],['L1:outbound']);
 assert.equal(bulk.get('L1:outbound'),await links.assignedDriverUrl('L1','outbound'));
 for(const p of pairs.slice(1))assert.equal(await links.assignedDriverUrl(p.reference,p.leg),null);
 assert.equal((await links.assignedDriverUrls([])).size,0);
});
