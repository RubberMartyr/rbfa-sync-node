import { convertTeamDataToApiFormat, convertLeagueDataToApiFormat } from './dataConverter.node.js';
import { log } from './logger.js';

const apiDomain = 'https://goldbug.be'; // Ensure this is your actual API endpoint
const username = 'ive';
const password = 'x5qd TH4O FngR XBHk yMLI V8tn';
const credentials = Buffer.from(username + ':' + password).toString('base64'); // Node.js Base64

// api.node.js
//import fetch from 'node-fetch'; // of global fetch als je die al hebt

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Minimaal deze tijd tussen 2 requests (pas aan als nodig)
const REQUEST_INTERVAL_MS = 350; // 300ms = max ~3 requests/sec

// Interne state voor de queue
let lastRequestTime = 0;
let queue = Promise.resolve();

// Deze doet de echte fetch + 429 retry
async function doFetchWithRetry(url, options = {}, maxRetries = 5) {
  const res = await fetch(url, options);

  if (res.ok) {
    return res;
  }

  if (res.status === 429 && maxRetries > 0) {
    const retryAfter = res.headers.get('Retry-After');
    const delayMs = retryAfter
      ? Number(retryAfter) * 1000
      : 1000 * Math.pow(2, 5 - maxRetries); // 1s,2s,4s,8s,…

    console.log(
      `[WARN] 429 Too Many Requests voor ${url} – opnieuw proberen over ${delayMs}ms (retries over: ${maxRetries - 1})`
    );
    await sleep(delayMs);
    return doFetchWithRetry(url, options, maxRetries - 1);
  }

  // Andere fout: laat de caller beslissen
  const body = await res.text().catch(() => '');
  throw new Error(
    `HTTP ${res.status} ${res.statusText} voor ${url}: ${body?.slice(0, 500)}`
  );
}

// Publieke functie die je overal gaat gebruiken
export function throttledFetch(url, options = {}) {
  const run = async () => {
    // Zorg dat er minimaal REQUEST_INTERVAL_MS tussen 2 requests zit
    const now = Date.now();
    const wait = Math.max(0, lastRequestTime + REQUEST_INTERVAL_MS - now);
    if (wait > 0) {
      await sleep(wait);
    }
    lastRequestTime = Date.now();

    return doFetchWithRetry(url, options);
  };

  // Hang dit request achter de vorige in de queue
  const resultPromise = queue.then(run, run);
  // Zorg dat errors de chain niet breken
  queue = resultPromise.catch(() => {});
  return resultPromise;
}

// Function to generate a slug from the name and ID
export function generateSlug(id) {
    if (!id) {
        log('Name or ID missing for slug generation', 'error');
        return ''; // Return an empty string if either is missing
    }
    return 'RBFA-'+ id;
}

export async function doesEntityExist(type, slug) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/${type}?slug=${encodeURIComponent(slug)}`;

    try {
        const response = await throttledFetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + credentials,
            },
        });

        if (!response.ok) throw new Error(`Error checking record existence: ${response.statusText}`);
        const result = await response.json();

        const exists = result.length > 0;
        if (exists) {
            log(`Entity of type "${type}" with slug "${slug}" exists.`, 'log');
            return result[0]; 
        } else {
            log(`Entity of type "${type}" with slug "${slug}" does not exist.`, 'log');
            return;
        }
     // Return true if entity exists, false otherwise
    } catch (error) {
        log('Error checking if record exists: ' + error, 'error');
        return false; // Return false in case of error
    }
}

// Function to check if an image exists for the specific team ID
export async function doesMediaExistForTeam(teamId) {

    const filename = teamId + ".jpg";
    // Use the teamId to search for the image related to that team
    const apiUrl = `${apiDomain}/wp-json/wp/v2/media?search=${encodeURIComponent(filename)}&team_id=${encodeURIComponent(teamId)}`;

    try {
        const response = await throttledFetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + credentials,
            },
        });

        if (!response.ok) throw new Error(`Error checking media existence for team: ${response.statusText}`);
        const result = await response.json();

        const exists = result.length > 0; // Check if the image exists for that team
        if (exists) {
            log(`Image for team ID ${teamId} exists:`, 'log', result[0]);
            return result[0]; // Return the media associated with the team
        } else {
            log(`Image for team ID ${teamId} does not exist.`, 'log');
            return null; // Media does not exist for the team
        }
    } catch (error) {
        log('Error checking if media exists for team: ' + error, 'error');
        return null; // Return null in case of error
    }
}

// --- tiny helpers for original team icon binding ---

// Slugify a name (e.g. "U6" -> "u6", "U10 A" -> "u10-a")
export function toSlug(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')                       // non-alnum -> dash
    .replace(/^-+|-+$/g, '');                          // trim dashes
}

// Find a WP media item by **exact slug**
export async function findMediaByExactSlug(slug) {
  try {
    const apiUrl = `${apiDomain}/wp-json/wp/v2/media?slug=${encodeURIComponent(slug)}`;
    const response = await throttledFetch(apiUrl, {
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + credentials },
    });
    if (!response.ok) throw new Error(`Error searching media: ${response.statusText}`);

    const items = await response.json();
    return items?.[0] || null; // exact slug search returns exact match or empty
  } catch (err) {
    log('Error finding media by exact slug: ' + err, 'error');
    return null;
  }
}

// Function to create a team record on WordPress, accepts the full team object
export async function createTeamRecord(team, serieId, teamSlug) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/teams`;

    try {
        const createResponse = await throttledFetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(team),
        });

        if (!createResponse.ok) throw new Error(`Error creating team: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('Team created: ' + result.slug, 'log');

        return result;
    } catch (error) {
        log('Error creating team record: ' + error, 'error');
    }
}

/**
 * Updates a team record with new data, such as assigning leagues.
 * @param {string} teamId - The ID of the team to update.
 * @param {Object} updatedData - The data to update, such as the leagues array.
 */
export async function updateTeamRecord(teamId, updatedData) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/teams/${teamId}`;

    try {
        const response = await throttledFetch(apiUrl, {
            method: 'PUT', // Use PUT or PATCH as appropriate
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(updatedData),
        });

        if (!response.ok) {
            throw new Error(`Failed to update team record. Status: ${response.status}`);
        }

        const result = await response.json();
        log('Team record updated:', 'log', result);

        return result; // Return the updated team record
    } catch (error) {
        log('Error updating team record: ' + error, 'error');
    }
}

