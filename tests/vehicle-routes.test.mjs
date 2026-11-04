import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_VEHICLES, bmwAllowed, limitVehicles, routeHasAllPrices } from '../lib/vehicle-routes.ts';
import { VEHICLES } from '../lib/vehicles.ts';
const BKK={latitude:13.6900,longitude:100.7501},DMK={latitude:13.9126,longitude:100.6067},SUKHUMVIT={latitude:13.7376,longitude:100.5601},PATTAYA={latitude:12.9236,longitude:100.8825};
test('Comfort BMW only between Bangkok and its airports',()=>{
 assert.equal(bmwAllowed(BKK,SUKHUMVIT),true);assert.equal(bmwAllowed(SUKHUMVIT,DMK),true);
 assert.equal(bmwAllowed(BKK,PATTAYA),false);assert.equal(bmwAllowed(SUKHUMVIT,SUKHUMVIT),false);
 assert.deepEqual(Object.keys(limitVehicles({economy_sedan:1,comfort_bmw:2},BKK,PATTAYA)),['economy_sedan']);
});
test('a route needs a price for every car sold on it, and nothing more',()=>{
 assert.deepEqual([...ALL_VEHICLES].sort(),Object.keys(VEHICLES).sort());
 const three={economy_sedan:1,comfort_suv:1,premium_minivan:1};
 assert.equal(routeHasAllPrices(three,BKK,PATTAYA),true);
 assert.equal(routeHasAllPrices({...three,comfort_bmw:1},BKK,PATTAYA),true);
 assert.equal(routeHasAllPrices(three,BKK,SUKHUMVIT),false);
 assert.equal(routeHasAllPrices({...three,comfort_bmw:1},BKK,SUKHUMVIT),true);
 for(const id of Object.keys(three)){const missing={...three};delete missing[id];assert.equal(routeHasAllPrices(missing,BKK,PATTAYA),false,id);}
 assert.equal(routeHasAllPrices({},BKK,PATTAYA),false);
});
