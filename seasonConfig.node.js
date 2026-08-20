export function resolveSeasonConfig(env = process.env, requestedPart = null) {
  const selectedSeasonName = (env.SELECTED_SEASON_NAME || 'Seizoen 2026-2027').trim();
  const selectedSeasonIds = {
    deel1: Number(env.SELECTED_SEASON_ID_DEEL1 || 381),
    deel2: Number(env.SELECTED_SEASON_ID_DEEL2 || 382),
  };
  const selectedSeasonPart = (requestedPart || env.SELECTED_SEASON_PART || 'deel1')
    .trim()
    .toLowerCase();

  if (!['deel1', 'deel2'].includes(selectedSeasonPart)) {
    throw new Error(`Invalid season part: ${selectedSeasonPart}`);
  }

  const selectedSeasonId = selectedSeasonIds[selectedSeasonPart];
  if (!Number.isInteger(selectedSeasonId) || selectedSeasonId <= 0) {
    throw new Error(`Invalid season ID for ${selectedSeasonPart}: ${selectedSeasonId}`);
  }

  return {
    selectedSeasonName,
    selectedSeasonPart,
    selectedSeasonId,
    seasonMigrationFrom: (env.SEASON_MIGRATION_FROM || '').trim(),
  };
}
