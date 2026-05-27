'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
const parsed = {};

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)\s*$/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2].replace(/\r$/, '');
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    parsed[key] = value;
  }
}

function get(key, fallback = null) {
  if (process.env[key] !== undefined && process.env[key] !== '') {
    return process.env[key];
  }

  if (parsed[key] !== undefined && parsed[key] !== '') {
    return parsed[key];
  }

  return fallback;
}

module.exports = { get };
