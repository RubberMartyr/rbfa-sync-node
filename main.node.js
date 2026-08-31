import { fetchClubGrounds, fetchClubTeams, fetchTeamSeriesAndRankings, fetchTeamDetailsRBFA, fetchTeamsInSeriesRBFA, fetchTeamCalendarRBFA,fetchTeamsMembersRBFA } from './graphql.node.js';
import { apiDomain, credentials, createVenue, updateVenue, doesUserExist, createUser, getChildVenues, doesEntityExist, createLeagueEntry, updateLeagueEntry, createTeamRecord, createListRecord, updateListRecord, updateTeamRecord, generateSlug, createEvent, updateEvent, uploadImageIfNotExists, createPlayer, createStaff, updateStaff, createCalendar,updateCalendar, findMediaByExactSlug, toSlug } from './api.node.js';
import { log } from './logger.js';
import { convertClubGroundToApiFormat , convertMatchToEvent, convertTeamDataToApiFormat, convertStaffDataToApiFormat, convertPlayerDataToApiFormat, convertTeamToListFormat } from './dataConverter.node.js';
import { protectCalendarRelations, shouldMigrateFriendlyLeague } from './syncHelpers.node.js';

export const STAFF_FUNCTION_ROLE_MAP = Object.freeze({
  't1': ['trainer'],
  't2': ['trainer'],
  'goalkeeper coach': ['trainer'],
  'head of youth development': ['coordinator'],
  'official team delegate': ['afgevaardigde'],
  'officiële team afgevaardigde': ['afgevaardigde'],
});
const staffRolePromises = new Map();
const warnedUnknownStaffFunctions = new Set();

