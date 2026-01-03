import { runAllTeams } from './main.node.js';

const selectedSeasonName = 'Seizoen 2024-2025';
const selectedSeasonId = 62;

// simple arg parsing: --teamId=1234 and --chain
let teamIdFilter = null;
let chain = false;
let partArg = null;

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--teamId=')) {
    teamIdFilter = arg.substring('--teamId='.length);
  }
  if (arg.startsWith('--part=')) {
    partArg = arg.substring('--part='.length).toLowerCase();
  }
  if (arg === '--chain') {
    chain = true;
  }
}

// Resolve season part:
// priority: CLI arg (--part) > env var > default
let selectedSeasonPart =
  partArg ||
  (process.env.SELECTED_SEASON_PART || '').toLowerCase() ||
  'deel1';

// Guardrails
if (!['deel1', 'deel2'].includes(selectedSeasonPart)) {
  console.warn(
    `Invalid season part "${selectedSeasonPart}". Falling back to "deel1".`
  );
  selectedSeasonPart = 'deel1';
}

console.log(
  `[CLI] selectedSeasonPart = ${selectedSeasonPart} (arg=${partArg ?? 'none'}, env=${process.env.SELECTED_SEASON_PART ?? 'none'})`
);

runAllTeams(
  selectedSeasonName,
  selectedSeasonId,
  selectedSeasonPart,
  teamIdFilter,
  { chain }   // 👈 extra options
)
  .then(() => {
    console.log('RBFA sync completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('RBFA sync failed:', err);
    process.exit(1);
  });
