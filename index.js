import { app } from '@azure/functions';
import { runAllTeams } from './main.node.js';

/**
 * HTTP function that runs the RBFA sync.
 *
 * It mirrors your CLI:
 *   cli.js → runAllTeams(seasonName, seasonId, seasonPart)
 *
 * Query parameters:
 *   ?part=deel1|deel2
 *   &seasonName=Seizoen%202024-2025
 *   &seasonId=62
 */
app.http('rfbasync', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    context.log(`RBFA HTTP function called: ${request.method} ${request.url}`);

    // Parse query parameters from the URL
    const url = new URL(request.url);
    const q = url.searchParams;

    // --- Season part selection ---
    // Priority:
    // 1) Query param (?part=deel1|deel2) for manual testing
    // 2) Azure App Setting / env var: SELECTED_SEASON_PART
    // 3) Default: deel1
    const envPartRaw = (process.env.SELECTED_SEASON_PART || '').trim().toLowerCase();
    const queryPartRaw = (q.get('part') || '').trim().toLowerCase();

    let selectedSeasonPart = queryPartRaw || envPartRaw || 'deel1';

    // Guardrails
    if (!['deel1', 'deel2'].includes(selectedSeasonPart)) {
      context.log.warn(
        `Invalid season part "${selectedSeasonPart}". Falling back to "deel1". ` +
        `(query="${queryPartRaw}", env="${envPartRaw}")`
      );
      selectedSeasonPart = 'deel1';
    }
    const selectedSeasonName = q.get('seasonName') ?? 'Seizoen 2024-2025';
    const selectedSeasonId = Number(q.get('seasonId') ?? '62');

    context.log('Running RBFA sync with:');
    context.log('  Season part:', selectedSeasonPart);
    context.log('  Season name:', selectedSeasonName);
    context.log('  Season ID:', selectedSeasonId);
    context.log('  Env SELECTED_SEASON_PART:', process.env.SELECTED_SEASON_PART ?? '(not set)');

    try {
      await runAllTeams(selectedSeasonName, selectedSeasonId, selectedSeasonPart);

      context.log('RBFA sync completed.');
      return {
        status: 200,
        body: `RBFA sync completed for part=${selectedSeasonPart}, season="${selectedSeasonName}", id=${selectedSeasonId}`
      };
    } catch (err) {
      context.log.error('RBFA sync failed:', err);
      return {
        status: 500,
        body: 'RBFA sync failed: ' + (err?.message ?? String(err))
      };
    }
  }
});
