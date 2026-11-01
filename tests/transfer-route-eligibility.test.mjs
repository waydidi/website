import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const result=await build({entryPoints:['lib/transfer-routes.ts'],bundle:true,write:false,format:'esm',platform:'neutral'});
const {TRANSFER_ROUTES,quoteTransferRoute}=await import('data:text/javascript,'+encodeURIComponent(result.outputFiles[0].text));
const four={economy_sedan:{total:1500},comfort_bmw:{total:2500},comfort_suv:{total:2000},premium_minivan:{total:3000}};
const deps=prices=>({matchArea:async()=>({id:'test',pricingType:'fixed'}),prices:async()=>prices});
test('routes refused by the real four-vehicle quote guard are not advertised',async()=>{
 for(const route of TRANSFER_ROUTES){
  const quote=await quoteTransferRoute(route,deps({...four}));
  if(['bkk-airport-to-bangkok','bangkok-to-bkk-airport','dmk-airport-to-bangkok','bangkok-to-dmk-airport'].includes(route.slug)){
   assert.equal(Object.keys(quote.pricesMinor).length,4,route.slug);
   assert.equal(quote.pricesMinor.economy_sedan,150000);
  }else assert.equal(quote,null,route.slug);
 }
});
test('incomplete vehicle pricing is hidden even on BMW-eligible routes',async()=>{
 const route=TRANSFER_ROUTES.find(r=>r.slug==='bkk-airport-to-bangkok');
 for(const id of Object.keys(four)){
  const missing={...four};delete missing[id];
  assert.equal(await quoteTransferRoute(route,deps(missing)),null,id);
 }
});
