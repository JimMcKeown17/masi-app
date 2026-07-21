#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { parseCsvFile } = require('./lib/parseCsv');
const { loadEnvFiles } = require('./sqlite-staging.cjs');
const {
  SQLITE_PROJECT_ID,
  ZERO_CLASS_ASSIGNMENT_TABLES,
  normalizeTesterRows,
  validateActiveProgrammeAssignments,
  validateZeroClassAssignments,
  validateTesterProvisioningEnv,
} = require('./lib/testerProvisioning');

const safeEnv = validateTesterProvisioningEnv({
  ...loadEnvFiles(),
  ...process.env,
});
const SUPABASE_URL = safeEnv.SUPABASE_PROJECT_URL_SQLITE;
const SERVICE_ROLE_KEY = safeEnv.SUPABASE_SECRET_KEY_SQLITE;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvArg = args.find(arg => arg !== '--dry-run');

if (!csvArg || csvArg.startsWith('--')) {
  console.error('Usage: node scripts/createTesters.js [--dry-run] <path-to-csv>');
  console.error('CSV: email,password,first_name,last_name,job_title_code,school_uid,programme_code,tester_type');
  console.error('tester_type must be zero_class; seeded rosters use the future Head Office importer.');
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvArg);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadLookupMaps(rows) {
  const jobTitleCodes = [...new Set(rows.map(row => row.job_title_code))];
  const schoolUids = [...new Set(rows.map(row => row.school_uid))];
  const programmeCodes = [...new Set(rows.map(row => row.programme_code))];

  const { data: jobTitles, error: jobError } = await admin
    .from('job_titles')
    .select('id,code,name')
    .in('code', jobTitleCodes);
  if (jobError) throw jobError;

  const { data: schools, error: schoolError } = await admin
    .from('schools')
    .select('id,school_uid,name')
    .in('school_uid', schoolUids);
  if (schoolError) throw schoolError;

  const { data: programmes, error: programmeError } = await admin
    .from('programmes')
    .select('id,code,name')
    .in('code', programmeCodes);
  if (programmeError) throw programmeError;

  const jobTitlesByCode = new Map((jobTitles || []).map(row => [row.code, row]));
  const schoolsByUid = new Map((schools || []).map(row => [row.school_uid, row]));
  const programmesByCode = new Map((programmes || []).map(row => [row.code, row]));

  const missingJobTitles = jobTitleCodes.filter(code => !jobTitlesByCode.has(code));
  const missingSchools = schoolUids.filter(uid => !schoolsByUid.has(uid));
  const missingProgrammes = programmeCodes.filter(code => !programmesByCode.has(code));
  if (missingJobTitles.length > 0 || missingSchools.length > 0 || missingProgrammes.length > 0) {
    throw new Error([
      missingJobTitles.length > 0 ? `Unknown job_title_code(s): ${missingJobTitles.join(', ')}` : null,
      missingSchools.length > 0 ? `Unknown school_uid(s): ${missingSchools.join(', ')}` : null,
      missingProgrammes.length > 0
        ? `Unknown programme_code(s): ${missingProgrammes.join(', ')}`
        : null,
    ].filter(Boolean).join('\n'));
  }

  return { jobTitlesByCode, schoolsByUid, programmesByCode };
}

