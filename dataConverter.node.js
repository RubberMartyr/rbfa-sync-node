import { generateSlug, doesMediaExistForTeam } from './api.node.js';

// Function to convert a team object to the required format for the WordPress API
export function convertTeamDataToApiFormat(teamData, serieId, teamSlug, playerListId) {

    const calendarSlug = `rbfa-${teamData.id}-calendar`; // Dynamisch gegenereerd
    const siteUrl = 'jeugdherk.be'; // Automatisch domein zoals 'jeugdherk.be'

    let tableHTML = "";

        // Check if playerListId is not empty (not falsy)
    if (playerListId) {
        // Create the table HTML with dynamic variables
       tableHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <tr> 
                    <td style="width: 45%; vertical-align: top;">
                        <div style="font-size: 35px;">
                        [player_list id="${playerListId}" columns="name,team" orderby="name" order="ASC"]
                        </div>
                    </td>
                    <td style="width: 55%; vertical-align: top;">
                        [image_by_title title="${teamData.clubName}"]
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding-top: 10px;">
                    <div style="padding: 12px; border: 1px solid #ddd; border-radius: 6px; background-color: #f7f7f7; font-size: 14px; line-height: 1.4;">
                        <strong style="font-size: 15px;">📅 Teamkalender</strong>
                        <p style="margin: 6px 0 10px;">Blijf op de hoogte van wedstrijden en activiteiten. Voeg deze kalender toe aan je favoriete agenda:</p>
                        <ul style="list-style: none; padding-left: 0; margin: 0;">
                            <li style="margin-bottom: 10px;">
                                👉 <a href="https://${siteUrl}/calendar/${calendarSlug}?feed=sp-ical" target="_blank" style="color: #0073aa; font-weight: 500;">
                                Download als .ics-bestand
                                </a><br>
                                <small>Voor handmatige import in Outlook of andere agenda’s.</small>
                                <div style="margin-top: 6px;">
                                    <strong>ℹ️ Tip:</strong> <a href="https://jeugdherk.be/gedeelde-outlook-agenda/" style="color:#0073aa;">Bekijk hier hoe je dit in een (gedeelde) Outlook calendar importeert</a>
                                </div>
                            </li>
                            <li style="margin-bottom: 6px;">
                                🍏 <a href="https://${siteUrl}/calendar/${calendarSlug}?feed=sp-ical" target="_blank" style="color: #0073aa; font-weight: 500;">
                                Voeg toe aan Apple Kalender
                                </a><br><small>Opent automatisch in je Apple-kalender.</small>
                            </li>
                            <li>
                                📆 <a href="http://www.google.com/calendar/render?cid=webcal%3A%2F%2F${siteUrl}%2Fcalendar%2F${calendarSlug}%3Ffeed%3Dsp-ical" target="_blank" style="color: #0073aa; font-weight: 500;">
                                Voeg toe aan Google Kalender
                                </a><br><small>Voeg toe via je Google-account.</small>
                            </li>
                        </ul>
                    </div>
                    </td>
                </tr>
            </table>
        `;
    }

    const targetData = {
        //"id": parseInt(teamData.id),  // Ensure the ID is an integer
        "date": new Date().toISOString(),  // Set the current date as the date (can be adjusted if needed)
        "date_gmt": new Date().toISOString(),  // Set the current date in GMT format
        "guid": { "rendered": `https://goldbug.be/team/${teamSlug}/` },
        "modified": new Date().toISOString(),  // Set the current date as the modified date
        "modified_gmt": new Date().toISOString(),  // Set the current date in GMT as modified
        "slug": teamSlug,  // Use the generated slug
        "status": "publish",  // Default to 'publish'
        "type": "sp_team",  // Type is 'sp_team' (assuming this is a constant)
        "link": `https://goldbug.be/team/${teamSlug}/`,  // Link to the team page
        "title": teamData.clubName || teamData.name,  // Use team name as the title
        "content": '',
        "excerpt": tableHTML,
        "author": 1,  // Default author ID (this should be set based on your system)
        "featured_media": teamData.featured_media,  // Default to 0 for no media
        "parent": 0,  // Default to 0 for no parent
        "menu_order": 0,  // Default to 0 for no specific order
        "template": "",  // No template by default+++
        "leagues": serieId ? [serieId] : [],  // Empty array for leagues
        "seasons": [],  // Empty array for seasons
        "venues": [],  // Empty array for venues
        "class_list": [
            `post-${teamData.id}`,
            "sp_team",
            "type-sp_team",
            "status-publish",
            "hentry"
        ],
        "staff": [],  // Empty staff array
        "tables": [],  // Empty tables array
        "lists": [ playerListId ],  // Empty lists array
        "events": [],  // Empty events array
        "abbreviation": "",  // Empty abbreviation field
        "url": "",  // Empty URL
        "_links": {
            "self": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/teams/${teamData.id}`
                }
            ],
            "collection": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/teams"
                }
            ],
            "about": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/types/sp_team"
                }
            ],
            "author": [
                {
                    "embeddable": true,
                    "href": "https://goldbug.be/wp-json/wp/v2/users/1"
                }
            ],
            "version-history": [
                {
                    "count": 0,
                    "href": `https://goldbug.be/wp-json/sportspress/v2/teams/${teamData.id}/revisions`
                }
            ],
            "wp:attachment": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/media?parent=${teamData.id}`
                }
            ],
            "wp:term": [
                {
                    "taxonomy": "sp_league",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/leagues?post=${teamData.id}`
                },
                {
                    "taxonomy": "sp_season",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/seasons?post=${teamData.id}`
                },
                {
                    "taxonomy": "sp_venue",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/venues?post=${teamData.id}`
                }
            ]
        }
    };

    return targetData;
}

