import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// The Bookings phone Filter: date, driver, payment and status choices narrow the cards.
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({root,configFile:false,appType:'custom',resolve:{alias:{'@':root}},server:{middlewareMode:true}});
const f=await vite.ssrLoadModule('/lib/booking-filter.ts');
test.after(()=>vite.close());
const today='2026-10-14';
const ride=(over)=>({reference:'R',pickupDate:'2026-10-20',driverId:null,paymentStatus:'paid',status:'confirmed',...over});
const rides=[
 ride({reference:'TODAY',pickupDate:today,driverId:'d1'}),
 ride({reference:'SOON',pickupDate:'2026-10-21',paymentStatus:'cash_due'}),
 ride({reference:'LATER',pickupDate:'2026-12-01',paymentStatus:'pending'}),
 ride({reference:'OLD',pickupDate:'2026-10-01',driverId:'d2',status:'completed'}),
 ride({reference:'GONE',pickupDate:'2026-10-30',status:'cancelled'}),
 ride({reference:'NOSHOW',pickupDate:'2026-09-01',status:'no_show',driverId:'d3'}),
 ride({reference:'AWAIT',pickupDate:'2026-10-25',status:'pending_payment',paymentStatus:'pending'}),
];
const refs=(over)=>f.applyFilter(rides,{...f.NO_FILTER,...over},today).map(r=>r.reference);

test('no filter shows everything, in the same order',()=>{
 assert.deepEqual(refs({}),rides.map(r=>r.reference));
 assert.equal(f.activeFilters(f.NO_FILTER),0);
});

test('each choice narrows the list',()=>{
 assert.deepEqual(refs({when:'today'}),['TODAY']);
 assert.deepEqual(refs({when:'week'}),['TODAY','SOON']); // today to seven days ahead
 assert.deepEqual(refs({when:'past'}),['OLD','NOSHOW']);
 assert.deepEqual(refs({driver:'assigned'}),['TODAY','OLD','NOSHOW']);
 assert.deepEqual(refs({driver:'not_assigned'}),['SOON','LATER','GONE','AWAIT']);
 assert.deepEqual(refs({payment:'cash'}),['SOON']);
 assert.deepEqual(refs({payment:'paid'}),['TODAY','OLD','GONE','NOSHOW']);
 assert.deepEqual(refs({payment:'other'}),['LATER','AWAIT']);
 assert.deepEqual(refs({status:'confirmed'}),['TODAY','SOON','LATER']);
 assert.deepEqual(refs({status:'pending_payment'}),['AWAIT']);
 assert.deepEqual(refs({status:'completed'}),['OLD','NOSHOW']); // a no-show is a finished job too
 assert.deepEqual(refs({status:'cancelled'}),['GONE']);
});

test('choices combine, and the count says how many are on',()=>{
 const both={driver:'not_assigned',status:'confirmed'};
 assert.deepEqual(refs(both),['SOON','LATER']);
 assert.equal(f.activeFilters({...f.NO_FILTER,...both}),2);
 assert.deepEqual(refs({when:'today',driver:'not_assigned'}),[]);
});

test('Thailand\'s date, and a saved filter is only read if it is a known choice',()=>{
 assert.equal(f.bangkokToday(new Date('2026-10-13T18:30:00Z')),'2026-10-14'); // already tomorrow in Bangkok
 assert.deepEqual(f.parseFilter({when:'today',driver:'nope',payment:42,extra:1}),{...f.NO_FILTER,when:'today'});
 assert.deepEqual(f.parseFilter(null),f.NO_FILTER);
 assert.deepEqual(f.parseFilter('junk'),f.NO_FILTER);
});

test('round trips: the first trip is listed under Completed as soon as it is done, and the second trip once it ends',()=>{
 const trip=(leg,over)=>ride({reference:'RT1',leg,pickupDate:leg==='outbound'?'2026-10-10':'2026-10-20',driverId:'d1',status:'confirmed',...over});
 // First trip done, second trip still to come: the booking card shows the second trip.
 const secondUp=[trip('return',{primary:true,legDone:false}),trip('outbound',{primary:false,legDone:true})];
 assert.deepEqual(f.applyFilter(secondUp,f.NO_FILTER,today).map(r=>r.leg),['return']); // no filter: one card per booking, as before
 assert.deepEqual(f.applyFilter(secondUp,{...f.NO_FILTER,status:'confirmed'},today).map(r=>r.leg),['return']);
 assert.deepEqual(f.applyFilter(secondUp,{...f.NO_FILTER,status:'completed'},today).map(r=>r.leg),['outbound']); // the first trip, although the booking is still open
 // Both trips done (the booking is completed): two separate completed trips.
 const both=[trip('return',{primary:true,legDone:true,status:'completed'}),trip('outbound',{primary:false,legDone:true,status:'completed'})];
 assert.deepEqual(f.applyFilter(both,{...f.NO_FILTER,status:'completed'},today).map(r=>r.leg).sort(),['outbound','return']);
 assert.deepEqual(f.applyFilter(both,f.NO_FILTER,today).map(r=>r.leg),['return']);
 // Other choices still apply to each trip's own card.
 assert.deepEqual(f.applyFilter(secondUp,{...f.NO_FILTER,status:'completed',when:'past'},today).map(r=>r.leg),['outbound']);
 assert.deepEqual(f.applyFilter(secondUp,{...f.NO_FILTER,status:'completed',when:'week'},today).map(r=>r.leg),[]);
 // A one-way trip that is not done is not listed as completed.
 assert.deepEqual(f.applyFilter([ride({reference:'ONE',primary:true,legDone:false})],{...f.NO_FILTER,status:'completed'},today),[]);
});
