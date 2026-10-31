import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
after(()=>vite.close());
const rules=await vite.ssrLoadModule('/lib/cancellation-options.ts');
const refunds=await vite.ssrLoadModule('/lib/refund-policy.ts');
const validation=await vite.ssrLoadModule('/lib/booking-validation.ts');
test('checkout boundary accepts the chosen policy but never a client total',()=>{
 const input={checkoutAttemptId:crypto.randomUUID(),customerName:'Test',customerSurname:'Passenger',customerEmail:'test@example.invalid',customerPhone:'+66123456789',pickup:'Bangkok',dropoff:'Pattaya',pickupDate:new Date(Date.now()+30*86400000).toISOString().slice(0,10),pickupTime:'10:00',timezone:'Asia/Bangkok',passengers:2,luggage:1,vehicle:'economy_sedan',childSeats:0,oversizedLuggage:false,termsAccepted:true,paymentMethod:'card',fareQuoteId:crypto.randomUUID(),cancellationOption:'flexible'};
 assert.equal(validation.checkoutInputSchema.safeParse(input).success,true);
 assert.equal(validation.checkoutInputSchema.safeParse({...input,total:1}).success,false);
 assert.equal(validation.checkoutInputSchema.safeParse({...input,cancellationOption:'hacked'}).success,false);
});
test('purchased refund tiers honour exact boundaries and service cancellation overrides',()=>{
 const c=rules.cancellationConfig({CANCELLATION_OPTIONS:'1'});
 for(const [option,hours,percent] of [['standard',48.001,100],['standard',48,50],['standard',24,50],['standard',23.999,0],['non_refundable',200,0],['flexible',12.001,100],['flexible',12,100],['flexible',11.999,0]]) {
  const tiers=rules.cancellationTiers(option,c);
  assert.equal(refunds.refundPercent('customer_cancellation',hours,tiers),percent);
  assert.equal(refunds.refundPercent('waydidi_cancellation',hours,tiers),100);
  assert.equal(refunds.refundPercent('no_show',hours,tiers),0);
 }
});
test('flag off preserves the exact fare and standard option',()=>{
 const c=rules.cancellationConfig({});
 assert.equal(rules.cancellationFareMinor(123456,'flexible',c),123456);
 assert.equal(rules.resolveCancellationOption('flexible',c,100,'card'),'standard');
});
test('option adjustments round half up in integer satang before discounts',()=>{
 const c=rules.cancellationConfig({CANCELLATION_OPTIONS:'1'});
 assert.equal(rules.cancellationFareMinor(10010,'standard',c),10010);
 assert.equal(rules.cancellationFareMinor(10010,'non_refundable',c),9510);
 assert.equal(rules.cancellationFareMinor(10010,'flexible',c),11512);
 // Combined round trip first, then option, then fixed promo, then member discount, then add-ons.
 const fare=rules.cancellationFareMinor(10010+20010,'flexible',c);
 const afterPromo=fare-1000;
 assert.equal(afterPromo-Math.floor(afterPromo*0.1)+500,30671);
});
test('non-refundable requires more than 48 hours and online payment; cash falls back',()=>{
 const c=rules.cancellationConfig({CANCELLATION_OPTIONS:'1'});
 assert.equal(rules.resolveCancellationOption('non_refundable',c,48.001,'card'),'non_refundable');
 assert.throws(()=>rules.resolveCancellationOption('non_refundable',c,48,'card'),/INELIGIBLE/);
 assert.throws(()=>rules.resolveCancellationOption('non_refundable',c,47,'card'),/INELIGIBLE/);
 assert.equal(rules.resolveCancellationOption('non_refundable',c,100,'cash'),'standard');
 assert.throws(()=>rules.resolveCancellationOption('hacked',c,100,'card'),/INVALID/);
});
