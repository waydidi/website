import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The extension's reply-queue group order (extensions/fb-leads/queue-plan.js), run as the browser runs it.
const source = readFileSync(fileURLToPath(new URL('../extensions/fb-leads/queue-plan.js', import.meta.url)), 'utf8');
const sandbox = {}; sandbox.self = sandbox;
vm.runInNewContext(source, sandbox);
const P = sandbox.WaydidiPlan;
const plain = (v) => JSON.parse(JSON.stringify(v));

const settings = { per: 10, groups: [{ key: 'khaolak', name: 'Khao Lak Community', on: true }, { key: 'kata', name: 'Katathani', on: true }, { key: 'pattaya', name: 'Pattaya Expats', on: false }, { key: 'phuket', name: 'Phuket Travel', on: true }] };

test('a plan has only the ticked groups, in the chosen order, starting at the first', () => {
  const plan = P.makePlan(settings);
  assert.deepEqual(plain(plan.groups.map((g) => g.key)), ['khaolak', 'kata', 'phuket']);
  assert.equal(plan.at, 0); assert.equal(plan.count, 0); assert.equal(plan.round, 1); assert.equal(plan.per, 10);
  assert.equal(P.describe(plan), 'Round 1 · Khao Lak Community 0 of 10');
});

test('10 posted in a group, then the next group; after the last, round 2 starts at the first', () => {
  let plan = P.makePlan(settings);
  for (let i = 0; i < 9; i++) plan = P.afterPosted(plan);
  assert.equal(P.current(plan).key, 'khaolak'); assert.equal(plan.count, 9);
  plan = P.afterPosted(plan);
  assert.equal(P.current(plan).key, 'kata'); assert.equal(plan.count, 0);
  for (let i = 0; i < 20; i++) plan = P.afterPosted(plan);
  assert.equal(P.current(plan).key, 'khaolak'); assert.equal(plan.round, 2);
});

test('a group with nothing ready is passed over and its count starts again next time', () => {
  let plan = P.makePlan(settings);
  plan = P.afterPosted(P.afterPosted(plan));
  plan = P.nextGroup(plan); // khaolak empty after 2
  assert.equal(P.current(plan).key, 'kata'); assert.equal(plan.count, 0);
});

test('Start again with the same groups and number carries on; a change starts from the first group', () => {
  let plan = P.makePlan(settings);
  for (let i = 0; i < 13; i++) plan = P.afterPosted(plan);
  const again = P.makePlan(settings, plain(plan));
  assert.equal(P.current(again).key, 'kata'); assert.equal(again.count, 3);
  const reordered = { ...settings, groups: [settings.groups[1], settings.groups[0], settings.groups[3]] };
  assert.equal(P.current(P.makePlan(reordered, plain(plan))).key, 'kata'); assert.equal(P.makePlan(reordered, plain(plan)).count, 0);
  assert.equal(P.makePlan({ ...settings, per: 5 }, plain(plan)).at, 0);
});

test('the number per group is kept between 1 and 50, default 10', () => {
  assert.deepEqual([P.perOf('5'), P.perOf(0), P.perOf(99), P.perOf('x'), P.perOf(undefined)], [5, 1, 50, 10, 10]);
  assert.equal(P.makePlan({ groups: settings.groups, per: 'abc' }).per, 10);
});

test('no groups ticked or none saved: an empty plan (the queue then takes any group, as before)', () => {
  assert.equal(P.makePlan({}).groups.length, 0);
  assert.equal(P.makePlan({ groups: settings.groups.map((g) => ({ ...g, on: false })) }).groups.length, 0);
  assert.equal(P.current(P.makePlan({})), null);
});

test('the popup list: saved order and ticks kept, counts from the website, new groups added at the end ticked', () => {
  const rows = P.mergeGroups([{ key: 'kata', name: 'Kata old name', on: false }, { key: 'khaolak', name: 'Khao Lak', on: true }],
    [{ key: 'khaolak', name: 'Khao Lak Community', waiting: 14 }, { key: 'phuket', name: 'Phuket Travel', waiting: 21 }]);
  assert.deepEqual(plain(rows), [
    { key: 'kata', name: 'Kata old name', on: false, waiting: 0, keys: ['kata'] },
    { key: 'khaolak', name: 'Khao Lak Community', on: true, waiting: 14, keys: ['khaolak'] },
    { key: 'phuket', name: 'Phuket Travel', on: true, waiting: 21, keys: ['phuket'] },
  ]);
  assert.equal(P.mergeGroups([{ key: 'a' }, { key: 'a' }, null, { key: 5 }], []).length, 1, 'duplicates and bad rows dropped');
});

test('a group with two addresses is one row; two saved rows of it become one, at the first one\'s place and tick', () => {
  const live = [{ key: 'khaolakcommunity', name: 'Khao Lak Community', waiting: 29, keys: ['khaolakcommunity', '984508081894004'] }, { key: 'kohchang', name: 'Koh Chang', waiting: 3, keys: ['kohchang'] }];
  const rows = P.mergeGroups([{ key: 'kohchang', on: true }, { key: '984508081894004', name: 'Khao Lak Community', on: false }, { key: 'khaolakcommunity', on: true }], live);
  assert.deepEqual(plain(rows).map((r) => [r.key, r.on, r.waiting, r.keys]), [['kohchang', true, 3, ['kohchang']], ['khaolakcommunity', false, 29, ['khaolakcommunity', '984508081894004']]]);
  const plan = P.makePlan({ per: 10, groups: [{ key: 'khaolakcommunity', name: 'Khao Lak Community', on: true, keys: ['khaolakcommunity', '984508081894004'] }] });
  assert.deepEqual(plain(P.current(plan).keys), ['khaolakcommunity', '984508081894004'], 'the queue asks with every address');
  assert.deepEqual(plain(P.makePlan({ groups: [{ key: 'old', on: true }] }).groups[0].keys), ['old'], 'a list saved by 1.8.0 (no addresses) still works');
});
