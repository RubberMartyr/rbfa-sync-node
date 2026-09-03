import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSeasonConfig } from '../seasonConfig.node.js';
import {
  deriveOfficialSeriesFromCalendar,
  fetchAndProcessTeamCalendar,
  fetchAndProcessSeries,
  isFriendlySeriesId,
  matchesSeasonPart,
  parseSeasonPeriod,
} from '../main.node.js';
import { convertMatchToEvent } from '../dataConverter.node.js';
import { protectCalendarRelations, shouldMigrateFriendlyLeague } from '../syncHelpers.node.js';

test('season selection uses part-specific defaults and rejects invalid IDs', () => {
  assert.equal(resolveSeasonConfig({}, 'deel1').selectedSeasonId, 381);
  assert.equal(resolveSeasonConfig({}, 'deel2').selectedSeasonId, 382);
  assert.throws(
    () => resolveSeasonConfig({ SELECTED_SEASON_ID_DEEL1: '0' }, 'deel1'),
    /Invalid season ID for deel1: 0/
  );
});

test('series processing handles empty results consistently', async () => {
  const result = await fetchAndProcessSeries(
    { id: 1, name: 'U8 B' },
    'Seizoen 2026-2027',
    'deel1',
    {
      fetchTeamSeriesAndRankings: async () => ({ series: [] }),
      fetchTeamCalendarRBFA: async () => [],
    }
  );
  assert.deepEqual(result, { matchedSeries: [] });
});

const fallbackTeam = { id: 375469, name: 'U6 B' };
const fallbackMatch = (overrides = {}) => ({
  id: 'match-1',
  startTime: '2026-09-01T10:00:00Z',
  series: { id: 'CHP_135223', name: 'Gewestelijk U6 AW' },
  homeTeam: { id: 375469 },
  awayTeam: { id: 999 },
  ...overrides,
});

function fallbackDependencies(overrides = {}) {
  return {
    fetchTeamSeriesAndRankings: async () => null,
    fetchTeamCalendarRBFA: async () => [fallbackMatch()],
    doesEntityExist: async () => null,
    createLeagueEntry: async () => ({ id: 77, description: 'Seizoen 2026-2027' }),
    updateLeagueEntry: async () => { throw new Error('unexpected update'); },
    addLeagueToTeamIfNotPresent: async () => true,
    ...overrides,
  };
}

test('primary official series remains authoritative and does not fetch calendar', async () => {
  let calendarCalls = 0;
  const result = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', {
    fetchTeamSeriesAndRankings: async () => ({
      series: [{ serieId: 'CHP_135222', name: 'Gewestelijk U6 AV' }],
    }),
    fetchTeamCalendarRBFA: async () => { calendarCalls += 1; return [fallbackMatch()]; },
    doesEntityExist: async () => ({ id: 76, description: 'Seizoen 2026-2027' }),
    updateLeagueEntry: async (_id, data) => ({ id: 76, ...data }),
  });
  assert.equal(calendarCalls, 0);
  assert.deepEqual(result.matchedSeries.map(({ serieId }) => serieId), ['CHP_135222']);
});

test('U6 B calendar fallback deduplicates matches, creates once and links selected team', async () => {
  let creates = 0;
  let links = 0;
  let linkedSlug;
  const matches = Array.from({ length: 14 }, (_, index) => fallbackMatch({ id: `match-${index}` }));
  const result = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', fallbackDependencies({
    fetchTeamCalendarRBFA: async () => matches,
    createLeagueEntry: async (serie, description) => {
      creates += 1;
      assert.deepEqual({ serieId: serie.serieId, name: serie.name }, {
        serieId: 'CHP_135223', name: 'Gewestelijk U6 AW',
      });
      assert.equal(description, 'Seizoen 2026-2027');
      return { id: 77, description };
    },
    addLeagueToTeamIfNotPresent: async (slug, id) => {
      links += 1; linkedSlug = slug; assert.equal(id, 77); return true;
    },
  }));
  assert.equal(creates, 1);
  assert.equal(links, 1);
  assert.equal(linkedSlug, 'RBFA-375469');
  assert.deepEqual(result.matchedSeries.map(({ serieId }) => serieId), ['CHP_135223']);
});

test('calendar fallback reuses same-season league without creating it', async () => {
  let creates = 0;
  const result = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', fallbackDependencies({
    doesEntityExist: async () => ({ id: 77, description: 'Seizoen 2026-2027' }),
    createLeagueEntry: async () => { creates += 1; },
  }));
  assert.equal(creates, 0);
  assert.equal(result.matchedSeries.length, 1);
});

test('calendar fallback never overwrites a league belonging to another season', async () => {
  let updates = 0;
  const result = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', fallbackDependencies({
    doesEntityExist: async () => ({ id: 77, description: 'Seizoen 2025-2026' }),
    updateLeagueEntry: async () => { updates += 1; },
  }));
  assert.equal(updates, 0);
  assert.deepEqual(result.matchedSeries, []);
});

