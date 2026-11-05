#!/usr/bin/env node
// Regenerates dispositions-1.5.0.json from the installed field client's own code.
//
// The lifecycle-compat harness must judge every server change by how the phones in the field
// react, not by how the current source would react. This script runs dispositions-probe.jest.js
// inside a throwaway checkout of the frozen client and writes what that client's classifier and
// acknowledgement rules do with each server answer.
//
// Usage (Node 20, the better-sqlite3 ABI):
//   git worktree add --detach <tmp>/wt-f002e08 f002e08
//   cp -Rc <checkout with node_modules>/node_modules <tmp>/wt-f002e08/node_modules
//   node scripts/fixtures/lifecycle-compat/generate-1.5.0-dispositions.cjs <tmp>/wt-f002e08
//   git worktree remove --force <tmp>/wt-f002e08
//
// The checkout must be at FROZEN_COMMIT. The script adds two files to it and removes them again.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FROZEN_COMMIT = 'f002e085';
const HERE = __dirname;
const OUT = path.join(HERE, 'dispositions-1.5.0.json');
const PROBE_TEST = '__tests__/__lifecycleCompatDispositionsProbe.test.js';
const PROBE_MODULE = 'src/services/__lifecycleCompatProbe_offlineSync.js';

const main = () => {
  const checkout = process.argv[2];
  assert.ok(checkout, 'usage: generate-1.5.0-dispositions.cjs <frozen client checkout>');
  const head = spawnSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  assert.equal(head.status, 0, head.stderr);
  assert.ok(
    head.stdout.trim().startsWith(FROZEN_COMMIT),
    `checkout must be at ${FROZEN_COMMIT}, found ${head.stdout.trim()}`,
  );

  const source = fs.readFileSync(path.join(checkout, 'src/services/offlineSync.js'), 'utf8');
  const exportsToAdd = `
// lifecycle-compat probe exports (generated; never committed to the frozen client)
export const __probeRunServerOperation = runServerOperation;
export const __probeArchiveServerColumns = ARCHIVE_SERVER_COLUMNS;
export const __probeDeterministicErrorCodes = DETERMINISTIC_ERROR_CODES;
export const __probeInsertOrIgnoreTables = INSERT_OR_IGNORE_TABLES;
`;
  const probeModule = path.join(checkout, PROBE_MODULE);
  const probeTest = path.join(checkout, PROBE_TEST);
  const rawOut = path.join(checkout, '__lifecycle_compat_probe_out.json');
  fs.writeFileSync(probeModule, `${source}${exportsToAdd}`);
  fs.copyFileSync(path.join(HERE, 'dispositions-probe.jest.js'), probeTest);
  try {
    const result = spawnSync('npx', [
      'jest', '--runInBand', '--ci', '--testMatch', `<rootDir>/${PROBE_TEST}`,
    ], {
      cwd: checkout,
      encoding: 'utf8',
      env: { ...process.env, LIFECYCLE_COMPAT_PROBE_OUT: rawOut },
      timeout: 300_000,
    });
    assert.equal(result.status, 0, `probe failed:\n${result.stdout}\n${result.stderr}`);
    const fixture = JSON.parse(fs.readFileSync(rawOut, 'utf8'));
    fixture.source.commit = head.stdout.trim();
    fs.writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
    process.stdout.write(`wrote ${path.relative(process.cwd(), OUT)} from ${head.stdout.trim()}\n`);
  } finally {
    fs.rmSync(probeModule, { force: true });
    fs.rmSync(probeTest, { force: true });
    fs.rmSync(rawOut, { force: true });
  }
};

main();
