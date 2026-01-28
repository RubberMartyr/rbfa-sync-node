import { fetchClubGrounds, fetchClubTeams, fetchTeamSeriesAndRankings, fetchTeamDetailsRBFA, fetchTeamsInSeriesRBFA, fetchTeamCalendarRBFA,fetchTeamsMembersRBFA } from './graphql.node.js';
import { apiDomain, credentials, createVenue, updateVenue, doesUserExist, createUser, getChildVenues, doesEntityExist, createLeagueEntry, updateLeagueEntry, createTeamRecord, createListRecord, updateListRecord, updateTeamRecord, generateSlug, createEvent, updateEvent, uploadImageIfNotExists, createPlayer, createStaff, updateStaff, createCalendar,updateCalendar, findMediaByExactSlug, toSlug } from './api.node.js';
import { log } from './logger.js';
import { convertClubGroundToApiFormat , convertMatchToEvent, convertTeamDataToApiFormat, convertStaffDataToApiFormat, convertPlayerDataToApiFormat, convertTeamToListFormat } from './dataConverter.node.js';


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

export async function createRecordIfNotExist(team, originalTeamId = '', serieSlug = '') {
  try {
    let serieId = null;

    // Get serie ID if league exists
    if (serieSlug) {
      const league = await doesEntityExist('leagues', serieSlug);
      if (league) serieId = league.id;
    }

    const isOriginalTeam = team.id === originalTeamId;
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
      // Make the icon slug from the **team name**: "<team-name>-icon"
      // Example: "U6" -> "u6-icon", "U10 A" -> "u10-a-icon"
      const iconSlug = `${toSlug(team.name)}-icon`;

      const media = await findMediaByExactSlug(iconSlug);
      if (media?.id) {
       team.featured_media = media.id;
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
      team.clubName = recordExists.title.rendered;
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
        listExists = await updateListRecord(listExists.id, listData);
        console.log(`List record UPDATED for team: ${team.name}`);
      }
      listId = listExists.id;
    }

    // Prepare team data
    const teamData = convertTeamDataToApiFormat(team, serieId, teamSlug, listId);

    if (isOriginalTeam) teamData.title = null;

    if (recordExists) {
      // Preserve existing manual HTML/content on the team page
      delete teamData.content;

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
async function fetchAndProcessSeries(team, selectedSeasonName, selectedSeasonPart) {

  const selectedPart = selectedSeasonPart || "deel1";

  try {
     const seriesData = await fetchTeamSeriesAndRankings(team);

     if (!seriesData || seriesData.series.length === 0) {
      log(`No series data found for team "${team.name}"`, 'error');
      return null;
    }

     const matchedSeries = [];

     for (const serie of seriesData.series) {
          const serieSlug = generateSlug(serie.serieId);
          const isDeel2 = serie.name.startsWith("2-");
          const shouldInclude = (selectedPart === "deel1" && !isDeel2) || (selectedPart === "deel2" && isDeel2);
          if (!shouldInclude) continue;
          let wpLeague = await doesEntityExist('leagues', serieSlug);

          if (wpLeague) {
           
                log(`🔁 Updating league ${serie.name} with new description "${selectedSeasonName}".`, 'log');
                const updated = await updateLeagueEntry(wpLeague.id, { description: selectedSeasonName });

          } else {
             // Try to create the league ONLY if it matches the selected season
                wpLeague = await createLeagueEntry(serie, selectedSeasonName);
                if (wpLeague) {
                  log(`✅ Created missing league "${serie.name}" for part "${selectedPart}".`, 'log');
                  matchedSeries.push(serie);
                } else {
                  log(`❌ Failed to create league "${serie.name}".`, 'error');
                }
          }

       if (wpLeague.description?.trim() == selectedSeasonName) {
                    matchedSeries.push(serie);
        }
      if (matchedSeries.length === 0) {
         log(`❌ Geen geldige reeksen voor "${team.name}" met filter "${selectedPart}"`, 'error');
         return { filtered: false };
      }

      for (const serie of seriesData.series) {
        const slug = generateSlug(serie.serieId);
        const league = await doesEntityExist('leagues', slug);

        if (league) {
          const description = league.description?.trim();
          if (description === selectedSeasonName) {
            matchedSeries.push(serie);
            log(`✅ League "${serie.name}" matches selected season.`, 'log');
          } else {
            log(`⚠️ League "${serie.name}" found, but does not match season (${description}).`, 'warn');
          }
        } else {
          log(`❌ League "${serie.name}" not found in WordPress.`, 'log');
        }
      }

      // ✅ Only after the loop:
      if (matchedSeries.length === 0) {
        log(`❌ No leagues matched selected season "${selectedSeasonName}"`, 'log');
        return { filtered: false };
      }

      return { matchedSeries };
      
    }
   }
    catch (error) {
    log(`Error in fetchAndProcessSeries: ${error}`, 'error');
    return null;
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


export async function fetchAndProcessTeamCalendar(team, selectedSeasonName, selectedSeasonId) {

  let serieId = null;
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

  const eventPromises = [];
  const eventsToAddToCalendar = [];

  // Step 3: Process each match in the team calendar data
  for (const match of teamCalendarData) {

    const serieSlug = generateSlug(match.series.id);

    if (serieSlug !== '') {
    let leagueExists = await doesEntityExist('leagues', serieSlug);
    const leagueDescription = leagueExists?.description?.trim();

    if (leagueExists && leagueDescription === selectedSeasonName) {
      serieId = leagueExists.id;
      match.series.serieId = leagueExists.id;
    } else {
      log(`Skipping match: League "${serieSlug}" does not match selected season "${selectedSeasonName}".`, 'log');
      continue; // ⛔ Skip this match!
    }
  }

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
    const awayTeamRecord = await doesEntityExist('teams', awayTeamSlug);
    if (!awayTeamRecord) {
        log(`No record found for away team: ${match.awayTeam.name}. Skipping event creation.`, 'error');
        continue; // Skip event creation if away team is not found
    }

    // Retrieve and update team details from 'doesEntityExist' for home team
    const homeTeamRecord = await doesEntityExist('teams', homeTeamSlug);
    if (!homeTeamRecord) {
        log(`No record found for home team: ${match.homeTeam.name}. Skipping event creation.`, 'error');
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
    const eventData = convertMatchToEvent(match, eventSlug, thuisMatch, venue, serieId, selectedSeasonId);

    // Step 4: Check if the event already exists
    const existingEvent = await doesEntityExist('events', eventSlug);
    if (existingEvent) {
      // If the event exists, update it
      eventPromises.push(
        updateEvent(existingEvent.id, eventData).then(updatedEvent => {
          log(`Updated event: ${eventSlug}`, 'log');
          eventsToAddToCalendar.push(updatedEvent);
        }).catch(error => {
          log(`Error updating event: ${error}`, 'error');
        })
      );
    } else {
      // If the event doesn't exist, create it
      eventPromises.push(
        createEvent(eventData).then(event => {
          log(`Created event: ${eventSlug}`, 'log');
          eventsToAddToCalendar.push(event);
        }).catch(error => {
          log(`Error creating event: ${error}`, 'error');
        })
      );
    }
    }

  await Promise.all(eventPromises);

  // Step 6: Wait for all events to be created (if any)
  await Promise.all(eventPromises);

  const teamSlug = generateSlug(team.id);

  // Step 7: Create or update the calendar
  const calendarSlug = teamSlug + `-calendar`; // Unique slug for the team's calendar based on team ID
  const calendarData = {
      title: `${team.name} Calendar`, // Using team name for the calendar
      status: "publish", // ✅ This ensures it's not a draft
      leagues: [serieId],
      events: Array.isArray(eventsToAddToCalendar) 
      ? eventsToAddToCalendar
          .filter(event => event && event.id !== undefined) // Ensure event is defined and has an id
          .map(event => event.id)
      : [],
      slug:calendarSlug
  };

  // Step 8: Check if the calendar already exists
  const existingCalendar = await doesEntityExist('calendars', calendarSlug);
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
        
        // Check if player exists
        const existingPlayer = await doesEntityExist('players', playerSlug);
        const playerData = convertPlayerDataToApiFormat(player, playerSlug, serieId);
        
        if (existingPlayer) {
         // Update existing player
          await addPlayerOrStaffToTeamIfNotPresent(playerData, teamData.id, existingPlayer);
          await updatePlayer(existingPlayer.id, playerData);
          log(`Updated player: ${player.firstName}  ${player.lastName}`, 'log');
        } else {
          // Create new player
          await addPlayerOrStaffToTeamIfNotPresent(playerData, teamData.id);
          await createPlayer(playerData);
          log(`Created player: ${player.firstName}  ${player.lastName}`, 'log');
        }

      const userName =  generateUsername(player.firstName, player.lastName)
      const existingUser = await doesUserExist(userName);
        if (existingUser) {
          log(`Gebruiker "${userName}" bestaat al.`, 'log');
        } else {
          const newUser = {
                              username: userName,
                              password: player.lastName.toLowerCase(),
                              email: userName + '@jeugdherk.com',
                              roles: ['subscriber'],
                              first_name: player.firstName,
                              last_name: player.lastName
                          };

          await createUser(newUser);
        }

      });

      // Process staff **sequentieel** om 429 te vermijden
      for (const staff of teamMembersData.staff) {
        const staffSlug = generateSlug(staff.id);

        // Check if staff exists
        const existingStaff = await doesEntityExist('staff', staffSlug);
        const staffData = convertStaffDataToApiFormat(staff, staffSlug);

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

async function addPlayerOrStaffToTeamIfNotPresent(payload, teamId, existingRecord = null) {
  try {
    // Zorg dat arrays bestaan
    if (!Array.isArray(payload.teams)) payload.teams = [];
    if (!Array.isArray(payload.current_teams)) payload.current_teams = [];

    // Haal bestaande teams uit het bestaande WP-record (als we updaten)
    const existingTeams = Array.isArray(existingRecord?.teams) ? existingRecord.teams : [];
    const existingCurrent = Array.isArray(existingRecord?.current_teams) ? existingRecord.current_teams : [];

    // Merge via Set om duplicaten te vermijden
    const mergedTeams = new Set([...existingTeams, ...payload.teams]);
    const mergedCurrent = new Set([...existingCurrent, ...payload.current_teams]);

    // Voeg het nieuwe team toe
    mergedTeams.add(teamId);
    mergedCurrent.add(teamId);

    payload.teams = Array.from(mergedTeams);
    payload.current_teams = Array.from(mergedCurrent);

    // optioneel: payload.past_teams met rust laten of vergelijkbaar mergen indien je die gebruikt
    return true;
  } catch (error) {
    console.error(`Error associating Player/Staff with Team: ${error.message}`);
    return false;
  }
}


export async function runAllTeams(
  selectedSeasonName,
  selectedSeasonId,
  selectedSeasonPart = "deel1",
  teamIdFilter = null,
  options = {}
) {
  try {
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

      await createRecordIfNotExist(team);

      const seriesResult = await fetchAndProcessSeries(
        team,
        selectedSeasonName,
        selectedSeasonPart
      );
      if (
        !seriesResult ||
        !seriesResult.matchedSeries ||
        seriesResult.matchedSeries.length === 0
      ) {
        log(`No matching series for ${team.name}`, "warn");
        return;
      }

      const serie = seriesResult.matchedSeries[0];
      const serieSlug = generateSlug(serie.serieId);

      const teamsInSeries = await fetchTeamsInSeries(serie);
      if (Array.isArray(teamsInSeries)) {
        for (const seriesTeam of teamsInSeries) {
          await createRecordIfNotExist(seriesTeam, team.id, serieSlug);
        }
      }

      await fetchAndProcessTeamCalendar(
        team,
        selectedSeasonName,
        selectedSeasonId
      );

      const wpLeague = await doesEntityExist("leagues", serieSlug);
      if (wpLeague) {
        await fetchTeamMembers(team, wpLeague.id);
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
