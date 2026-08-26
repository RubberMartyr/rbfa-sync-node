import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isFriendlySeriesId,
  isOfficialTeamDelegate,
  isOriginalTeamId,
  mergeManagedStaffRoles,
} from './main.node.js';
import {
  convertStaffDataToApiFormat,
  convertTeamDataToApiFormat,
  convertTeamToListFormat,
} from './dataConverter.node.js';
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

test('official team delegates are recognized defensively in English and Dutch', () => {
  assert.equal(isOfficialTeamDelegate(['Official Team Delegate']), true);
  assert.equal(isOfficialTeamDelegate(['Officiële Team Afgevaardigde']), true);
  assert.equal(isOfficialTeamDelegate(['T1', 'Official Team Delegate', 'T2']), true);
  assert.equal(isOfficialTeamDelegate(['  OFFICIAL TEAM DELEGATE  ']), true);
  assert.equal(isOfficialTeamDelegate(['T1']), false);
  assert.equal(isOfficialTeamDelegate(null), false);
  assert.equal(isOfficialTeamDelegate(undefined), false);
  assert.equal(isOfficialTeamDelegate('Official Team Delegate'), false);
});

test('staff conversion tolerates missing or invalid function data', () => {
  assert.doesNotThrow(() => convertStaffDataToApiFormat({ id: '1', firstName: 'A', lastName: 'B' }, 'RBFA-1'));
  assert.doesNotThrow(() => convertStaffDataToApiFormat({ id: '2', firstName: 'C', lastName: 'D', function: null }, 'RBFA-2'));
});

test('managed delegate roles preserve all other numeric SportsPress roles', () => {
  assert.deepEqual(mergeManagedStaffRoles([66], 426, true, true), [66, 426]);
  assert.deepEqual(mergeManagedStaffRoles([426, 426], 426, true, true), [426]);
  assert.deepEqual(mergeManagedStaffRoles([66, 426], 426, false, true), [66]);
  assert.deepEqual(mergeManagedStaffRoles([66, 426], 426, false, false), [66, 426]);
  assert.deepEqual(mergeManagedStaffRoles([66, 77, 426], 426, false, true), [66, 77]);
  assert.deepEqual(mergeManagedStaffRoles(['66', 66], 426, true, true), [66, 426]);
});
