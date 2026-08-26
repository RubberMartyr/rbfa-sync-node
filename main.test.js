import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isFriendlySeriesId,
  isOfficialTeamDelegate,
  isOriginalTeamId,
  mergeManagedStaffRoles,
  ensureWordPressUserForPerson,
  getStaffPersonId,
  addPlayerOrStaffToTeamIfNotPresent,
} from './main.node.js';
import { generateSlug } from './api.node.js';
import {
  convertPlayerDataToApiFormat,
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

test('person payloads use the resolved WordPress user as author', () => {
  const player = { id: '1', firstName: 'A', lastName: 'B' };
  const staff = { id: '2', firstName: 'C', lastName: 'D', function: [] };

  assert.equal(convertPlayerDataToApiFormat(player, 'RBFA-1', 10, 123).author, 123);
  assert.equal(convertStaffDataToApiFormat(staff, 'RBFA-2', 456).author, 456);
});

test('WordPress users are reused and newly created with existing account conventions', async () => {
  const person = { firstName: 'José', lastName: 'Peeters' };
  let createCalls = 0;
  const existing = await ensureWordPressUserForPerson(person, 'player', {
    doesUserExistFn: async () => ({ id: 12, slug: 'josepee' }),
    createUserFn: async () => { createCalls += 1; },
  });
  assert.equal(existing.id, 12);
  assert.equal(createCalls, 0);

  let submittedUser;
  const created = await ensureWordPressUserForPerson(person, 'staff', {
    doesUserExistFn: async () => null,
    createUserFn: async (user) => {
      submittedUser = user;
      return { id: 34, ...user };
    },
  });
  assert.equal(created.id, 34);
  assert.deepEqual(submittedUser, {
    username: 'josepee',
    password: 'peeters',
    email: 'josepee@jeugdherk.com',
    roles: ['subscriber'],
    first_name: 'José',
    last_name: 'Peeters',
  });
});

test('WordPress user resolution rejects missing names, failed lookups and invalid IDs', async () => {
  let createCalls = 0;
  const createUserFn = async () => { createCalls += 1; return { id: 9 }; };

  assert.equal(await ensureWordPressUserForPerson({ firstName: 'A' }, 'player', { createUserFn }), null);
  assert.equal(await ensureWordPressUserForPerson({ firstName: 'A', lastName: 'B' }, 'staff', {
    doesUserExistFn: async () => { throw new Error('lookup failed'); },
    createUserFn,
  }), null);
  assert.equal(await ensureWordPressUserForPerson({ firstName: 'A', lastName: 'B' }, 'player', {
    doesUserExistFn: async () => ({ id: '1' }),
    createUserFn,
  }), null);
  assert.equal(createCalls, 0);
});

test('managed delegate roles preserve all other numeric SportsPress roles', () => {
  assert.deepEqual(mergeManagedStaffRoles([66], 426, true, true), [66, 426]);
  assert.deepEqual(mergeManagedStaffRoles([426, 426], 426, true, true), [426]);
  assert.deepEqual(mergeManagedStaffRoles([66, 426], 426, false, true), [66, 426]);
  assert.deepEqual(mergeManagedStaffRoles([66, 426], 426, false, false), [66, 426]);
  assert.deepEqual(mergeManagedStaffRoles([66, 77, 426], 426, false, true), [66, 77, 426]);
  assert.deepEqual(mergeManagedStaffRoles(['66', 66], 426, true, true), [66, 426]);
});

test('staff assignment IDs normalize only the strict RBFA numeric shape', () => {
  assert.equal(getStaffPersonId('381380_375477'), '381380');
  assert.equal(getStaffPersonId('381380_375538'), '381380');
  assert.equal(getStaffPersonId('598384_375476'), '598384');
  assert.equal(getStaffPersonId('381380'), '381380');
  assert.equal(getStaffPersonId(' member_123 '), 'member_123');
  assert.equal(getStaffPersonId(null), '');
});

test('staff assignments for different teams produce one canonical slug', () => {
  assert.equal(generateSlug(getStaffPersonId('381380_375477')), 'RBFA-381380');
  assert.equal(generateSlug(getStaffPersonId('381380_375538')), 'RBFA-381380');
});

test('two staff assignments reuse one WordPress user and author', async () => {
  const assignments = [
    { id: '381380_375477', firstName: 'Bert', lastName: 'Leysen', function: [] },
    { id: '381380_375538', firstName: 'Bert', lastName: 'Leysen', function: [] },
  ];
  let createCalls = 0;
  const dependencies = {
    doesUserExistFn: async () => ({ id: 73 }),
    createUserFn: async () => { createCalls += 1; return { id: 99 }; },
  };

  const payloads = [];
  for (const assignment of assignments) {
    const user = await ensureWordPressUserForPerson(assignment, 'staff', dependencies);
    const slug = generateSlug(getStaffPersonId(assignment.id));
    payloads.push(convertStaffDataToApiFormat(assignment, slug, user.id));
  }

  assert.equal(createCalls, 0);
  assert.deepEqual(payloads.map(({ author }) => author), [73, 73]);
  assert.deepEqual(new Set(payloads.map(({ slug }) => slug)).size, 1);
});

test('staff team assignments merge numerically and idempotently', async () => {
  const payload = { teams: [], current_teams: [] };
  await addPlayerOrStaffToTeamIfNotPresent(payload, 101);
  await addPlayerOrStaffToTeamIfNotPresent(payload, 202, {
    teams: [...payload.teams, '101'],
    current_teams: [...payload.current_teams, '101'],
  });
  await addPlayerOrStaffToTeamIfNotPresent(payload, 202, payload);

  assert.deepEqual(payload.teams, [101, 202]);
  assert.deepEqual(payload.current_teams, [101, 202]);
});

test('delegate role survives either team processing order without duplicates', () => {
  const delegateRoleId = 426;
  const delegateThenOther = mergeManagedStaffRoles(
    mergeManagedStaffRoles([], delegateRoleId, true, true), delegateRoleId, false, true
  );
  const otherThenDelegate = mergeManagedStaffRoles(
    mergeManagedStaffRoles([], delegateRoleId, false, true), delegateRoleId, true, true
  );

  assert.deepEqual(delegateThenOther, [delegateRoleId]);
  assert.deepEqual(otherThenDelegate, [delegateRoleId]);
});
