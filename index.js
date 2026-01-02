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

    // Same defaults as your cli.js
    const selectedSeasonPart = q.get('part') ?? 'deel1';
    const selectedSeasonName = q.get('seasonName') ?? 'Seizoen 2024-2025';
    const selectedSeasonId = Number(q.get('seasonId') ?? '62');

    context.log('Running RBFA sync with:');
    context.log('  Season part:', selectedSeasonPart);
    context.log('  Season name:', selectedSeasonName);
    context.log('  Season ID:', selectedSeasonId);

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
