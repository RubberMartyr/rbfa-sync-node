export function shouldMigrateFriendlyLeague(seriesId, description, migrationFrom) {
  return Boolean(
    migrationFrom &&
    typeof seriesId === 'string' &&
    seriesId.startsWith('FRN_') &&
    (description || '').trim() === migrationFrom
  );
}

export function protectCalendarRelations(existingCalendar, eventIds, leagueIds, hadFailure) {
  const events = new Set(eventIds);
  const leagues = new Set(leagueIds);
  if (hadFailure) {
    for (const id of existingCalendar?.events || []) events.add(id);
    for (const id of existingCalendar?.leagues || []) leagues.add(id);
  }
  return { events: [...events], leagues: [...leagues] };
}