// Function to convert a team object to the required list format for the WordPress API
export function convertTeamToListFormat(teamData, listSlug, serieId, wpTeamId) {
    const targetData = {
        //"id": parseInt(teamData.id, 10),  // Ensure the ID is an integer
        "date": new Date().toISOString(),  // Set the current date as the date
        "date_gmt": new Date().toISOString(),  // Set the current date in GMT
        "guid": { 
            "rendered": `https://goldbug.be/?post_type=sp_list&#038;p=${teamData.id}` 
        },
        "modified": new Date().toISOString(),  // Set the current date as the modified date
        "modified_gmt": new Date().toISOString(),  // Set the current date in GMT as modified
        "slug": listSlug,  // Use the generated slug for the list
        "status": "publish",  // Default to 'publish'
        "type": "sp_list",  // Type is 'sp_list' (assuming this is a constant)
        "link": `https://goldbug.be/list/${listSlug}/`,  // Link to the list page
        "title":   teamData.clubName || teamData.name,
        "content":   teamData.clubName || teamData.name,
        "author": 1,  // Default author ID
        "featured_media": 0,  // Default to 0 for no media
        "menu_order": 0,  // Default to 0 for no specific order
        "template": "",  // No template by default
        "format": "list",  // Format is 'list'
        "leagues": [ serieId ],  // Empty array for leagues
        "seasons": [],  // Empty array for seasons
        "positions": [],  // Empty array for positions
        "class_list": [
            `post-${teamData.id}`,
            "sp_list",
            "type-sp_list",
            "status-publish",
            "hentry"
        ],
        "data": {},  // Will populate with player stats dynamically
        "_links": {
            "self": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/lists/${teamData.id}`
                }
            ],
            "collection": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/lists"
                }
            ],
            "about": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/types/sp_list"
                }
            ],
            "author": [
                {
                    "embeddable": true,
                    "href": "https://goldbug.be/wp-json/wp/v2/users/1"
                }
            ],
            "wp:attachment": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/media?parent=${teamData.id}`
                }
            ],
            "wp:term": [
                {
                    "taxonomy": "sp_league",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/leagues?post=${teamData.id}`
                },
                {
                    "taxonomy": "sp_season",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/seasons?post=${teamData.id}`
                },
                {
                    "taxonomy": "sp_position",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/positions?post=${teamData.id}`
                }
            ]
        }
    };

    // Populate the 'data' field dynamically based on players' stats
    for (const playerId in teamData.players) {
        if (teamData.players.hasOwnProperty(playerId)) {
            const player = teamData.players[playerId];
            targetData.data[playerId] = {
                "name": player.name,
                "goals": player.goals || 0,
                "assists": player.assists || 0,
                "yellowcards": player.yellowcards || 0,
                "redcards": player.redcards || 0,
                "height": player.height || "-",
                "weight": player.weight || "-",
                "appearances": player.appearances || "0",
                "winratio": player.winratio || "0.00",
                "drawratio": player.drawratio || "0.00",
                "lossratio": player.lossratio || "0.00",
                "owngoals": player.owngoals || 0,
                "eventsattended": player.eventsattended || 0,
                "eventsplayed": player.eventsplayed || 0,
                "eventsstarted": player.eventsstarted || 0,
                "eventssubbed": player.eventssubbed || 0,
                "eventminutes": player.eventminutes || 0
            };
        }
    }

    return targetData;
}


  
  // Function to convert a league object to the required format for the WordPress API
export function convertLeagueDataToApiFormat(leagueData, selectedSeasonName = '') {
    const leagueSlug = generateSlug(leagueData.serieId);

    return {
      id: parseInt(leagueData.id, 10), // Convert to integer
      count: leagueData.count || 0, // Default count to 0 if not provided
      description: selectedSeasonName, // Default to empty string if no description
      link: leagueData.link || "", // Default to empty if no link
      name: leagueData.name || "", // Default to empty if no name
      slug: leagueSlug || "", // Default to empty if no slug
      taxonomy: "sp_league", // Fixed taxonomy
      parent: 0, // Default to 0
      meta: [], // Default to empty array
      _links: {
        self: [{
          href: `https://goldbug.be/wp-json/wp/v2/leagues/${leagueData.id}`
        }],
        collection: [{
          href: "https://goldbug.be/wp-json/wp/v2/leagues"
        }],
        about: [{
          href: "https://goldbug.be/wp-json/wp/v2/taxonomies/sp_league"
        }],
        "wp:post_type": [
          { href: `https://goldbug.be/wp-json/wp/v2/events?leagues=${leagueData.id}` },
          { href: `https://goldbug.be/wp-json/wp/v2/calendars?leagues=${leagueData.id}` },
          { href: `https://goldbug.be/wp-json/wp/v2/teams?leagues=${leagueData.id}` },
          { href: `https://goldbug.be/wp-json/wp/v2/tables?leagues=${leagueData.id}` },
          { href: `https://goldbug.be/wp-json/wp/v2/players?leagues=${leagueData.id}` },
          { href: `https://goldbug.be/wp-json/wp/v2/lists?leagues=${leagueData.id}` },
          { href: `https://goldbug.be/wp-json/wp/v2/staff?leagues=${leagueData.id}` }
        ]
      },
      curies: [{
        name: "wp",
        href: "https://api.w.org/{rel}",
        templated: true
      }]
    };
  }
    export function convertClubGroundToApiFormat(ground, groundSlug, parentVenueId, clubId) {
    const addressParts = [
        ground.address.streetName,
        ground.address.streetNumber,
        ground.address.postBoxNumber,
        ground.address.postalCode,
        ground.address.localityName
    ].filter(Boolean);

    const fullAddress = addressParts.join(' ').replace(/\s+/g, ' ').trim();

    // Verzamel alle competitionIds uit alle pitches
   const competitionIds = ground.pitches?.flatMap(pitch =>
        pitch.seriesForPitch?.map(serie => serie.competitionId) || []
    ) || [];

    return {
        name: ground.name,
        slug: groundSlug,
        description: clubId + ',' + competitionIds.join(', '),
        parent: parentVenueId, // ✅ include the parent venue term ID
        venue_meta: {
        address: fullAddress
        },
    };
    }

 
  