async function findUserByEmail(email) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find(user => user.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

function buildProfile(row, lookupMaps, userId) {
  const jobTitle = lookupMaps.jobTitlesByCode.get(row.job_title_code);
  const school = lookupMaps.schoolsByUid.get(row.school_uid);
  const base = {
    id: userId,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    job_title_id: jobTitle.id,
    school_id: school.id,
  };
  return base;
}

async function loadZeroClassAssignments(userId) {
  const assignmentsByTable = {};
  for (const { table, userColumn } of ZERO_CLASS_ASSIGNMENT_TABLES) {
    const { data, error } = await admin
      .from(table)
      .select('id')
      .eq(userColumn, userId)
      .is('unassigned_at', null);
    if (error) throw error;
    assignmentsByTable[table] = data || [];
  }
  return assignmentsByTable;
}

async function loadActiveProgrammeAssignments(userId) {
  const { data, error } = await admin
    .from('staff_programme_assignments')
    .select('id,programme_id,school_id')
    .eq('user_id', userId)
    .is('ended_at', null);
  if (error) throw error;
  return data || [];
}

async function preflightExistingTester(row, lookupMaps, userId) {
  const programme = lookupMaps.programmesByCode.get(row.programme_code);
  const school = lookupMaps.schoolsByUid.get(row.school_uid);
  const [zeroClassAssignments, programmeAssignments] = await Promise.all([
    loadZeroClassAssignments(userId),
    loadActiveProgrammeAssignments(userId),
  ]);

  validateZeroClassAssignments(zeroClassAssignments);
  return validateActiveProgrammeAssignments(programmeAssignments, {
    programmeId: programme.id,
    schoolId: school.id,
  });
}

async function ensureActiveProgrammeAssignment(row, lookupMaps, userId, existing) {
  if (existing) {
    return 'reused';
  }

  const programme = lookupMaps.programmesByCode.get(row.programme_code);
  const school = lookupMaps.schoolsByUid.get(row.school_uid);
  const { error: insertError } = await admin
    .from('staff_programme_assignments')
    .insert({
      id: randomUUID(),
      user_id: userId,
      programme_id: programme.id,
      school_id: school.id,
    });
  if (insertError) throw insertError;
  return 'created';
}

async function processRow(row, lookupMaps) {
  let existingUser;
  try {
    existingUser = await findUserByEmail(row.email);
  } catch (error) {
    return { status: 'error', reason: `auth preflight failed: ${error.message}` };
  }

  let existingProgrammeAssignment = null;
  if (existingUser) {
    try {
      existingProgrammeAssignment = await preflightExistingTester(
        row,
        lookupMaps,
        existingUser.id
      );
    } catch (error) {
      return { status: 'error', reason: `existing-account preflight failed: ${error.message}` };
    }
  }

  if (dryRun) {
    return {
      status: 'dry-run',
      detail: existingUser ? 'would reuse compatible account' : 'would create account',
    };
  }

  let userId = existingUser?.id;
  let createdNow = false;
  if (!existingUser) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: row.email,
      password: row.password,
      email_confirm: true,
    });
    if (createError) {
      return { status: 'error', reason: `auth create failed: ${createError.message}` };
    }
    userId = created.user.id;
    createdNow = true;
  }

  const { error: profileErr } = await admin
    .from('users')
    .upsert(buildProfile(row, lookupMaps, userId), { onConflict: 'id' });

  if (profileErr) {
    if (createdNow) await admin.auth.admin.deleteUser(userId);
    return { status: 'error', reason: `profile upsert failed: ${profileErr.message}` };
  }

  try {
    await ensureActiveProgrammeAssignment(
      row,
      lookupMaps,
      userId,
      existingProgrammeAssignment
    );
  } catch (error) {
    if (createdNow) await admin.auth.admin.deleteUser(userId);
    return { status: 'error', reason: `programme assignment failed: ${error.message}` };
  }

  return { status: createdNow ? 'created' : 'reused' };
}

(async () => {
  const rows = normalizeTesterRows(parseCsvFile(csvPath));
  const lookupMaps = await loadLookupMaps(rows);
  console.log(`Target: masi-app-sqlite (${SQLITE_PROJECT_ID})`);
  console.log(`Processing ${rows.length} row(s) from ${csvPath}`);
  console.log(`Mode: zero-class tester provisioning${dryRun ? ' (dry run)' : ''}\n`);

  const summary = { created: 0, reused: 0, 'dry-run': 0, error: 0 };

  for (const row of rows) {
    const result = await processRow(row, lookupMaps);
    summary[result.status] += 1;
    const line = `line ${row.__line} ${row.email}`;
    if (result.status === 'error') {
      console.log(`[ERROR] ${line} :: ${result.reason}`);
    } else if (result.detail) {
      console.log(`[${result.status.toUpperCase()}] ${line} :: ${result.detail}`);
    } else {
      console.log(`[${result.status.toUpperCase()}] ${line}`);
    }
  }

  console.log('\nDone.');
  Object.entries(summary).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  process.exit(summary.error > 0 ? 1 : 0);
})().catch(error => {
  console.error('Fatal:', error.message || error);
  process.exit(1);
});
