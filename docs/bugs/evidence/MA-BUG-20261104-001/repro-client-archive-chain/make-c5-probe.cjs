#!/usr/bin/env node
// Writes <worktree>/src/services/__repro_c5_offlineSync.js: a copy of offlineSync.js where the
// child_ea_assignments ARCHIVE is ordered after every history table (push order 18) and its
// archive also waits on same-child history rows that failed earlier in the pass.
// Usage: node make-c5-probe.cjs <worktree> [--remove]
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const target = path.join(root, 'src/services/__repro_c5_offlineSync.js');
if (process.argv.includes('--remove')) { fs.rmSync(target, { force: true }); console.log('removed', target); process.exit(0); }
let s = fs.readFileSync(path.join(root, 'src/services/offlineSync.js'), 'utf8');
const swap = (from, to) => {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`expected exactly one match for ${JSON.stringify(from)}, found ${n}`);
  s = s.replace(from, to);
};
swap('  child_ea_assignments: 7,\n};', '  child_ea_assignments: 18, // C5 PROBE: after history (sessions 12 .. skill_mastery 17)\n};');
swap(`  child_ea_assignments: [
    'child_programme_enrollments',
    'child_class_memberships',
    'child_group_memberships',
  ],`, `  child_ea_assignments: [
    'child_programme_enrollments',
    'child_class_memberships',
    'child_group_memberships',
    'session_attendees', 'battery_runs', 'assessments', 'letter_mastery', 'skill_mastery', // C5 PROBE
  ],`);
swap(`  child_ea_assignments: {
    child_programme_enrollments: 'child_id',
    child_class_memberships: 'child_id',
    child_group_memberships: 'child_id',
  },`, `  child_ea_assignments: {
    child_programme_enrollments: 'child_id',
    child_class_memberships: 'child_id',
    child_group_memberships: 'child_id',
    session_attendees: 'child_id', battery_runs: 'child_id', assessments: 'child_id', // C5 PROBE
    letter_mastery: 'child_id', skill_mastery: 'child_id', // C5 PROBE
  },`);
fs.writeFileSync(target, s);
console.log('wrote', target);
