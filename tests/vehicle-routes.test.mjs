import assert from 'node:assert/strict';
import test from 'node:test';
import { bmwAllowed, limitVehicles } from '../lib/vehicle-routes.ts';
const BKK={latitude:13.6900,longitude:100.7501},DMK={latitude:13.9126,longitude:100.6067},SUKHUMVIT={latitude:13.7376,longitude:100.5601},PATTAYA={latitude:12.9236,longitude:100.8825};
test('Comfort BMW only between Bangkok and its airports',()=>{
 assert.equal(bmwAllowed(BKK,SUKHUMVIT),true);assert.equal(bmwAllowed(SUKHUMVIT,DMK),true);
 assert.equal(bmwAllowed(BKK,PATTAYA),false);assert.equal(bmwAllowed(SUKHUMVIT,SUKHUMVIT),false);
 assert.deepEqual(Object.keys(limitVehicles({economy_sedan:1,comfort_bmw:2},BKK,PATTAYA)),['economy_sedan']);
});
