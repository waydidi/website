import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {readdir,readFile} from 'node:fs/promises';
import {migrationStatements} from './helpers/migrations.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-22',d1Databases:['DB']});
const d1=await mf.getD1Database('DB');
for(const name of (await readdir(root+'/drizzle')).filter(n=>n.endsWith('.sql')).sort()) {const statements=migrationStatements(await readFile(root+'/drizzle/'+name,'utf8'));if(statements.length)await d1.batch(statements.map(s=>d1.prepare(s)));}
// Counts schema/seed statements and can fail the next batch, like a D1 hiccup on a cold isolate.
const sql=[];let failNextBatch=false;
const DB={prepare(s){sql.push(s);return d1.prepare(s);},batch(s){if(failNextBatch){failNextBatch=false;return Promise.reject(new Error('D1 unavailable'));}return d1.batch(s);}};
globalThis.__bootEnv={DB};
const vite=await createServer({root,configFile:false,appType:'custom',optimizeDeps:{noDiscovery:true},resolve:{alias:{'@':root}},plugins:[{name:'boot-env',enforce:'pre',resolveId(id){if(id==='cloudflare:workers')return '\0boot-env';},load(id){if(id==='\0boot-env')return 'export const env=globalThis.__bootEnv';}}],server:{middlewareMode:true,hmr:false}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__bootEnv;});
const store=await vite.ssrLoadModule('/lib/route-stops-db.ts');
const setup=()=>sql.filter(s=>/CREATE (TABLE|INDEX) IF NOT EXISTS|INSERT OR IGNORE INTO route_stop_offers/.test(s)).length;

test('route-stop offer setup retries after a failure, then runs once per isolate',async()=>{
 failNextBatch=true;
 await assert.rejects(store.listRouteStopOffers(),/D1 unavailable/);
 assert.deepEqual(await store.listRouteStopOffers(),[]);
 const once=setup();assert.ok(once>0);
 await store.listRouteStopOffers();await store.listRouteStopOffers();
 assert.equal(setup(),once);
});
test('saved-stop table setup retries after a failure, then runs once per isolate',async()=>{
 const before=sql.filter(s=>s.includes('booking_route_stops (')).length;
 const prepare=DB.prepare;let failed=false;
 DB.prepare=s=>{if(!failed&&s.includes('booking_route_stops (')){failed=true;sql.push(s);return {run:()=>Promise.reject(new Error('D1 unavailable'))};}return prepare(s);};
 try {await assert.rejects(store.loadBookingRouteStops('NOSTOPS'),/D1 unavailable/);} finally {DB.prepare=prepare;}
 assert.deepEqual(await store.loadBookingRouteStops('NOSTOPS'),[]);
 const once=sql.filter(s=>s.includes('booking_route_stops (')).length;assert.equal(once,before+2);
 await store.loadBookingRouteStops('NOSTOPS');await store.loadBookingRouteStopsJson('NOSTOPS');
 assert.equal(sql.filter(s=>s.includes('booking_route_stops (')).length,once);
});
