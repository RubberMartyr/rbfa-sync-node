import test from 'node:test';
import assert from 'node:assert/strict';

import { isFriendlySeriesId, isOriginalTeamId } from './main.node.js';
import { convertTeamDataToApiFormat, convertTeamToListFormat } from './dataConverter.node.js';
import { toSlug } from './api.node.js';

test('isFriendlySeriesId classifies only FRN_ series IDs as friendly', () => {
  assert.equal(isFriendlySeriesId('FRN_882'), true);
  assert.equal(isFriendlySeriesId('123456'), false);
  assert.equal(isFriendlySeriesId(null), false);
  assert.equal(isFriendlySeriesId(undefined), false);
});

test('original team IDs compare safely across string and number values', () => {
  assert.equal(isOriginalTeamId('375476', '375476'), true);
  assert.equal(isOriginalTeamId(375476, '375476'), true);
  assert.equal(isOriginalTeamId('375477', '375476'), false);
});

test('original team icon slugs are derived from the team name', () => {
  assert.equal(`${toSlug('U17 A')}-icon`, 'u17-a-icon');
});

test('team and player-list payloads never contain a null league', () => {
  const team = { id: '375476', name: 'U17 A', clubName: 'U17 A', players: {} };
  const teamPayload = convertTeamDataToApiFormat(team, null, 'RBFA-375476', 42);
  const listPayload = convertTeamToListFormat(team, 'RBFA-375476-list', null, 12);

  assert.deepEqual(teamPayload.leagues, []);
  assert.deepEqual(listPayload.leagues, []);
  assert.match(teamPayload.excerpt, /\[player_list id="42"/);
});
