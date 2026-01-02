// Simple server-side logger for Node.js (no JSON objects printed)
export function log(message, type = 'log') {
  const prefixMap = { log: 'INFO', warn: 'WARN', error: 'ERROR' };
  const prefix = prefixMap[type] || 'LOG';
  console.log(`[${prefix}] ${message}`);
}