test('calendar fallback validates series type, selected team, season and season part', () => {
  assert.deepEqual(parseSeasonPeriod('Seizoen 2026-2027'), {
    start: new Date('2026-07-01T00:00:00.000Z'),
    end: new Date('2027-06-30T23:59:59.999Z'),
  });
  assert.equal(parseSeasonPeriod('current season'), null);
  assert.equal(parseSeasonPeriod('Seizoen 2026-2028'), null);
  assert.equal(matchesSeasonPart('Gewestelijk U6 AW', 'deel1'), true);
  assert.equal(matchesSeasonPart('Gewestelijk U6 AW', 'deel2'), false);
  assert.equal(matchesSeasonPart('2-Gewestelijk U6 AW', 'deel2'), true);

  const valid = deriveOfficialSeriesFromCalendar([fallbackMatch()], fallbackTeam, 'Seizoen 2026-2027', 'deel1');
  assert.deepEqual(valid.map(({ serieId }) => serieId), ['CHP_135223']);
  for (const invalidMatch of [
    fallbackMatch({ series: { id: 'FRN_1', name: 'Friendly' } }),
    fallbackMatch({ series: { id: 'OTHER_1', name: 'Unknown' } }),
    fallbackMatch({ homeTeam: { id: 1 }, awayTeam: { id: 2 } }),
    fallbackMatch({ startTime: '2025-09-01T10:00:00Z' }),
  ]) {
    assert.deepEqual(deriveOfficialSeriesFromCalendar(
      [invalidMatch], fallbackTeam, 'Seizoen 2026-2027', 'deel1', () => {}
    ), []);
  }
  assert.deepEqual(deriveOfficialSeriesFromCalendar(
    [fallbackMatch()], fallbackTeam, 'not parseable', 'deel1', () => {}
  ), []);
  assert.deepEqual(deriveOfficialSeriesFromCalendar(
    [fallbackMatch()], fallbackTeam, 'Seizoen 2026-2027', 'deel2', () => {}
  ), []);
  assert.deepEqual(deriveOfficialSeriesFromCalendar(
    [fallbackMatch({ series: { id: 'CHP_2', name: '2-Reeks' } })],
    fallbackTeam, 'Seizoen 2026-2027', 'deel2', () => {}
  ).map(({ serieId }) => serieId), ['CHP_2']);
});

test('calendar fallback safely excludes failed league creation and linking', async () => {
  const nullResult = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', fallbackDependencies({
    createLeagueEntry: async () => null,
  }));
  assert.deepEqual(nullResult.matchedSeries, []);

  const thrownResult = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', fallbackDependencies({
    createLeagueEntry: async () => { throw new Error('mock failure'); },
  }));
  assert.deepEqual(thrownResult.matchedSeries, []);

  const linkResult = await fetchAndProcessSeries(fallbackTeam, 'Seizoen 2026-2027', 'deel1', fallbackDependencies({
    addLeagueToTeamIfNotPresent: async () => false,
  }));
  assert.deepEqual(linkResult.matchedSeries, []);
});

test('calendar processing uses a prepared fallback league and stays idempotent', async () => {
  const entities = new Map([
    ['leagues:RBFA-CHP_135223', { id: 77, description: 'Seizoen 2026-2027' }],
    ['teams:RBFA-375469', { id: 101 }],
    ['teams:RBFA-900', { id: 202 }],
  ]);
  let eventCreates = 0;
  let calendarCreates = 0;
  let lastEventData;
  let lastCalendarData;
  const calendarMatch = () => ({
    id: 'u6b-event-1', startTime: '2026-09-01T10:00:00Z', ageGroup: 'U6',
    series: { id: 'CHP_135223', name: 'Gewestelijk U6 AW' },
    homeTeam: { id: 375469, clubId: 10, name: 'U6 B' },
    awayTeam: { id: 999, clubId: 900, name: 'Opponent' },
  });
  const dependencies = {
    fetchTeamCalendarRBFA: async () => [calendarMatch()],
    doesEntityExist: async (type, slug) => entities.get(`${type}:${slug}`) || null,
    getChildVenues: async () => [],
    createEvent: async (data) => {
      eventCreates += 1;
      lastEventData = data;
      const event = { id: 303, ...data };
      entities.set(`events:${data.slug}`, event);
      return event;
    },
    updateEvent: async (id, data) => {
      lastEventData = data;
      const event = { id, ...data };
      entities.set(`events:${data.slug}`, event);
      return event;
    },
    createCalendar: async (data) => {
      calendarCreates += 1;
      lastCalendarData = data;
      const calendar = { id: 404, ...data };
      entities.set(`calendars:${data.slug}`, calendar);
      return calendar;
    },
    updateCalendar: async (id, data) => {
      lastCalendarData = data;
      const calendar = { id, ...data };
      entities.set(`calendars:${data.slug}`, calendar);
      return calendar;
    },
  };

  await fetchAndProcessTeamCalendar(fallbackTeam, 'Seizoen 2026-2027', 381, dependencies);
  await fetchAndProcessTeamCalendar(fallbackTeam, 'Seizoen 2026-2027', 381, dependencies);

  assert.equal(eventCreates, 1);
  assert.equal(calendarCreates, 1);
  assert.deepEqual(lastEventData.leagues, [77]);
  assert.deepEqual(lastEventData.seasons, [381]);
  assert.deepEqual(lastCalendarData.events, [303]);
  assert.deepEqual(lastCalendarData.leagues, [77]);
});

