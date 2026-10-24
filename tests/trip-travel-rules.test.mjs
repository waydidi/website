import assert from 'node:assert/strict';
import test from 'node:test';
import { matrixRows } from '../lib/trip-travel-rules.ts';
const points = [{ lat: 13.75, lng: 100.5 }, { lat: 14, lng: 100.6 }];
const valid = { originIndex: 0, destinationIndex: 1, condition: 'ROUTE_EXISTS', duration: '61.25s' };
test('route durations round up without understating travel time', () => {
  assert.deepEqual(matrixRows([valid], points), [{ a: '13.7500,100.5000', b: '14.0000,100.6000', min: 2 }]);
});
test('partial, failed, out-of-range and malformed provider elements are ignored', () => {
  const bad = [null, {}, { ...valid, status: { code: 13 } }, { ...valid, originIndex: 99 }, { ...valid, destinationIndex: -1 }, { ...valid, originIndex: 0.5 }, { ...valid, duration: '-60s' }, { ...valid, duration: 'NaNs' }, { ...valid, condition: 'ROUTE_NOT_FOUND' }];
  assert.deepEqual(matrixRows(bad, points), []);
  assert.equal(matrixRows([...bad, valid], points).length, 1);
  assert.deepEqual(matrixRows({ error: 'quota' }, points), []);
});