// Function to create a league entry on WordPress, accepts the full league object
export async function createLeagueEntry(league, selectedSeasonName) {
    const leagueSlug = generateSlug(league.serieId);

     const leagueData = {
    ...convertLeagueDataToApiFormat(league),
    description: selectedSeasonName?.trim() || ''
     };

    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/Leagues`;

    try {
        const createResponse = await throttledFetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(leagueData),
        });

        if (!createResponse.ok) throw new Error(`Error creating league: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('League created:', 'log', result);

        return result;
    } catch (error) {
        log('Error creating league entry: ' + error, 'error');
    }
}

    export async function updateLeagueEntry(leagueId, updatedFields) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/leagues/${leagueId}`;

    try {
        const response = await throttledFetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + credentials,
        },
        body: JSON.stringify(updatedFields),
        });

        if (!response.ok) throw new Error(`Error updating league: ${response.statusText}`);
        const result = await response.json();
        log('League updated:', 'log', result);
        return result;
    } catch (error) {
        log('Error updating league entry: ' + error, 'error');
    }
    }

// New methods for additional endpoints:
// Fetch Seaons
export async function fetchAllSeasons() {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/seasons`;

    try {
        const response = await throttledFetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + credentials,
            },
        });

        if (!response.ok) throw new Error(`Error fetching seasons: ${response.statusText}`);
        const seasons = await response.json();
        return seasons;
    } catch (error) {
        log('Error fetching seasons: ' + error, 'error');
        return [];
    }
}

// Fetch Events
export async function fetchEvents() {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/events`;
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + credentials,
            },
        });

        if (!response.ok) throw new Error(`Error fetching events: ${response.statusText}`);
        const events = await response.json();
        log('Fetched events:', 'log', events);
        return events;
    } catch (error) {
        log('Error fetching events: ' + error, 'error');
    }
}

export async function uploadImageIfNotExists(teamId, imagePath) {
    // Generate the image filename (optional step depending on your image naming strategy)
    const filename = imagePath.split('/').pop(); // Extract the filename from the image path
    
    // Check if the image associated with the team already exists
    const existingMedia = await doesMediaExistForTeam(teamId);
    if (existingMedia) {
        log(`Image for team ID ${teamId} already exists:`, 'log', existingMedia);
        return existingMedia; // Return the existing media if the image exists
    }

    // If the image doesn't exist, proceed with the upload
    const apiUrl = `${apiDomain}/wp-json/wp/v2/media`;
    const proxyUrl = `https://jeugdherk.be/fetch.php?url=${encodeURIComponent(imagePath)}`;

    const imageFile = await fetch(proxyUrl);
    const imageBlob = await imageFile.blob();
    const mimeType = imageBlob.type; // Get MIME type (e.g., 'image/jpeg')

    const formData = new FormData();
    formData.append('file', imageBlob, teamId + ".jpg"); // Attach the file with its filename

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + credentials, // Authorization header
            },
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error uploading image: ${response.statusText}, ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        log('Image uploaded successfully:', 'log', result);

        // Optionally, associate the uploaded image with the team by updating the team data
        // This could be done here if required.

        return result; // Return the uploaded image data
    } catch (error) {
        log('Error uploading image: ' + error, 'error');
    }
}

//create venue
export async function createVenue(venueData) {
  const apiUrl = `${apiDomain}/wp-json/sportspress/v2/venues`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + credentials,
      },
      body: JSON.stringify(venueData),
    });

    if (!response.ok) throw new Error(`Error creating venue: ${response.statusText}`);
    const result = await response.json();
    log('📍 Venue aangemaakt:', 'log', result);
    return result;
  } catch (error) {
    log('❌ Fout bij aanmaken venue: ' + error, 'error');
    return null;
  }
}