test('series processing examines every selected unique series and uses update result', async () => {
  const examined = [];
  const series = [
    { serieId: 'CHP_BAD', name: 'First' },
    { serieId: 'CHP_OK', name: 'Second' },
    { serieId: 'CHP_OK', name: 'Second duplicate' },
    { serieId: 'CHP_PART2', name: '2-Excluded' },
  ];
  const result = await fetchAndProcessSeries(
    { id: 1, name: 'U8 B' },
    'Seizoen 2026-2027',
    'deel1',
    {
      fetchTeamSeriesAndRankings: async () => ({ series }),
      doesEntityExist: async (_type, slug) => ({ id: slug, description: 'old' }),
      updateLeagueEntry: async (id) => {
        examined.push(id);
        if (id === 'RBFA-CHP_BAD') throw new Error('temporary failure');
        return { id, description: 'Seizoen 2026-2027' };
      },
    }
  );
  assert.deepEqual(examined, ['RBFA-CHP_BAD', 'RBFA-CHP_OK']);
  assert.deepEqual(result.matchedSeries.map((item) => item.serieId), ['CHP_OK']);
});

test('friendly migration is explicit, exact and FRN-only', () => {
  assert.equal(shouldMigrateFriendlyLeague('FRN_891', 'Seizoen 2024-2025', ''), false);
  assert.equal(shouldMigrateFriendlyLeague('FRN_891', 'Seizoen 2024-2025', 'Seizoen 2024-2025'), true);
  assert.equal(shouldMigrateFriendlyLeague('FRN_891', 'unexpected', 'Seizoen 2024-2025'), false);
  assert.equal(shouldMigrateFriendlyLeague('CHP_134389', 'Seizoen 2024-2025', 'Seizoen 2024-2025'), false);
  assert.equal(isFriendlySeriesId('FRN_891'), true);
  assert.equal(isFriendlySeriesId('CHP_134389'), false);
});

test('calendar relation protection replaces on success and merges uniquely on failure', () => {
  const existing = { events: [1, 2], leagues: [10] };
  assert.deepEqual(protectCalendarRelations(existing, new Set([3]), new Set([11]), false), {
    events: [3], leagues: [11],
  });
  assert.deepEqual(protectCalendarRelations(existing, new Set([2, 3]), new Set([10, 11]), true), {
    events: [2, 3, 1], leagues: [10, 11],
  });
});

test('existing event payload keeps slug and relations while replacing season', () => {
  const match = {
    id: '999', startTime: '2026-08-20T12:00:00Z', ageGroup: 'U8',
    homeTeam: { id: 20, name: 'Home' }, awayTeam: { id: 21, name: 'Away' },
  };
  const event = convertMatchToEvent(match, '999', false, null, 50, 381);
  assert.equal(event.slug, '999');
  assert.deepEqual(event.leagues, [50]);
  assert.deepEqual(event.teams, [20, 21]);
  assert.deepEqual(event.seasons, [381]);
});

test('match titles include the team letter for every age category', () => {
  const cases = [
    { ageGroup: 'U6', teamName: 'U6 A', expected: 'U6A' },
    { ageGroup: 'U8', teamName: 'U8 B', expected: 'U8B' },
    { ageGroup: 'U12', teamName: 'U12C', expected: 'U12C' },
    { ageGroup: 'U17', teamName: 'U17-D', expected: 'U17D' },
  ];

  for (const { ageGroup, teamName, expected } of cases) {
    const match = {
      id: '1000', startTime: '2026-08-20T12:00:00Z', ageGroup,
      homeTeam: { id: 20, name: 'Home' }, awayTeam: { id: 21, name: 'Away' },
    };
    const event = convertMatchToEvent(match, '1000', true, null, 50, 381, teamName);

    assert.equal(event.title, `${expected} — Home / Away`);
    assert.match(event.excerpt, new RegExp(`^${expected} —`));
  }
});

test('descriptive team names are not mistaken for a team letter', () => {
  const match = {
    id: '1001', startTime: '2026-08-20T12:00:00Z', ageGroup: 'U17',
    homeTeam: { id: 20, name: 'Home' }, awayTeam: { id: 21, name: 'Away' },
  };

  const event = convertMatchToEvent(match, '1001', false, null, 50, 381, 'U17 Provinciaal');

  assert.equal(event.title, 'U17 — Home / Away');
});