export function convertMatchToEvent(matchData, eventSlug, thuisMatch, venue, serieId, seasonId) {
  const eventId = parseInt(matchData.id, 10);
  const currentDate = new Date().toISOString();

  const pad = (n) => String(n).padStart(2, '0');
  const toLocalIsoNoZ = (input) => {
    const d = new Date(input);
    return (
      d.getFullYear() + '-' +
      pad(d.getMonth() + 1) + '-' +
      pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' +
      pad(d.getMinutes()) + ':' +
      pad(d.getSeconds())
    );
  };

  const matchStartTime = toLocalIsoNoZ(matchData.startTime);
  const plainMatchTitle =
    `${matchData.ageGroup} — ${matchData.homeTeam.name} / ${matchData.awayTeam.name}` ||
    "Unnamed Event";

  const content = thuisMatch
    ? `Zin om te helpen in de kantine? Inschrijven: https://jeugdherk.be/kantinedienst/?match=${eventSlug}`
    : plainMatchTitle;

  const excerpt = thuisMatch
    ? `${plainMatchTitle}\n\nZin om te helpen in de kantine?\nSchrijf je in via: https://jeugdherk.be/kantinedienst/?match=${eventSlug}`
    : plainMatchTitle;

  return {
    date: matchStartTime,
    modified: currentDate,
    modified_gmt: currentDate,
    slug: eventSlug,
    status: "publish",
    type: "sp_event",
    title: plainMatchTitle,
    content,
    excerpt,
    author: 1,
    featured_media: 0,
    template: "",
    format: "league",
    leagues: serieId ? [serieId] : [],
    seasons: seasonId ? [seasonId] : [],
    venues: venue ? [venue.id] : [],
    teams: [
      parseInt(matchData.homeTeam.id, 10),
      parseInt(matchData.awayTeam.id, 10),
    ],
  };
}


