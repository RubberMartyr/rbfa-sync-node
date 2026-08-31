import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSeasonConfig } from '../seasonConfig.node.js';
import { fetchAndProcessSeries, isFriendlySeriesId } from '../main.node.js';
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
    { fetchTeamSeriesAndRankings: async () => ({ series: [] }) }
  );
  assert.deepEqual(result, { matchedSeries: [] });
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

test('match title includes the team letter omitted by the RBFA age group', () => {
  const match = {
    id: '1000', startTime: '2026-08-20T12:00:00Z', ageGroup: 'U8',
    homeTeam: { id: 20, name: 'Herk-De-Stad FC B 2-1' },
    awayTeam: { id: 21, name: 'WS Schoonbeek-Bilzen A 1' },
  };

  const event = convertMatchToEvent(match, '1000', true, null, 50, 381, 'U8 B');

  assert.equal(event.title, 'U8B — Herk-De-Stad FC B 2-1 / WS Schoonbeek-Bilzen A 1');
  assert.match(event.excerpt, /^U8B —/);
});
