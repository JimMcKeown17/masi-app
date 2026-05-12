#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { parseCsvFile } = require('./lib/parseCsv');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const modeArg = args.find(arg => arg.startsWith('--mode='));
const dryRun = args.includes('--dry-run');
const csvArg = args.find(arg => !arg.startsWith('--mode=') && arg !== '--dry-run');
const mode = modeArg?.split('=')[1];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars: SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!csvArg || !['transition', 'final'].includes(mode)) {
  console.error('Usage: node scripts/createTesters.js --mode=transition|final [--dry-run] <path-to-csv>');
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvArg);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function legacyUserColumnsExist() {
  const { error } = await admin
    .from('users')
    .select('assigned_school,job_title')
    .limit(0);

  if (!error) return true;
  if (error.code === 'PGRST204' || /assigned_school|job_title/i.test(error.message || '')) {
    return false;
  }
  throw error;
}

function required(value, field, rowNumber) {
  if (!value) throw new Error(`Line ${rowNumber}: missing ${field}`);
}

function normalizeRows(rows) {
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const normalized = {
      email: row.email,
      password: row.password,
      first_name: row.first_name,
      last_name: row.last_name,
      job_title_code: row.job_title_code,
      school_uid: row.school_uid,
      __line: rowNumber,
    };

    ['email', 'password', 'first_name', 'last_name', 'job_title_code', 'school_uid'].forEach(field => {
      required(normalized[field], field, rowNumber);
    });

    return normalized;
  });
}

async function loadLookupMaps(rows) {
  const jobTitleCodes = [...new Set(rows.map(row => row.job_title_code))];
  const schoolUids = [...new Set(rows.map(row => row.school_uid))];

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

  const jobTitlesByCode = new Map((jobTitles || []).map(row => [row.code, row]));
  const schoolsByUid = new Map((schools || []).map(row => [row.school_uid, row]));

  const missingJobTitles = jobTitleCodes.filter(code => !jobTitlesByCode.has(code));
  const missingSchools = schoolUids.filter(uid => !schoolsByUid.has(uid));
  if (missingJobTitles.length > 0 || missingSchools.length > 0) {
    throw new Error([
      missingJobTitles.length > 0 ? `Unknown job_title_code(s): ${missingJobTitles.join(', ')}` : null,
      missingSchools.length > 0 ? `Unknown school_uid(s): ${missingSchools.join(', ')}` : null,
    ].filter(Boolean).join('\n'));
  }

  return { jobTitlesByCode, schoolsByUid };
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
    job_title_id: jobTitle.id,
    school_id: school.id,
  };

  if (mode === 'transition') {
    return {
      ...base,
      job_title: jobTitle.name,
      assigned_school: school.name,
    };
  }

  return base;
}

async function processRow(row, lookupMaps) {
  if (dryRun) {
    return { status: 'dry-run', userId: '(not created)' };
  }

  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: row.email,
    password: row.password,
    email_confirm: true,
  });

  if (createErr) {
    const alreadyExists = /already.*registered|already exists|duplicate/i.test(createErr.message);
    if (!alreadyExists) {
      return { status: 'error', reason: `auth create failed: ${createErr.message}` };
    }
    const existing = await findUserByEmail(row.email);
    if (!existing) {
      return { status: 'error', reason: 'create said duplicate but user not found by listUsers' };
    }
    userId = existing.id;
  } else {
    userId = created.user.id;
  }

  const { error: profileErr } = await admin
    .from('users')
    .upsert(buildProfile(row, lookupMaps, userId), { onConflict: 'id' });

  if (profileErr) {
    return { status: 'error', reason: `profile upsert failed: ${profileErr.message}`, userId };
  }

  return { status: createErr ? 'reused' : 'created', userId };
}

(async () => {
  const legacyColumnsExist = await legacyUserColumnsExist();
  if (mode === 'transition' && !legacyColumnsExist) {
    throw new Error('Mode transition refused: users.assigned_school/job_title no longer exist.');
  }
  if (mode === 'final' && legacyColumnsExist) {
    throw new Error('Mode final refused: legacy users.assigned_school/job_title still exist.');
  }

  const rows = normalizeRows(parseCsvFile(csvPath));
  const lookupMaps = await loadLookupMaps(rows);
  console.log(`Processing ${rows.length} row(s) from ${csvPath}`);
  console.log(`Mode: ${mode}${dryRun ? ' (dry run)' : ''}\n`);

  const summary = { created: 0, reused: 0, 'dry-run': 0, error: 0 };

  for (const row of rows) {
    const result = await processRow(row, lookupMaps);
    summary[result.status] += 1;
    const line = `line ${row.__line} ${row.email}`;
    if (result.status === 'error') {
      console.log(`[ERROR] ${line} :: ${result.reason}`);
    } else {
      console.log(`[${result.status.toUpperCase()}] ${line} -> ${result.userId}`);
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
