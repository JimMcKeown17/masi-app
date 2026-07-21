#!/usr/bin/env node
/* eslint-disable no-console */

console.error(
  'scripts/loadTestUsers.js is disabled because its generic environment precedence, '
  + 'shared default password, credential output, and legacy profile shape are unsafe for '
  + 'the SQLite backend. Use scripts/createTesters.js with a reviewed CSV and --dry-run first.'
);
process.exitCode = 1;