export function convertTeamSeriesToCalendar(teamSeriesData) {
    const calendarId = parseInt(teamSeriesData.teamId, 10);
    const slug = teamSeriesData.name.replace(/\s+/g, '-').toLowerCase();
    const currentDate = new Date().toISOString();

    return {
        //id: calendarId,
        date: currentDate,
        date_gmt: currentDate,
        guid: {
            rendered: `https://goldbug.be/calendar/${slug}/`
        },
        modified: currentDate,
        modified_gmt: currentDate,
        slug: slug,
        status: "publish",
        type: "sp_calendar",
        link: `https://goldbug.be/calendar/${slug}/`,
        title: {
            rendered: teamSeriesData.name || "Unnamed Calendar"
        },
        content: {
            rendered: "",
            protected: false
        },
        author: 1,
        featured_media: 0,
        template: "",
        format: "calendar",
        leagues: [], // Can be populated if related league data is available
        seasons: [], // Can be populated if related season data is available
        venues: [],  // Can be populated if related venue data is available
        class_list: [
            `post-${calendarId}`,
            "sp_calendar",
            "type-sp_calendar",
            "status-publish",
            "hentry"
        ],
        data: [
            {
                ID: calendarId,
                post_author: "1",
                post_date: currentDate,
                post_date_gmt: currentDate,
                post_content: "",
                post_title: teamSeriesData.name || "Unnamed Event",
                post_excerpt: "",
                post_status: "publish",
                comment_status: "closed",
                ping_status: "closed",
                post_password: "",
                post_name: slug,
                to_ping: "",
                pinged: "",
                post_modified: currentDate,
                post_modified_gmt: currentDate,
                post_content_filtered: "",
                post_parent: 0,
                guid: `https://goldbug.be/calendar/${slug}/`,
                menu_order: 0,
                post_type: "sp_calendar",
                post_mime_type: "",
                comment_count: "0",
                filter: "raw"
            }
        ],
        _links: {
            self: [
                {
                    href: `https://goldbug.be/wp-json/wp/v2/calendars/${calendarId}`
                }
            ],
            collection: [
                {
                    href: "https://goldbug.be/wp-json/wp/v2/calendars"
                }
            ],
            about: [
                {
                    href: "https://goldbug.be/wp-json/wp/v2/types/sp_calendar"
                }
            ],
            author: [
                {
                    embeddable: true,
                    href: "https://goldbug.be/wp-json/wp/v2/users/1"
                }
            ],
            curies: [
                {
                    name: "wp",
                    href: "https://api.w.org/{rel}",
                    templated: true
                }
            ]
        }
    };
}