// Update venue
export async function updateVenue(venueId, updatedData) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/venues/${venueId}`;
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(updatedData),
        });

        if (!response.ok) throw new Error(`Error updating event: ${response.statusText}`);
        const result = await response.json();
        log('Event updated:', 'log', result);
        return result;
    } catch (error) {
        log('Error updating event: ' + error, 'error');
    }
}

export async function getChildVenues(parentId) {
  const apiUrl = `${apiDomain}/wp-json/sportspress/v2/venues?parent=${parentId}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + credentials,
      },
    });

    if (!response.ok) throw new Error(`Error fetching child venues: ${response.statusText}`);
    const result = await response.json();
    log(`🏟️ Gevonden subterreinen voor parent ${parentId}:`, 'log', result);
    return result;
  } catch (error) {
    log('❌ Fout bij ophalen subterreinen: ' + error, 'error');
    return [];
  }
}

// Create List
export async function createListRecord(event) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/lists`;
    try {
        const createResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(event),
        });

        if (!createResponse.ok) throw new Error(`Error creating event: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('Event created:', 'log', result);
        return result;
    } catch (error) {
        log('Error creating event: ' + error, 'error');
    }
}


// Create Event
export async function createEvent(event) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/events`;
    try {
        const createResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(event),
        });

        if (!createResponse.ok) throw new Error(`Error creating event: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('Event created:', 'log', result);
        return result;
    } catch (error) {
        log('Error creating event: ' + error, 'error');
    }
}

// Update Event
export async function updateEvent(eventId, updatedData) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/events/${eventId}`;
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(updatedData),
        });

        if (!response.ok) throw new Error(`Error updating event: ${response.statusText}`);
        const result = await response.json();
        log('Event updated:', 'log', result);
        return result;
    } catch (error) {
        log('Error updating event: ' + error, 'error');
    }
}

// Fetch Calendars
export async function fetchCalendars() {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/calendars`;
    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + credentials,
            },
        });

        if (!response.ok) throw new Error(`Error fetching calendars: ${response.statusText}`);
        const calendars = await response.json();
        log('Fetched calendars:', 'log', calendars);
        return calendars;
    } catch (error) {
        log('Error fetching calendars: ' + error, 'error');
    }
}

// Create Calendar
export async function createCalendar(calendar) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/calendars`;
    try {
        const createResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(calendar),
        });

        if (!createResponse.ok) throw new Error(`Error creating calendar: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('Calendar created:', 'log', result);
        return result;
    } catch (error) {
        log('Error creating calendar: ' + error, 'error');
    }
}

// Update Calendar
export async function updateCalendar(calendarId, updatedData) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/calendars/${calendarId}`;
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(updatedData),
        });

        if (!response.ok) throw new Error(`Error updating calendar: ${response.statusText}`);
        const result = await response.json();
        log('Calendar updated:', 'log', result);
        return result;
    } catch (error) {
        log('Error updating calendar: ' + error, 'error');
    }
}

// Create Staff
export async function createStaff(staff) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/staff`;
    try {
        const createResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(staff),
        });

        if (!createResponse.ok) throw new Error(`Error creating staff: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('Staff created:', 'log', result);
        return result;
    } catch (error) {
        log('Error creating staff: ' + error, 'error');
    }
}

// Update Staff
export async function updateStaff(staffId, updatedData) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/staff/${staffId}`;
    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(updatedData),
        });

        if (!response.ok) throw new Error(`Error updating staff: ${response.statusText}`);
        const result = await response.json();
        log('Staff updated:', 'log', result);
        return result;
    } catch (error) {
        log('Error updating staff: ' + error, 'error');
    }
}

// Create Player
export async function createPlayer(player) {
    const apiUrl = `${apiDomain}/wp-json/sportspress/v2/players`;
    try {
        const createResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(player),
        });

        if (!createResponse.ok) throw new Error(`Error creating player: ${createResponse.statusText}`);
        const result = await createResponse.json();
        log('Player created:', 'log', result);
        return result;
    } catch (error) {
        log('Error creating player: ' + error, 'error');
    }
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

// Create User
export async function createUser(userData) {
    const apiUrl = `${apiDomain}/wp-json/wp/v2/users`;
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + credentials,
            },
            body: JSON.stringify(userData),
        });

        if (!response.ok) throw new Error(`Error creating user: ${response.statusText}`);
        const result = await response.json();
        log('User created:', 'log', result);
        return result;
    } catch (error) {
        log('Error creating user: ' + error, 'error');
    }
}

export async function doesUserExist(username) {
  const apiUrl = `${apiDomain}/wp-json/wp/v2/users?slug=${encodeURIComponent(username)}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + credentials,
      },
    });

    if (!response.ok) {
      throw new Error(`Error checking user existence: ${response.statusText}`);
    }

    const result = await response.json();
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    log('❌ Fout bij controleren of gebruiker bestaat: ' + error.message, 'error');
    return null;
  }
}