export function normalizeStaffFunction(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function getMappedStaffRoleSlugs(functions, warnFn = (message) => log(message, 'warn')) {
  if (!Array.isArray(functions)) return [];
  const roleSlugs = new Set();

  for (const value of functions) {
    const normalizedFunction = normalizeStaffFunction(value);
    if (!normalizedFunction) continue;
    const mappedRoles = STAFF_FUNCTION_ROLE_MAP[normalizedFunction];
    if (!mappedRoles) {
      if (!warnedUnknownStaffFunctions.has(normalizedFunction)) {
        warnedUnknownStaffFunctions.add(normalizedFunction);
        warnFn(`Unknown RBFA staff function “${value.trim()}”; preserving existing SportsPress roles.`);
      }
      continue;
    }
    mappedRoles.forEach((slug) => roleSlugs.add(slug));
  }

  return Array.from(roleSlugs);
}

// RBFA identifies a staff assignment as "<person ID>_<team ID>". Only that
// exact numeric shape is normalized so unrelated identifiers remain intact.
export function getStaffPersonId(staffId) {
  const value = String(staffId ?? '').trim();
  const match = /^(\d+)_(\d+)$/.exec(value);

  return match ? match[1] : value;
}

export function mergeStaffRoles(existingRoleIds, mappedRoleIds) {
  const normalizedRoleIds = [...(Array.isArray(existingRoleIds) ? existingRoleIds : []),
    ...(Array.isArray(mappedRoleIds) ? mappedRoleIds : [])]
        .map((roleId) => Number(roleId))
        .filter((roleId) => Number.isInteger(roleId) && roleId > 0);
  return Array.from(new Set(normalizedRoleIds));
}

async function getSportsPressRoleBySlug(slug) {
  if (!staffRolePromises.has(slug)) {
    staffRolePromises.set(slug, (async () => {
      try {
        const role = await doesEntityExist('roles', slug);
        const roleId = Number(role?.id);
        if (!Number.isInteger(roleId) || roleId <= 0) {
          log(`SportsPress role “${slug}” was not found; preserving existing roles.`, 'warn');
          return null;
        }
        log(`Found SportsPress role “${slug}” with ID ${roleId}.`, 'log');
        return roleId;
      } catch (error) {
        log(`SportsPress role “${slug}” lookup failed; preserving existing roles. ${error.message || error}`, 'warn');
        return null;
      }
    })());
  }
  return staffRolePromises.get(slug);
}

export async function resolveMappedStaffRoleIds(functions, lookupRoleId = getSportsPressRoleBySlug, warnFn) {
  const roleIds = [];
  for (const roleSlug of getMappedStaffRoleSlugs(functions, warnFn)) {
    try {
      const roleId = Number(await lookupRoleId(roleSlug));
      if (Number.isInteger(roleId) && roleId > 0) roleIds.push(roleId);
    } catch (error) {
      (warnFn || ((message) => log(message, 'warn')))(
        `SportsPress role “${roleSlug}” lookup failed; preserving existing roles. ${error.message || error}`
      );
    }
  }
  return mergeStaffRoles([], roleIds);
}


// Using fetch
export async function downloadImage(imageSrc) {
  const image = await fetch(imageSrc)
  const imageBlog = await image.blob()
  const imageURL = URL.createObjectURL(imageBlog)
}

// Update Player
export async function updatePlayer(playerId, updatedData) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/players/${playerId}`;
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(updatedData),
        });

        if (!response.ok) throw new Error(`Error updating player: ${response.statusText}`);
        const result = await response.json();
        log('Player updated:', 'log', result);
        return result;
    } catch (error) {
        log('Error updating player: ' + error, 'error');
    }
}

export function isOriginalTeamId(teamId, originalTeamId) {
  return String(teamId) === String(originalTeamId);
}

export async function createRecordIfNotExist(team, originalTeamId = '', serieSlug = '') {
  try {
    let serieId = null;

    // Get serie ID if league exists
    if (serieSlug) {
      const league = await doesEntityExist('leagues', serieSlug);
      if (league) serieId = league.id;
    }

    const isOriginalTeam = isOriginalTeamId(team.id, originalTeamId);
    const teamName = team.clubName || team.name;
    if (!teamName) {
      console.error(`Missing name for team: ${team.id}`);
      return false;
    }

     // Generate slug based on whether it's the original team
     const teamSlug = isOriginalTeam
     ? generateSlug(team.id)
     : generateSlug(serieSlug ? team.clubId : team.id);

     if (isOriginalTeam) {
      log(`Processing ${team.name} as original club team.`, 'log');
      // Make the icon slug from the **team name**: "<team-name>-icon"
      // Example: "U6" -> "u6-icon", "U10 A" -> "u10-a-icon"
      const iconSlug = `${toSlug(team.name)}-icon`;

      const media = await findMediaByExactSlug(iconSlug);
      if (media?.id) {
       team.featured_media = media.id;
       log(`Using icon ${iconSlug} with media ID ${media.id} for ${team.name}.`, 'log');
      } else {
       log(`No icon found for ${iconSlug}, preserving existing featured media.`, 'warn');
      }
    } 
    else {
      const mediaExists = team.logo ? await uploadImageIfNotExists(`${teamSlug}-logo`, team.logo) : null;
      if (mediaExists) team.featured_media = mediaExists.id;
    }

    console.log(`Processing team: ${teamName}, Slug: ${teamSlug}, Serie ID: ${serieId}`);

    // Check if team record exists
    const recordExists = await doesEntityExist('teams', teamSlug);
    const wpTeamId = recordExists?.id;
    if (recordExists) {
      console.log(`Record exists for team: ${team.name}`);
      if (serieId) {
        await addLeagueToTeamIfNotPresent(teamSlug, serieId);
      }
    }

    let listId;
    if(isOriginalTeam)
    {
      team.clubName =
        recordExists?.title?.rendered ||
        team.clubName ||
        team.name;
      const listSlug = teamSlug + '-list'
      // Check if team record exists
      let listExists = await doesEntityExist('lists', listSlug);
      if (!listExists) {
        const listData = convertTeamToListFormat(team, listSlug, serieId, wpTeamId);
        listExists = await createListRecord(listData);
        console.log(`List Record exists for team: ${team.name}`);
      }
      else {
        const listData = convertTeamToListFormat(team, listSlug, serieId, wpTeamId);
        if (!serieId) delete listData.leagues;
        delete listData.seasons;
        delete listData.positions;
        listExists = await updateListRecord(listExists.id, listData);
        console.log(`List record UPDATED for team: ${team.name}`);
      }
      listId = listExists?.id;
      if (listId) {
        log(`Using player list ${listId} for ${team.name}.`, 'log');
      } else {
        log('Player list could not be prepared; preserving existing summary.', 'warn');
      }
    }

    // Prepare team data
    const teamData = convertTeamDataToApiFormat(team, serieId, teamSlug, listId);
    if (!teamData.excerpt?.trim()) delete teamData.excerpt;
    if (!teamData.featured_media) delete teamData.featured_media;

    if (recordExists) {
      // Preserve existing manual HTML/content on the team page
      delete teamData.content;

      if (isOriginalTeam) delete teamData.title;
      if (!serieId) {
        log(`No league available yet for ${team.name}; preserving existing league assignments.`, 'log');
      }
      // Existing leagues were already merged by addLeagueToTeamIfNotPresent.
      delete teamData.leagues;

      // Do not clear SportsPress relations when this partial sync has no value for them.
      for (const relation of ['seasons', 'venues', 'staff', 'tables', 'lists', 'events']) {
        if (Array.isArray(teamData[relation]) && teamData[relation].filter(Boolean).length === 0) {
          delete teamData[relation];
        }
      }

      if (teamData.excerpt) {
        log(`Regenerated team summary for ${team.name}.`, 'log');
      }

      // Update existing team record
      await updateTeamRecord(recordExists.id, teamData);
    } else {
      // Create new team record
      const createdTeam = await createTeamRecord(teamData, serieId, teamSlug);

      console.log(`Created record for team: ${team.name}`);
    }

    processClubGrounds(team.clubId);

    return true;
  } catch (error) {
    console.error(`Error processing team: ${team.name}`, error);
    return false;
  }
}


// Function to retrieve and update team record with a new league if not already present
export async function addLeagueToTeamIfNotPresent(teamSlug, newLeagueId) {
  try {
    // Fetch the existing team record by slug
    const existingTeamRecord = await doesEntityExist('teams', teamSlug);

    if (!existingTeamRecord) {
      console.warn(`Team with slug "${teamSlug}" does not exist.`);
      return false; // Exit if team record does not exist
    }

    // Extract the current leagues array from the team record
    const currentLeagues = existingTeamRecord.leagues || [];

      // Check if the new league is valid and not already in the array
    if (!newLeagueId || currentLeagues.includes(newLeagueId)) {
      if (!newLeagueId) {
        console.log("Invalid or undefined league ID.");
      } else {
        console.log(`League ID ${newLeagueId} is already associated with team "${teamSlug}".`);
      }
      return existingTeamRecord; // Return the existing record without any changes
    }

    // Add the new league to the leagues array
    const updatedLeagues = [...currentLeagues, newLeagueId];

    // Update the team record with the updated leagues array
    const updatedRecord = {
      ...existingTeamRecord,
      leagues: updatedLeagues,
    };

    await updateTeamRecord(existingTeamRecord.id, updatedRecord); // Replace with your actual API update method
    console.log(`Added league ID ${newLeagueId} to team "${teamSlug}".`);
    return true; // Successfully added league
  } catch (error) {
    console.error(`Error adding league ID ${newLeagueId} to team "${teamSlug}":`, error);
    return false; // Return false on error
  }
}

// Function to handle fetching series and creating leagues
export async function fetchAndProcessSeries(team, selectedSeasonName, selectedSeasonPart, dependencies = {}) {

  const selectedPart = selectedSeasonPart || "deel1";

  const fetchSeries = dependencies.fetchTeamSeriesAndRankings || fetchTeamSeriesAndRankings;
  const findEntity = dependencies.doesEntityExist || doesEntityExist;
  const createLeague = dependencies.createLeagueEntry || createLeagueEntry;
  const updateLeague = dependencies.updateLeagueEntry || updateLeagueEntry;
  try {
    const seriesData = await fetchSeries(team);
    const allSeries = Array.isArray(seriesData?.series) ? seriesData.series : [];
    log(`RBFA returned ${allSeries.length} series for ${team.name}:${allSeries.length ? `\n${allSeries.map((serie) => `${serie.serieId}: ${serie.name}`).join('\n')}` : ''}`, 'log');
    if (allSeries.length === 0) {
      log(`No series data found for team "${team.name}" (RBFA returned no series).`, 'warn');
      return { matchedSeries: [] };
    }
    const selectedSeries = allSeries.filter((serie) => {
      const isDeel2 = typeof serie.name === 'string' && serie.name.startsWith('2-');
      return selectedPart === 'deel2' ? isDeel2 : !isDeel2;
    });
    log(`${selectedSeries.length} series remain for selected part ${selectedPart}`, 'log');
    if (selectedSeries.length === 0) {
      log(`RBFA series were excluded by the season-part filter for ${team.name}.`, 'warn');
      return { matchedSeries: [] };
    }

    const matchedSeries = [];
    const matchedIds = new Set();
    for (const serie of selectedSeries) {
      if (!serie?.serieId || matchedIds.has(serie.serieId)) continue;
      const serieSlug = generateSlug(serie.serieId);
      try {
        let wpLeague = await findEntity('leagues', serieSlug);
        wpLeague = wpLeague
          ? await updateLeague(wpLeague.id, { description: selectedSeasonName })
          : await createLeague(serie, selectedSeasonName);
        if (wpLeague?.id && wpLeague.description?.trim() !== selectedSeasonName) {
          wpLeague = await findEntity('leagues', serieSlug);
        }
        if (!wpLeague?.id) {
          log(`WordPress league creation/update failed for ${serie.serieId}.`, 'warn');
        } else if (wpLeague.description?.trim() !== selectedSeasonName) {
          log(`League description did not match selected season for ${serie.serieId}.`, 'warn');
        } else {
          matchedIds.add(serie.serieId);
          matchedSeries.push(serie);
          log(`Official series successfully matched: ${serie.serieId}.`, 'log');
        }
      } catch (error) {
        log(`WordPress league creation/update failed for ${serie.serieId}: ${error}`, 'warn');
      }
    }
    if (matchedSeries.length === 0) log(`No official series found for ${team.name}.`, 'warn');
    return { matchedSeries };
  } catch (error) {
    log(`Error in fetchAndProcessSeries: ${error}`, 'error');
    return { matchedSeries: [] };
  }
}

// Function to fetch Teams in Series using GraphQL (adjusted for single series)
export async function fetchTeamsInSeries(series) {
  try {
    log(`Fetching teams in series: ${series.name}`, 'log');
    
    // Fetching teams in series using the corresponding GraphQL method
    const teamsInSeriesData = await fetchTeamsInSeriesRBFA(series.serieId);
    
    if (teamsInSeriesData && teamsInSeriesData.length > 0) {
      log(`Fetched ${teamsInSeriesData.length} teams in series for ${series.name}`, 'log');
      return teamsInSeriesData; // Return the teams in series data
    } else {
      log(`No teams in series found for ${series.name}`, 'error');
      return null; // No data returned
    }
  } catch (error) {
    log(`Error fetching teams in series for ${series.name}: ${error.message}`, 'error');
    return null; // Return null on error
  }
}

export function isFriendlySeriesId(seriesId) {
  return typeof seriesId === 'string' && seriesId.startsWith('FRN_');
}

async function ensureFriendlyTeamRecord(matchTeam, selectedTeam, serieSlug) {
  const lookupId = matchTeam.id === selectedTeam.id
    ? matchTeam.id
    : matchTeam.clubId;
  const teamSlug = generateSlug(lookupId);

  if (!teamSlug) return null;

  let teamRecord = await doesEntityExist('teams', teamSlug);
  if (teamRecord) return teamRecord;

  log(`Creating missing friendly opponent ${matchTeam.name}.`, 'log');
  const created = await createRecordIfNotExist(
    matchTeam,
    selectedTeam.id,
    serieSlug
  );
  if (!created) return null;

  teamRecord = await doesEntityExist('teams', teamSlug);
  return teamRecord || null;
}


export async function fetchAndProcessTeamCalendar(team, selectedSeasonName, selectedSeasonId) {
  // Step 1: Ensure team object has the necessary data
  if (!team || !team.id || !team.name) {
      log('Invalid team object passed. Missing required properties.', 'error');
      return;
  }

  // Step 2: Fetch the team calendar data
  const teamCalendarData = await fetchTeamCalendarRBFA(team.id);
  
  if (!teamCalendarData || teamCalendarData.length === 0) {
      log(`No calendar data found for team ${team.name} (${team.id})`, 'log');
      return;
  }

  const eventIds = new Set();
  const calendarLeagueIds = new Set();
  let hadProtectedSkipOrFailure = false;
  const seasonMigrationFrom = (process.env.SEASON_MIGRATION_FROM || '').trim();

  // Step 3: Process each match in the team calendar data
  for (const match of teamCalendarData) {
    try {
    const rbfaSeriesId = match?.series?.id;
    if (!rbfaSeriesId) {
      log(`Skipping match ${match?.id} for team ${team.id} because series information is missing.`, 'warn');
      hadProtectedSkipOrFailure = true;
      continue;
    }

    const friendlyMatch = isFriendlySeriesId(rbfaSeriesId);
    const serieSlug = generateSlug(rbfaSeriesId);
    let wpLeague = await doesEntityExist('leagues', serieSlug);

    if (friendlyMatch) {
      log(`Processing friendly match ${match.id} in series ${rbfaSeriesId}.`, 'log');
      if (wpLeague) {
        const leagueDescription = wpLeague.description?.trim();
        if (shouldMigrateFriendlyLeague(rbfaSeriesId, leagueDescription, seasonMigrationFrom)) {
          log(`Migrating friendly league ${rbfaSeriesId} from "${seasonMigrationFrom}" to "${selectedSeasonName}".`, 'log');
          wpLeague = await updateLeagueEntry(wpLeague.id, { description: selectedSeasonName });
          if (wpLeague?.description?.trim() !== selectedSeasonName) {
            wpLeague = await doesEntityExist('leagues', serieSlug);
          }
        }
        const preparedDescription = wpLeague?.description?.trim();
        if (preparedDescription && preparedDescription !== selectedSeasonName) {
          log(`Skipping match ${match.id} for team ${team.id}: friendly series ${rbfaSeriesId} belongs to unexpected season "${preparedDescription}"; it was not overwritten.`, 'warn');
          hadProtectedSkipOrFailure = true;
          continue;
        }
        if (!preparedDescription) {
          wpLeague = await updateLeagueEntry(wpLeague.id, { description: selectedSeasonName });
        }
        log(`Friendly league ${rbfaSeriesId} already exists.`, 'log');
      } else {
        log(`Creating missing friendly league ${rbfaSeriesId}.`, 'log');
        wpLeague = await createLeagueEntry({
          serieId: rbfaSeriesId,
          name: match.series.name || `Oefenwedstrijden ${team.name}`,
        }, selectedSeasonName);
      }
    } else {
      const leagueDescription = wpLeague?.description?.trim();
      if (!wpLeague || leagueDescription !== selectedSeasonName) {
        log(`Skipping match ${match.id} for team ${team.id}: series ${rbfaSeriesId} is not an FRN series or a valid official league for season "${selectedSeasonName}".`, 'warn');
        hadProtectedSkipOrFailure = true;
        continue;
      }
      log(`Processing official match ${match.id} in series ${rbfaSeriesId}.`, 'log');
    }

    if (!wpLeague?.id) {
      log(`Skipping match ${match.id} for team ${team.id}: league ${rbfaSeriesId} could not be prepared.`, 'warn');
      hadProtectedSkipOrFailure = true;
      continue;
    }

    const currentWpLeagueId = wpLeague.id;
    match.series.serieId = currentWpLeagueId;

    let thuisMatch = false;
    // Generate a unique slug for the event, based on match data (e.g., date and teams)
    const eventSlug = generateSlug(match.id);

    // Check and use team.id for the awayTeam and homeTeam, otherwise use clubId
    const awayTeamId = (match.awayTeam.id === team.id) ? match.awayTeam.id : match.awayTeam.clubId;
    const homeTeamId = (match.homeTeam.id === team.id) ? match.homeTeam.id : match.homeTeam.clubId;
  
    // Generate team slugs for away and home teams based on the determined IDs
    const awayTeamSlug = generateSlug(awayTeamId);
    const homeTeamSlug = generateSlug(homeTeamId);

    // Retrieve and update team details from 'doesEntityExist' for away team
    let awayTeamRecord = await doesEntityExist('teams', awayTeamSlug);
    if (!awayTeamRecord && friendlyMatch) {
      awayTeamRecord = await ensureFriendlyTeamRecord(match.awayTeam, team, serieSlug);
    }
    if (!awayTeamRecord) {
        log(`No record found for away team: ${match.awayTeam.name}. Skipping event creation.`, 'error');
        hadProtectedSkipOrFailure = true;
        continue; // Skip event creation if away team is not found
    }

    // Retrieve and update team details from 'doesEntityExist' for home team
    let homeTeamRecord = await doesEntityExist('teams', homeTeamSlug);
    if (!homeTeamRecord && friendlyMatch) {
      homeTeamRecord = await ensureFriendlyTeamRecord(match.homeTeam, team, serieSlug);
    }
    if (!homeTeamRecord) {
        log(`No record found for home team: ${match.homeTeam.name}. Skipping event creation.`, 'error');
        hadProtectedSkipOrFailure = true;
        continue; // Skip event creation if home team is not found
    }

    thuisMatch = (match.homeTeam.id == team.id)
    // Update team IDs with the found records
    match.awayTeam.id = awayTeamRecord.id;
    match.homeTeam.id = homeTeamRecord.id;

    const groundSlug = generateSlug(match.homeTeam.clubId + `-a`);

    let venue;
    // Step 8: Check if the ground already exists
    const existingGround = await doesEntityExist('venues', groundSlug);
    if (!existingGround) {
         log(`❌ Geen bestaand terrein gevonden met slug: ${groundSlug}`, 'warn');
    } else {
      const childGrounds = await getChildVenues(existingGround.id);
      const allGrounds = [existingGround, ...childGrounds];

      venue = findGroundBySeries(allGrounds, match.series.id);

      if (venue) {
        log(`✅ Reeks ${match.series.id} hoort bij terrein: ${venue.name}`, 'log', venue);
      } else {
        log(`❌ Geen terrein gevonden voor reeks: ${match.series.id}`, 'warn');
      }
   }

    // Convert match to event format
    const eventData = convertMatchToEvent(match, eventSlug, thuisMatch, venue, currentWpLeagueId, selectedSeasonId, team.name);

    // Step 4: Check if the event already exists
    const existingEvent = await doesEntityExist('events', eventSlug);
    if (existingEvent) {
      // If the event exists, update it
      const updatedEvent = await updateEvent(existingEvent.id, eventData);
      if (updatedEvent?.id) {
        log(`Updated existing ${friendlyMatch ? 'friendly ' : ''}event ${match.id}.`, 'log');
        eventIds.add(updatedEvent.id);
        calendarLeagueIds.add(currentWpLeagueId);
      } else {
        hadProtectedSkipOrFailure = true;
      }
    } else {
      // If the event doesn't exist, create it
      const event = await createEvent(eventData);
      if (event?.id) {
        log(`Created ${friendlyMatch ? 'friendly ' : ''}event ${match.id}.`, 'log');
        eventIds.add(event.id);
        calendarLeagueIds.add(currentWpLeagueId);
      } else {
        hadProtectedSkipOrFailure = true;
      }
    }
    } catch (error) {
      hadProtectedSkipOrFailure = true;
      log(`Temporary failure while processing match ${match?.id}: ${error}`, 'error');
    }
    }

  const teamSlug = generateSlug(team.id);

  // Step 7: Create or update the calendar
  const calendarSlug = teamSlug + `-calendar`; // Unique slug for the team's calendar based on team ID
  const existingCalendar = await doesEntityExist('calendars', calendarSlug);
  if (hadProtectedSkipOrFailure && eventIds.size === 0 && existingCalendar) {
    log(`Calendar ${calendarSlug} was preserved because no source matches could be processed safely.`, 'warn');
    return existingCalendar;
  }
  const safeRelations = protectCalendarRelations(
    existingCalendar,
    eventIds,
    calendarLeagueIds,
    hadProtectedSkipOrFailure
  );
  const calendarData = {
      title: `${team.name} Calendar`, // Using team name for the calendar
      status: "publish", // ✅ This ensures it's not a draft
      leagues: safeRelations.leagues,
      events: safeRelations.events,
      slug:calendarSlug
  };

  // Step 8: Check if the calendar already exists
  if (existingCalendar) {
      // If the calendar exists, update it
      const calendar = await updateCalendar(existingCalendar.id, calendarData);
      log(`Updated calendar: ${existingCalendar.slug}`, 'log');
      return calendar;
  } else {
      // If the calendar doesn't exist, create a new one
      const calendar = await createCalendar(calendarData);
      log('Created new calendar for team.', 'log');
      return calendar;
  }
}

function findGroundBySeries(grounds, targetSeries) {
  return grounds.find(ground => {
    if (!ground.description) return false;

    // Convert comma-separated list to array, trimmed
    const seriesList = ground.description
      .split(',')
      .map(s => s.trim().toLowerCase());

    return seriesList.includes(targetSeries.toLowerCase());
  });
}

export 
async function processClubGrounds(clubId) {
  try {
    const clubGrounds = await fetchClubGrounds(clubId);
    if (!clubGrounds || clubGrounds.length === 0) return;

    for (const province of clubGrounds) {
      let parentVenueId = 0;

      for (let i = 0; i < province.grounds.length; i++) {
        const ground = province.grounds[i];
        const groundSlug = generateSlug(clubId + `-${ground.cdecmplx.replace(/\s+/g, '-')}`);
        const groundData = convertClubGroundToApiFormat(ground, groundSlug, parentVenueId, clubId);

        const existingGround = await doesEntityExist('venues', groundSlug);

        if (existingGround) {
          const updatedGround = await updateVenue(existingGround.id, groundData);
          if (updatedGround && i === 0 && updatedGround.id) {
            parentVenueId = updatedGround.id;
          }
          if (updatedGround) {
            log(`✅ Ground "${ground.name}" geüpdatet`, 'log');
          } else {
            log(`❌ Ground "${ground.name}" kon niet worden geüpdatet`, 'error');
          }
        } else {
          const newGround = await createVenue(groundData);
          if (newGround && i === 0 && newGround.id) {
            parentVenueId = newGround.id;
          }
          if (newGround) {
            log(`🆕 Ground "${ground.name}" aangemaakt`, 'log');
          } else {
            log(`❌ Ground "${ground.name}" kon niet worden aangemaakt`, 'error');
          }
        }
      }
    }
  } catch (error) {
    log(`Fout bij verwerken van club grounds: ${error.message || error}`, 'error');
  }
}

export function generateUsername(firstName, lastName) {
  if (!firstName || !lastName) return '';

  const clean = (str) =>
    str
      .normalize("NFD")                  // Remove diacritics
      .replace(/[\u0300-\u036f]/g, "")   // Normalize accents
      .replace(/[^a-zA-Z0-9]/g, "")      // Remove special characters
      .toLowerCase();

  return clean(firstName) + clean(lastName).substring(0, 3);
}

export async function ensureWordPressUserForPerson(
  person,
  personType,
  {
    doesUserExistFn = doesUserExist,
    createUserFn = createUser,
  } = {}
) {
  const firstName = person?.firstName;
  const lastName = person?.lastName;
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || '(unknown name)';
  let username = '';

  try {
    if (!firstName || !lastName) {
      throw new Error('firstName and lastName are required');
    }

    username = generateUsername(firstName, lastName);
    const existingUser = await doesUserExistFn(username);
    if (existingUser) {
      if (!Number.isInteger(existingUser.id) || existingUser.id <= 0) {
        throw new Error('existing user has no valid numeric ID');
      }

      log(`Using existing WordPress user "${username}" (ID ${existingUser.id}) for ${personType} ${displayName}`, 'log');
      return existingUser;
    }

    const createdUser = await createUserFn({
      username,
      password: lastName.toLowerCase(),
      email: `${username}@jeugdherk.com`,
      roles: ['subscriber'],
      first_name: firstName,
      last_name: lastName,
    });

    if (!Number.isInteger(createdUser?.id) || createdUser.id <= 0) {
      throw new Error('created user has no valid numeric ID');
    }

    log(`Created WordPress user "${username}" (ID ${createdUser.id}) for ${personType} ${displayName}`, 'log');
    return createdUser;
  } catch (error) {
    log(`Could not resolve WordPress user for ${personType} ${displayName} (username "${username || '(not generated)'}"): ${error.message || error}`, 'error');
    return null;
  }
}

export async function fetchTeamMembers(team, serieId) {
  try {

    // Generate slug based on whether it's the original team
    const teamSlug = generateSlug(team.id);

    // Check if team record exists
    const teamData = await doesEntityExist('teams', teamSlug);
    if (!teamData) {
      console.log(`Team Record does exists for team: ${team.id}`);
    }

    log(`Fetching team members for team: ${team.name}`, 'log');
    
    // Fetching the team members using the corresponding GraphQL method
    const teamMembersData = await fetchTeamsMembersRBFA(team.id);
    
   if (
  teamMembersData &&
  Array.isArray(teamMembersData.players) &&
  Array.isArray(teamMembersData.staff) &&
  (teamMembersData.players.length > 0 || teamMembersData.staff.length > 0)
  ) {
      log(`Fetched ${teamMembersData.players.length} players and ${teamMembersData.staff.length} staff for ${team.name}`, 'log');
      
      // Process players
      const playerPromises = teamMembersData.players.map(async (player) => {
        const playerSlug = generateSlug(player.id);

        const wordpressUser = await ensureWordPressUserForPerson(player, 'player');
        if (!wordpressUser) return;
        
        // Check if player exists
        const existingPlayer = await doesEntityExist('players', playerSlug);
        const playerData = convertPlayerDataToApiFormat(player, playerSlug, serieId, wordpressUser.id);
        
        if (existingPlayer) {
         // Update existing player
          await addPlayerOrStaffToTeamIfNotPresent(playerData, teamData.id, existingPlayer);
          await addLeagueToPlayerIfNotPresent(playerData, serieId, existingPlayer);
          await updatePlayer(existingPlayer.id, playerData);
          log(`Updated player: ${player.firstName}  ${player.lastName}`, 'log');
        } else {
          // Create new player
          await addPlayerOrStaffToTeamIfNotPresent(playerData, teamData.id);
          await addLeagueToPlayerIfNotPresent(playerData, serieId);
          await createPlayer(playerData);
          log(`Created player: ${player.firstName}  ${player.lastName}`, 'log');
        }

      });

      // Process staff **sequentieel** om 429 te vermijden
      for (const staff of teamMembersData.staff) {
        const originalStaffId = String(staff?.id ?? '').trim();
        const staffPersonId = getStaffPersonId(staff?.id);
        if (!originalStaffId || (!/^\d+$/.test(originalStaffId) && !/^\d+_\d+$/.test(originalStaffId))) {
          log(`RBFA staff assignment has an ${originalStaffId ? `unexpected ID "${originalStaffId}"` : 'missing ID'}; using the safe fallback "${staffPersonId}".`, 'warn');
        }
        if (!staffPersonId) {
          log(`Skipping RBFA staff assignment for ${staff?.firstName || ''} ${staff?.lastName || ''} because no canonical person ID is available.`, 'warn');
          continue;
        }
        if (originalStaffId !== staffPersonId) {
          log(`RBFA staff assignment ${originalStaffId} resolved to person ID ${staffPersonId}.`, 'log');
        }
        const staffSlug = generateSlug(staffPersonId);

        const wordpressUser = await ensureWordPressUserForPerson(staff, 'staff');
        if (!wordpressUser) continue;

        // Check if staff exists
        const existingStaff = await doesEntityExist('staff', staffSlug);
        log(existingStaff
          ? `Using existing canonical staff record ${staffSlug} for team ${team.name}.`
          : `Creating canonical staff record ${staffSlug}.`, 'log');
        const staffData = convertStaffDataToApiFormat(staff, staffSlug, wordpressUser.id);

        const existingRoles = Array.isArray(existingStaff?.roles) ? existingStaff.roles : [];
        if (!Array.isArray(staff.function)) {
          log('RBFA staff functions were missing or invalid; preserving existing roles.', 'warn');
          staffData.roles = mergeStaffRoles(existingRoles, []);
        } else {
          const mappedRoleIds = await resolveMappedStaffRoleIds(staff.function);
          staffData.roles = mergeStaffRoles(existingRoles, mappedRoleIds);
        }

        if (existingStaff) {
          // Update existing staff
          await addPlayerOrStaffToTeamIfNotPresent(staffData, teamData.id, existingStaff);
          await updateStaff(existingStaff.id, staffData);
          log(`Updated staff: ${staff.firstName}  ${staff.lastName}`, 'log');
        } else {
          // Create new staff
          await addPlayerOrStaffToTeamIfNotPresent(staffData, teamData.id);
          await createStaff(staffData);
          log(`Created staff: ${staff.firstName}  ${staff.lastName}`, 'log');
        }
      }

      // Wait for all player and staff promises to resolve
      await Promise.all(playerPromises);
      
      return teamMembersData; // Return the team members data
    } else {
      log(`No players or staff found for ${team.name}`, 'error');
      return null; // No data returned
    }
  } catch (error) {
    log(`Error fetching team members for ${team.name}: ${error.message}`, 'error');
    return null; // Return null on error
  }
}

export async function addPlayerOrStaffToTeamIfNotPresent(payload, teamId, existingRecord = null) {
  try {
    // Zorg dat arrays bestaan
    if (!Array.isArray(payload.teams)) payload.teams = [];
    if (!Array.isArray(payload.current_teams)) payload.current_teams = [];

    // Haal bestaande teams uit het bestaande WP-record (als we updaten)
    const normalizeTeamIds = (teamIds) => teamIds
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
    const existingTeams = Array.isArray(existingRecord?.teams) ? normalizeTeamIds(existingRecord.teams) : [];
    const existingCurrent = Array.isArray(existingRecord?.current_teams) ? normalizeTeamIds(existingRecord.current_teams) : [];
    const payloadTeams = normalizeTeamIds(payload.teams);
    const payloadCurrent = normalizeTeamIds(payload.current_teams);
    const normalizedTeamId = Number(teamId);

    if (!Number.isInteger(normalizedTeamId) || normalizedTeamId <= 0) {
      throw new Error(`Invalid WordPress team ID: ${teamId}`);
    }

    // Merge via Set om duplicaten te vermijden
    const mergedTeams = new Set([...existingTeams, ...payloadTeams]);
    const mergedCurrent = new Set([...existingCurrent, ...payloadCurrent]);

    // Voeg het nieuwe team toe
    mergedTeams.add(normalizedTeamId);
    mergedCurrent.add(normalizedTeamId);

    payload.teams = Array.from(mergedTeams);
    payload.current_teams = Array.from(mergedCurrent);

    // optioneel: payload.past_teams met rust laten of vergelijkbaar mergen indien je die gebruikt
    return true;
  } catch (error) {
    console.error(`Error associating Player/Staff with Team: ${error.message}`);
    return false;
  }
}

async function addLeagueToPlayerIfNotPresent(payload, serieId, existingRecord = null) {
  if (!serieId) return;

  if (!Array.isArray(payload.leagues)) payload.leagues = [];

  const existingLeagues = Array.isArray(existingRecord?.leagues)
    ? existingRecord.leagues
    : [];

  payload.leagues = Array.from(
    new Set([...existingLeagues, ...payload.leagues, serieId])
  );
}


export async function runAllTeams(
  selectedSeasonName,
  selectedSeasonId,
  selectedSeasonPart = "deel1",
  teamIdFilter = null,
  options = {}
) {
  try {
    staffRolePromises.clear();
    warnedUnknownStaffFunctions.clear();
    log("=== runAllTeams START ===", "log");
    log(`selectedSeasonName = ${selectedSeasonName}`, "log");
    log(`selectedSeasonId   = ${selectedSeasonId}`, "log");
    log(`selectedSeasonPart = ${selectedSeasonPart}`, "log");
    log(`teamIdFilter       = ${teamIdFilter ?? "(none)"}`, "log");
    log(`chain              = ${options?.chain ?? false}`, "log");

    const chain = options.chain === true;

    const teams = await fetchClubTeams();
    log(`fetchClubTeams() returned ${teams?.length ?? 0} teams`, "log");

    if (Array.isArray(teams) && teams.length > 0) {
      log(
        `First 5 team IDs: ${teams.slice(0, 5).map(t => `${t.id}:${t.name}`).join(", ")}`,
        "log"
      );
    }

    if (!teams || teams.length === 0) {
      log("No teams found!", "warn");
      console.log("NEXT_TEAM_ID:NONE");
      return;
    }

    const filteredTeams = teams.filter(
      (team) => team.name && team.name.startsWith("U")
    );
    log(`filteredTeams (U*) count = ${filteredTeams.length}`, "log");

    if (teamIdFilter) {
      log(
        `teamIdFilter ${teamIdFilter} in ALL teams: ${
          teams.some(t => String(t.id) === String(teamIdFilter))
        }`,
        "log"
      );

      log(
        `teamIdFilter ${teamIdFilter} in FILTERED teams: ${
          filteredTeams.some(t => String(t.id) === String(teamIdFilter))
        }`,
        "log"
      );
    }

    if (!filteredTeams.length) {
      log("No filtered teams found!", "warn");
      console.log("NEXT_TEAM_ID:NONE");
      return;
    }

    // helper om 1 team te verwerken
    const processTeam = async (team) => {
      log(`➡️ Processing team: ${team.name}`, "log");

      await createRecordIfNotExist(team, team.id);

      const seriesResult = await fetchAndProcessSeries(
        team,
        selectedSeasonName,
        selectedSeasonPart
      );
      let officialSerieSlug = null;
      if (
        !seriesResult ||
        !seriesResult.matchedSeries ||
        seriesResult.matchedSeries.length === 0
      ) {
        log(`No official series found for ${team.name}; team calendar will still be processed.`, "warn");
      } else {
        const serie = seriesResult.matchedSeries[0];
        const serieSlug = generateSlug(serie.serieId);
        officialSerieSlug = serieSlug;

        const teamsInSeries = await fetchTeamsInSeries(serie);
        if (Array.isArray(teamsInSeries)) {
          for (const seriesTeam of teamsInSeries) {
            await createRecordIfNotExist(seriesTeam, team.id, serieSlug);
          }
        }
      }

      await fetchAndProcessTeamCalendar(
        team,
        selectedSeasonName,
        selectedSeasonId
      );

      if (officialSerieSlug) {
        const wpLeague = await doesEntityExist("leagues", officialSerieSlug);
        if (wpLeague) {
          await fetchTeamMembers(team, wpLeague.id);
        }
      }

      log(`✅ Finished team ${team.name}`, "log");
    };

    // 👉 CHAIN-MODE: één team per run
    if (chain) {
      let idx;

      if (teamIdFilter) {
        idx = filteredTeams.findIndex(
          (t) => String(t.id) === String(teamIdFilter)
        );
      } else {
        idx = 0; // geen teamId → start bij eerste
      }

      if (idx === -1) {
        log(
          `teamIdFilter ${teamIdFilter} not found in filteredTeams – skipping.`,
          "warn"
        );
        console.log("NEXT_TEAM_ID:NONE");
        return;
      }

      const team = filteredTeams[idx];
      log(
        `➡️ [CHAIN] Processing single team: ${team.name} (${team.id})`,
        "log"
      );
      await processTeam(team);

      const next = filteredTeams[idx + 1];
      if (next) {
        console.log(`NEXT_TEAM_ID:${next.id}`);
      } else {
        console.log("NEXT_TEAM_ID:NONE");
      }

      return; // ❗ heel belangrijk: niet verder door alle teams lopen
    }

    // 👉 GEEN chain: normale run
    for (const team of filteredTeams) {
      if (teamIdFilter && String(team.id) !== String(teamIdFilter)) {
        log(
          `Skipping team ${team.id} (${team.name}) — does not match teamIdFilter`,
          "log"
        );
        continue;
      }

      log(`➡️ ENTERING processTeam for ${team.id} (${team.name})`, "log");
      await processTeam(team);
    }

    log("=== runAllTeams END ===", "log");
    log("🏁 All teams processed.", "log");
    console.log("NEXT_TEAM_ID:NONE");
  } catch (err) {
    console.error("Fatal error in runAllTeams:", err);
    throw err;
  }
}
