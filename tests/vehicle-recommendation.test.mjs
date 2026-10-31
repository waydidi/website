import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,optimizeDeps:{noDiscovery:true},resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const {recommendVehicles}=await vite.ssrLoadModule('/lib/vehicle-recommendation.ts');
test('smallest fitting class is best, next fitting class upgrades comfort',()=>{
 assert.deepEqual(recommendVehicles(2,2,'economy_sedan'),{best:'economy_sedan',upgrade:'comfort_bmw'});
 assert.deepEqual(recommendVehicles(4,3,'comfort_suv'),{best:'comfort_suv',upgrade:'premium_minivan'});
});
test('no upgrade at top class or when no class fits',()=>{
 assert.deepEqual(recommendVehicles(10,8,'premium_minivan'),{best:'premium_minivan',upgrade:null});
 assert.deepEqual(recommendVehicles(11,9,'economy_sedan'),{best:null,upgrade:null});
});
test('only available quoted classes can be recommended',()=>{
 assert.deepEqual(recommendVehicles(2,2,'economy_sedan',['economy_sedan','comfort_suv']),{best:'economy_sedan',upgrade:'comfort_suv'});
});
