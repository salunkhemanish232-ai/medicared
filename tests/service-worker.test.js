const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const source = fs.readFileSync(swPath, 'utf8');

assert.match(source, /event\.request\.mode\s*===\s*['"]navigate['"]/i, 'Service worker must prefer the network for navigation requests while online.');
assert.match(source, /fetch\(event\.request\)/i, 'Service worker should try the live network before falling back to cache.');
assert.match(source, /offline\.html/i, 'Service worker must keep a proper offline fallback path.');

console.log('SERVICE WORKER TEST: PASS');
