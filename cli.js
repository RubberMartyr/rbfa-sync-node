import { runAllTeams } from './main.node.js';
import { resolveSeasonConfig } from './seasonConfig.node.js';

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

const seasonConfig = resolveSeasonConfig(process.env, selectedSeasonPart);
const { selectedSeasonName, selectedSeasonId } = seasonConfig;
selectedSeasonPart = seasonConfig.selectedSeasonPart;

console.log(`[CLI] selectedSeasonName = ${selectedSeasonName}`);
console.log(`[CLI] selectedSeasonPart = ${selectedSeasonPart}`);
console.log(`[CLI] selectedSeasonId = ${selectedSeasonId}`);

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
