'use strict';
const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '../.env'),
  path.join(__dirname, '../.env.example'),
];

const parsed = {};

for (const f of candidates) {
  if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) {
      const key = m[1];
      const val = m[2].replace(/\r$/, '');
      if (!(key in parsed)) parsed[key] = val;
    }
  }
  break;
}

function get(key) {
  return process.env[key] || parsed[key] || null;
}

module.exports = { get };
