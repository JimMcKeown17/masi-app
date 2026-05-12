#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCsvFile } = require('./lib/parseCsv');
const { canonicalSchoolName } = require('./lib/canonicalSchoolName');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvArg = args.find(arg => arg !== '--dry-run');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!csvArg) {
  console.error('Usage: node scripts/seedSchools.js [--dry-run] <path-to-schools-csv>');
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvArg);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PRE_FLIGHT_SQL = `
SELECT s.id, s.name, COUNT(c.id) AS class_count
FROM public.schools s
LEFT JOIN public.classes c ON c.school_id = s.id
GROUP BY s.id, s.name
ORDER BY class_count DESC, s.name;
`;

function normalizeRow(row) {
  return {
    name: row.School,
    school_uid: row['School UID'],
    school_number: row['School Number'] || null,
    school_type: row.Type || null,
    suburb: row.Suburb || null,
    coord_east: row['Coord East'] || null,
    coord_south: row['Coord South'] || null,
    google_maps_link: row['Google Maps Link'] || row['Google Maps'] || null,
    is_active: true,
  };
}

function failIfCsvInvalid(rows) {
  const missingUid = rows.filter(row => !row.school_uid);
  if (missingUid.length > 0) {
    throw new Error(`CSV contains ${missingUid.length} row(s) missing School UID`);
  }

  const byCanonical = new Map();
  rows.forEach(row => {
    const canonical = canonicalSchoolName(row.name);
    if (!canonical) {
      throw new Error(`CSV contains a row with an empty School name for UID ${row.school_uid}`);
    }
    const group = byCanonical.get(canonical) || [];
    group.push(row);
    byCanonical.set(canonical, group);
  });

  const duplicates = [...byCanonical.values()].filter(group => group.length > 1);
  if (duplicates.length > 0) {
    const detail = duplicates
      .map(group => group.map(row => `${row.name} (${row.school_uid})`).join(' | '))
      .join('\n');
    throw new Error(`CSV contains duplicate canonical school names:\n${detail}`);
  }
}

async function loadExistingSchools() {
  const { data, error } = await admin
    .from('schools')
    .select('id,name,school_uid');

  if (error) throw error;
  return data || [];
}

function buildOperations(csvRows, existingSchools) {
  const byUid = new Map();
  const byCanonical = new Map();

  existingSchools.forEach(school => {
    if (school.school_uid) byUid.set(school.school_uid, school);
    const canonical = canonicalSchoolName(school.name);
    if (canonical) byCanonical.set(canonical, school);
  });

  const updates = [];
  const inserts = [];

  csvRows.forEach(row => {
    const existingByUid = byUid.get(row.school_uid);
    if (existingByUid) {
      updates.push({ id: existingByUid.id, row, reason: 'school_uid_match' });
      return;
    }

    const existingByName = byCanonical.get(canonicalSchoolName(row.name));
    if (existingByName) {
      updates.push({ id: existingByName.id, row, reason: 'canonical_name_match' });
      return;
    }

    inserts.push(row);
  });

  return { updates, inserts };
}

async function run() {
  console.log('Pre-flight class-count query to run/review before seeding:');
  console.log(PRE_FLIGHT_SQL.trim());
  console.log('');

  const csvRows = parseCsvFile(csvPath).map(normalizeRow);
  failIfCsvInvalid(csvRows);

  const existingSchools = await loadExistingSchools();
  const { updates, inserts } = buildOperations(csvRows, existingSchools);

  console.log(`CSV rows: ${csvRows.length}`);
  console.log(`Existing schools loaded: ${existingSchools.length}`);
  console.log(`Planned updates: ${updates.length}`);
  console.log(`Planned inserts: ${inserts.length}`);

  if (dryRun) {
    console.log('\nDry run only. First 20 planned actions:');
    console.log(JSON.stringify({
      updates: updates.slice(0, 20),
      inserts: inserts.slice(0, 20),
    }, null, 2));
    return;
  }

  for (const op of updates) {
    const { error } = await admin
      .from('schools')
      .update(op.row)
      .eq('id', op.id);
    if (error) throw error;
  }

  for (const row of inserts) {
    const { error } = await admin
      .from('schools')
      .insert(row);
    if (error) throw error;
  }

  const { count, error: countError } = await admin
    .from('schools')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;

  console.log('\nDone.');
  console.log(`  updated: ${updates.length}`);
  console.log(`  inserted: ${inserts.length}`);
  console.log('  skipped: 0');
  console.log(`  total schools: ${count}`);
}

run().catch(error => {
  console.error('Fatal:', error.message || error);
  process.exit(1);
});
