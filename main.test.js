import test from 'node:test';
import assert from 'node:assert/strict';

import { isFriendlySeriesId } from './main.node.js';

test('isFriendlySeriesId classifies only FRN_ series IDs as friendly', () => {
  assert.equal(isFriendlySeriesId('FRN_882'), true);
  assert.equal(isFriendlySeriesId('123456'), false);
  assert.equal(isFriendlySeriesId(null), false);
  assert.equal(isFriendlySeriesId(undefined), false);
});
