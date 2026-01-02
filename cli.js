import { runAllTeams } from './main.node.js';

const selectedSeasonPart = 'deel1';
const selectedSeasonName = 'Seizoen 2024-2025';
const selectedSeasonId = 62;

// simple arg parsing: --teamId=1234 and --chain
let teamIdFilter = null;
let chain = false;

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--teamId=')) {
    teamIdFilter = arg.substring('--teamId='.length);
  }
  if (arg === '--chain') {
    chain = true;
  }
}

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
