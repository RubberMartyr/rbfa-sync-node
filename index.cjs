// index.cjs
const { app } = require('@azure/functions');
const { spawn } = require('child_process');
const path = require('path');

require('./src/functions/rfbaTrigger.cjs');

async function runCli(context, teamId = null, chain = false, requestUrl, seasonPart = null) {
  context.log(`Starting CLI sync... teamId = ${teamId || 'ALL'}, chain = ${chain}`);
  context.log(`ENV SELECTED_SEASON_PART (before spawn) = ${process.env.SELECTED_SEASON_PART ?? '(not set)'}`);

  const cliPath = path.join(__dirname, 'cli.js');

  const args = [cliPath];
  // Pass season part to the CLI explicitly so it won't default to deel1.
  if (seasonPart) {
    args.push(`--part=${seasonPart}`);
  }

  if (teamId) {
    args.push(`--teamId=${teamId}`);
  }
  if (chain) {
    args.push('--chain');
  }

  let nextTeamIdFromCli = null;

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (d) => {
      const text = d.toString();
      context.log(text);

      // Zoek naar "NEXT_TEAM_ID:xyz"
      const match = text.match(/NEXT_TEAM_ID:(\S+)/);
      if (match) {
        const value = match[1].trim();
        nextTeamIdFromCli = value === 'NONE' ? null : value;
      }
    });

    child.stderr.on('data', (d) => {
      context.log('[stderr] ' + d.toString());
    });

    child.on('error', (err) => {
      context.log('Child process error: ' + err.message);
      reject(err);
    });

    child.on('close', (code) => {
      resolve(code);
    });
  });

  // Chaining: volgend team aanroepen
  if (exitCode === 0 && chain && nextTeamIdFromCli) {
    try {
      const url = new URL(requestUrl);
      const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
      const nextUrl = `${baseUrl}?teamId=${encodeURIComponent(
        nextTeamIdFromCli
      )}&chain=true`;

      context.log(`Chaining to next teamId=${nextTeamIdFromCli}: ${nextUrl}`);
     
        // 🔥 Fire-and-forget: NIET awaiten
        fetch(nextUrl).catch((err) => {
        context.log('Failed to chain next call: ' + err.message);
        });
    } catch (err) {
      context.log('Failed to chain next call: ' + err.message);
    }
  } else if (exitCode === 0 && chain && !nextTeamIdFromCli) {
    context.log('No NEXT_TEAM_ID from CLI. Chain finished.');
  }

  if (exitCode === 0) {
    context.log('CLI finished successfully.');
    return {
      status: 200,
      body: `RBFA sync completed ${
        teamId ? `for teamId=${teamId}` : 'for ALL teams'
      }${chain ? ' (chain mode)' : ''}.`,
    };
  } else {
    context.log('CLI exited with code ' + exitCode);
    return {
      status: 500,
      body: `RBFA sync FAILED ${
        teamId ? `for teamId=${teamId}` : ''
      }, exit code: ${exitCode}`,
    };
  }
}

// HTTP Trigger
app.http('rfbasync', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const url = new URL(request.url);
    const teamId = url.searchParams.get('teamId');
    const chain = url.searchParams.get('chain') === 'true';
    const queryPartRaw = (url.searchParams.get('part') || '').trim().toLowerCase();
    const envPartRaw = (process.env.SELECTED_SEASON_PART || '').trim().toLowerCase();

    // Priority: query override > env var > default
    let seasonPart = queryPartRaw || envPartRaw || 'deel1';
    if (!['deel1', 'deel2'].includes(seasonPart)) {
      context.log.warn(
        `Invalid season part "${seasonPart}". Falling back to "deel1". (query="${queryPartRaw}", env="${envPartRaw}")`
      );
      seasonPart = 'deel1';
    }

    context.log(
      `HTTP request received. teamId = ${teamId || 'none'}, chain = ${chain}`
    );

    // Debug: confirm runtime env + incoming override (if any)
    context.log(`ENV SELECTED_SEASON_PART = ${process.env.SELECTED_SEASON_PART ?? '(not set)'}`);
    context.log(`Request part param = ${queryPartRaw || '(none)'}`);
    context.log(`Resolved seasonPart = ${seasonPart}`);

    return runCli(context, teamId, chain, request.url, seasonPart);
  },
});
