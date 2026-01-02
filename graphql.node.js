// Node.js version of the RBFA GraphQL client
// Uses global fetch (Node 18+) or a compatible polyfill in your runtime.

const graphqlEndpoint = 'https://datalake-prod2018.rbfa.be/graphql'; // Restored original endpoint

// Generic method to execute GraphQL queries
async function executeGraphQLQuery(queryPayload) {
  try {
    const response = await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryPayload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const jsonResponse = await response.json();

    if (jsonResponse.errors) {
      console.warn('GraphQL returned errors:', jsonResponse.errors);
      throw new Error('GraphQL query failed.');
    }

    return jsonResponse.data; // Return the data portion of the response
  } catch (error) {
    console.error('Error executing GraphQL query:', error);
    throw error;
  }
}

// Method for GetClubGrounds
export async function fetchClubGrounds(clubId, language = "nl") {
  const queryPayload = {
    operationName: "getClubGrounds",
    variables: {
      clubId: clubId,
      language: language,
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "d1f497406576d4dc34196cc133b7654084787ecbd2e316ca22ac5abc41465894",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  if (data?.clubGrounds === null) {
    console.warn(`No grounds found for club ID ${clubId}`);
    return null;
  }

  return data.clubGrounds || [];
}


// Method for fetching detailed information about a team
export async function fetchTeamDetailsRBFA(teamId) {
  const queryPayload = {
    operationName: "GetTeam",
    variables: {
      teamId: teamId, // Team ID for the query
      language: "en", // Default language
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "e16f98f7985e6b7d6553c8ca60aea3a2b65b6b84dfcabbb02b4ee55261413858",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Handle cases where the data is null
  if (data?.team === null) {
    console.warn(`No details found for team with ID ${teamId}`);
    return null;
  }

  return data?.team || {}; // Return team details or an empty object
}

// Method for fetchClubTeams
export async function fetchClubTeams() {
  const queryPayload = {
    operationName: "getClubTeams",
    variables: {
      clubId: "1892",
      language: "en",
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "79a7fb506ae28a8f7de7711dfa2dc37ac1cc8697798fe92b1ada0fffec2e6f22",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Check if data is null
  if (data?.clubTeams === null) {
    console.warn('No teams data returned. Retrying...');
    return null; // Retry mechanism is handled externally
  }

  return data?.clubTeams || [];
}

// Method for fetchTeamSeriesAndRankings
export async function fetchTeamSeriesAndRankings(team) {
  const queryPayload = {
    operationName: "getSeriesAndRankingsQuery",
    variables: {
      teamId: team.id,
      language: "en",
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "ace90f0250b37a504282e27289c62ea6a3f444ef8821f663bd1faa8e3689e358",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Check if teamSeriesAndRankings is null
  if (data?.teamSeriesAndRankings === null) {
    console.warn(`No series and rankings data for team ${team.name}`);
    return null;
  }

  return data?.teamSeriesAndRankings || {};
}

// Method for GetTeamsInSeries
export async function fetchTeamsInSeriesRBFA(seriesId) {
  const queryPayload = {
    operationName: "getTeamsInSeries",
    variables: {
      seriesId: seriesId,
      language: "en",
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "76f893e6588bb27d0e880f33cba8b64cfcf611a372f2969bc5fb65b02e5a9582", // unchanged (not yet updated)
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Check if data is null
  if (data?.teamsInSeries === null) {
    console.warn('No teams data returned. Retrying...');
    return null; // Retry mechanism is handled externally
  }

  return data?.teamsInSeries || [];
}

// Method for GetSeriesCalendar
export async function fetchSeriesCalendarRBFA(seriesId, startDate, endDate) {
  const queryPayload = {
    operationName: "GetSeriesCalendar",
    variables: {
      seriesId: seriesId,
      startDate: startDate,
      endDate: endDate,
      language: "en",
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "bfa4eaa1db45c7f401b58782ea00bb88d9d089d8b5ab4dc91611388fcd301db9",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Check if data is null
  if (data?.seriesCalendar === null) {
    console.warn('No series calendar data returned. Retrying...');
    return null;
  }

  return data?.seriesCalendar || [];
}

// Method for GetTeamCalendar
export async function fetchTeamCalendarRBFA(teamId) {
  const queryPayload = {
    operationName: "GetTeamCalendar",
    variables: {
      teamId: teamId,
      language: "en",
      sortByDate: "asc",
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "3f0441e6723b9852b4f0cff2c872f4aa674c5de2d23589efc70c7a4ffb7f6383",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Check if data is null
  if (data?.teamCalendar === null) {
    console.warn('No team calendar data returned. Retrying...');
    return null;
  }

  return data?.teamCalendar || [];
}

// Method for GetTeamMembers
export async function fetchTeamsMembersRBFA(teamId) {
  const queryPayload = {
    operationName: "GetTeamMembers",
    variables: {
      teamId: teamId,
      language: "en",
    },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "56dc902fee497db2f1697ee4dd48295ef46d097c03391fdff4b8ba501ba93ab1",
      },
    },
  };

  const data = await executeGraphQLQuery(queryPayload);

  // Check if data is null
  if (data?.teamMembers === null) {
    console.warn('No team members data returned. Retrying...');
    return null;
  }

  return data?.teamMembers || [];
}