// Function to convert a player object to the required format for the WordPress API
export function convertPlayerDataToApiFormat(playerData, playerSlug, serieId) {
    // Pak het aantal matchen uit de GraphQL-structuur (met fallbacks)
        const matches =
        parseInt(
            (playerData.statistics && playerData.statistics.numberOfMatches) ??
            playerData.appearances ?? // fallback voor oude code
            0,
            10
        ) || 0;

    const targetData = {
        "date": new Date().toISOString(),  // Set the current date as the date (can be adjusted if needed)
        "date_gmt": new Date().toISOString(),  // Set the current date in GMT format
        "guid": { "rendered": `https://goldbug.be/player/${playerSlug}/` },  // Link to the player page
        "modified": new Date().toISOString(),  // Set the current date as the modified date
        "modified_gmt": new Date().toISOString(),  // Set the current date in GMT as modified
        "slug": playerSlug,  // Use the generated slug
        "status": "publish",  // Default to 'publish'
        "type": "sp_player",  // Type is 'sp_player' (assuming this is a constant)
        "link": `https://goldbug.be/player/${playerSlug}/`,  // Link to the player page
        "title": `${playerData.firstName} ${playerData.lastName}`,  // Player's name as title
        "content": `${playerData.firstName} ${playerData.lastName}`,  // Assuming content is empty (can be filled if needed)
        "excerpt": `${playerData.firstName} ${playerData.lastName}`,
        "number": 10,
        "author": 1,  // Default author ID (this should be set based on your system)
        "featured_media": 0,  // Default to 0 for no media (if image is available, update this)
        "parent": 0,  // Default to 0 for no parent
        "menu_order": 0,  // Default to 0 for no specific order
        "template": "",  // No template by default
        "leagues": [],  // Empty array for leagues (can be populated based on requirements)
        "number": matches,
        "seasons": [],  // Empty array for seasons
        //"positions": [playerData.positionId],  // Assuming you have position ID (update as necessary)
        "class_list": [
            `post-${playerData.id}`,
            "sp_player",
            "type-sp_player",
            "status-publish",
            "hentry"
        ],
        "teams": [],  // Assuming player belongs to one or more teams
        "current_teams": [],  // Assuming current team ID
        "past_teams": [],  // Empty array for past teams
        "nationalities": [playerData.nationality],  // Assuming nationality is an array
        "metrics": [],  // Empty array for metrics (can be populated based on requirements)
        "statistics": {
            "127": [  // Assuming "127" is league ID or category
                {
                    "name": "Season",
                    "team": "Club",
                    "goals": "Goals",
                    "assists": "Assists",
                    "yellowcards": "Yellow Cards",
                    "redcards": "Red Cards",
                    "appearances": "Appearances",
                    "winratio": "Win Ratio",
                    "drawratio": "Draw Ratio",
                    "lossratio": "Loss Ratio",
                    "owngoals": "Own Goals"
                }
            ]
        },
        "_links": {
            "self": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/players/${playerData.id}`
                }
            ],
            "collection": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/players"
                }
            ],
            "about": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/types/sp_player"
                }
            ],
            "author": [
                {
                    "embeddable": true,
                    "href": "https://goldbug.be/wp-json/wp/v2/users/1"
                }
            ],
            "wp:attachment": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/media?parent=${playerData.id}`
                }
            ],
            "wp:term": [
                {
                    "taxonomy": "sp_league",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/leagues?post=${playerData.id}`
                },
                {
                    "taxonomy": "sp_season",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/seasons?post=${playerData.id}`
                },
                {
                    "taxonomy": "sp_position",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/positions?post=${playerData.id}`
                }
            ]
        }
    };

    return targetData;
}

// Function to convert staff data to the required format for the WordPress API
export function convertStaffDataToApiFormat(staffData, staffSlug) {
    const targetData = {
        "date": new Date().toISOString(),  // Set the current date as the date (can be adjusted if needed)
        "date_gmt": new Date().toISOString(),  // Set the current date in GMT format
        "guid": { "rendered": `https://goldbug.be/?post_type=sp_staff&p=${staffData.id}` },  // Link to the staff page
        "modified": new Date().toISOString(),  // Set the current date as the modified date
        "modified_gmt": new Date().toISOString(),  // Set the current date in GMT as modified
        "slug": staffSlug,  // Use the generated slug
        "status": "publish",  // Default to 'publish'
        "type": "sp_staff",  // Type is 'sp_staff'
        "link": `https://goldbug.be/staff/${staffSlug}/`,  // Link to the staff page
        "title": `${staffData.firstName} ${staffData.lastName}`,  // Staff's name as title
        "content": `${staffData.firstName} ${staffData.lastName}`,  // Staff's name as title,
        "excerpt": `${staffData.firstName} ${staffData.lastName}`,  // Staff's name as title,
        "author": 1,  // Default author ID (this should be set based on your system)
        "featured_media": 0,  // Default to 0 for no media (update if staff photo exists)
        "template": "",  // No template by default
        "leagues": [],  // Empty array for leagues (can be populated based on requirements)
        "seasons": [],  // Empty array for seasons
        //"roles": staffData.function.map(fn => fn),  // Map 'function' to 'roles' (team role/position)
        "class_list": [
            `post-${staffData.id}`,
            "sp_staff",
            "type-sp_staff",
            "status-publish",
            "hentry",
            ...staffData.function.map(fn => `sp_role-${fn.replace(/\s+/g, '-').toLowerCase()}`)  // Map staff function to roles in class list
        ],
        "teams": [],  // Empty teams array (can be populated if staff belongs to teams)
        "current_teams": [],  // Empty current teams array
        "past_teams": [],  // Empty past teams array
        "nationalities": [],  // Empty array for nationality (you can add based on data)
        "_links": {
            "self": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/staff/${staffData.id}`
                }
            ],
            "collection": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/staff"
                }
            ],
            "about": [
                {
                    "href": "https://goldbug.be/wp-json/wp/v2/types/sp_staff"
                }
            ],
            "author": [
                {
                    "embeddable": true,
                    "href": "https://goldbug.be/wp-json/wp/v2/users/1"
                }
            ],
            "wp:featuredmedia": [
                {
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/media/0`  // Update this with the actual media ID if a photo exists
                }
            ],
            "wp:attachment": [
                {
                    "href": `https://goldbug.be/wp-json/wp/v2/media?parent=${staffData.id}`
                }
            ],
            "wp:term": [
                {
                    "taxonomy": "sp_league",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/leagues?post=${staffData.id}`
                },
                {
                    "taxonomy": "sp_season",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/seasons?post=${staffData.id}`
                },
                {
                    "taxonomy": "sp_role",
                    "embeddable": true,
                    "href": `https://goldbug.be/wp-json/wp/v2/roles?post=${staffData.id}`
                }
            ],
            "curies": [
                {
                    "name": "wp",
                    "href": "https://api.w.org/{rel}",
                    "templated": true
                }
            ]
        },
        "teams": staffData.teams || [],  // Map teams if present in source data
        "current_teams": staffData.current_teams || [],  // Map current teams if present
        "past_teams": staffData.past_teams || []  // Map past teams if present
    };

    return targetData;
}






  
  
