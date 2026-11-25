import assert from 'node:assert/strict';
import test from 'node:test';
import { routeMidpoint } from '../lib/route-midpoint.ts';

const near = (actual, expected) => {
  assert.ok(actual, 'expected a point');
  assert.ok(Math.abs(actual[0] - expected[0]) < 1e-4 && Math.abs(actual[1] - expected[1]) < 1e-4, `${actual} vs ${expected}`);
};

test('a straight two-point line: halfway between the ends', () => {
  near(routeMidpoint([[13, 100], [13, 101]]), [13, 100.5]);
});

test('halfway by distance, not the middle vertex', () => {
  // Many points bunched near the start, one long stretch after: the middle
  // vertex is near the start, but halfway by distance is out on the long leg.
  const line = [[13, 100], [13, 100.01], [13, 100.02], [13, 100.03], [13, 100.04], [13, 102]];
  near(routeMidpoint(line), [13, 101]);
});

test('an L-shaped route: halfway lands on the corner', () => {
  near(routeMidpoint([[0, 0], [0, 1], [1, 1]]), [0, 1]);
});

test('empty, single-point and repeated-point lines', () => {
  assert.equal(routeMidpoint([]), null);
  assert.deepEqual(routeMidpoint([[13.7, 100.5]]), [13.7, 100.5]);
  assert.deepEqual(routeMidpoint([[13.7, 100.5], [13.7, 100.5]]), [13.7, 100.5]);
});
