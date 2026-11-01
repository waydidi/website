import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {createServer} from 'vite';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const db=await mf.getD1Database('DB');
// The real pricing tables, without unrelated application migrations.
const migration=await readFile('drizzle/0004_brown_ricochet.sql','utf8');
for(const table of ['pricing_areas','pricing_rules']) {
 const sql=migration.match(new RegExp('CREATE TABLE `'+table+'` \\([\\s\\S]*?\\n\\);'))?.[0];
 assert.ok(sql);await db.prepare(sql).run();
}
globalThis.__seoPricingEnv={DB:db,TRANSFER_ROUTE_PAGES:'0'};
const vite=await createServer({configFile:false,appType:'custom',resolve:{alias:{'@':process.cwd()}},plugins:[{name:'seo-env',resolveId(id){if(id==='cloudflare:workers')return '\0seo-env';},load(id){if(id==='\0seo-env')return 'export const env=globalThis.__seoPricingEnv';}}],server:{middlewareMode:true}});
after(async()=>{await vite.close();await mf.dispose();delete globalThis.__seoPricingEnv;});
const {publishedTransferRoute,publishedTransferRoutes}=await vite.ssrLoadModule('/lib/transfer-routes-server.ts');
const {sitemapEntries}=await vite.ssrLoadModule('/lib/sitemap-entries.ts');
const geometry=JSON.stringify([[{lat:12.6,lng:100.8},{lat:12.6,lng:101.0},{lat:13.1,lng:101.0},{lat:13.1,lng:100.8}]]);
await db.prepare("INSERT INTO pricing_areas(id,name,code,status,pricing_type,published_geometry_json,created_at,updated_at) VALUES('seo-pattaya','Test Pattaya','SEO','published','hybrid',?,'test','test')").bind(geometry).run();
await db.prepare("INSERT INTO pricing_rules(id,area_id,vehicle_id,base_price,included_distance_km,extra_price_per_km,updated_at) VALUES('seo-sedan','seo-pattaya','economy_sedan',1000,100,7,'test')").run();
test('route rollout defaults off even with published pricing',async()=>{
 assert.equal(await publishedTransferRoute('bkk-airport-to-pattaya'),null);
 assert.deepEqual(await publishedTransferRoutes(),[]);
});
test('real D1 rules calculate rounded route fares and unpublished routes disappear from sitemap',async()=>{
 globalThis.__seoPricingEnv.TRANSFER_ROUTE_PAGES='1';
 try {
  // Keep the original Pattaya pricing assertions, but never advertise its partial quote.
  const {pricesForArea}=await vite.ssrLoadModule('/lib/pricing.ts');
  assert.equal((await pricesForArea('seo-pattaya',125000)).economy_sedan.total*100,120000,'1000 + 25km × 7 = 1175 THB rounded up to 1200');
  assert.equal(await publishedTransferRoute('bkk-airport-to-pattaya'),null);
  await db.prepare("UPDATE pricing_rules SET fixed_price=1551 WHERE id='seo-sedan'").run();
  assert.equal((await pricesForArea('seo-pattaya',125000)).economy_sedan.total*100,160000);
  // A bookable Bangkok airport route needs all four real vehicle rules.
  const city=JSON.stringify([[{lat:13.48,lng:100.32},{lat:13.48,lng:100.95},{lat:13.97,lng:100.95},{lat:13.97,lng:100.32}]]);
  await db.prepare("INSERT INTO pricing_areas(id,name,code,status,pricing_type,published_geometry_json,created_at,updated_at) VALUES('seo-city','Test Bangkok','CITY','published','hybrid',?,'test','test')").bind(city).run();
  for(const vehicle of ['economy_sedan','comfort_bmw','comfort_suv','premium_minivan']) await db.prepare("INSERT INTO pricing_rules(id,area_id,vehicle_id,base_price,included_distance_km,extra_price_per_km,updated_at) VALUES(?,'seo-city',?,1000,7,7,'test')").bind('city-'+vehicle,vehicle).run();
  const r=await publishedTransferRoute('bkk-airport-to-bangkok');
  assert.equal(r.pricesMinor.economy_sedan,120000,'1000 + (32 - 7)km × 7 rounded up to 1200');
  assert.equal(Object.keys(r.pricesMinor).length,4);
  await db.prepare("UPDATE pricing_rules SET fixed_price=1551 WHERE id='city-economy_sedan'").run();
  assert.equal((await publishedTransferRoute(r.slug)).pricesMinor.economy_sedan,160000);
  const published=sitemapEntries({siteUrl:'https://waydidi.com',transferSlugs:(await publishedTransferRoutes()).map(r=>r.slug),pageSlugs:[],destinationSlugs:[],posts:[],packages:[],categorySlug:s=>s});
  assert.ok(published.some(e=>e.url.endsWith('/transfers/'+r.slug)));
  assert.ok(!published.some(e=>e.url.endsWith('/transfers/bkk-airport-to-pattaya')));
  await db.prepare("UPDATE pricing_rules SET vehicle_id='unavailable' WHERE id='city-comfort_bmw'").run();
  assert.equal(await publishedTransferRoute(r.slug),null);
  await db.prepare("UPDATE pricing_areas SET status='draft'").run();
  assert.equal(await publishedTransferRoute(r.slug),null);
  const entries=sitemapEntries({siteUrl:'https://waydidi.com',transferSlugs:(await publishedTransferRoutes()).map(r=>r.slug),pageSlugs:[],destinationSlugs:[],posts:[],packages:[],categorySlug:s=>s});
  assert.ok(!entries.some(e=>e.url.includes('/transfers')));
 }finally{globalThis.__seoPricingEnv.TRANSFER_ROUTE_PAGES='0';}
});
