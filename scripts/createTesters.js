#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { parseCsvFile } = require('./lib/parseCsv');
const { loadEnvFiles } = require('./sqlite-staging.cjs');
const {
  PROVISIONING_USAGE,
  parseOrganisationArg,
  resolveOrganisationId,
  checkExistingOrganisation,
  buildProfile,
} = require('./lib/organisationProvisioning');
const {
  SQLITE_PROJECT_ID,
  ZERO_CLASS_ASSIGNMENT_TABLES,
  normalizeTesterRows,
  validateActiveProgrammeAssignments,
  validateZeroClassAssignments,
  validateTesterProvisioningEnv,
} = require('./lib/testerProvisioning');

async function loadLookupMaps(admin, rows) {
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

async function findUserByEmail(admin, email) {
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

async function loadZeroClassAssignments(admin, userId) {
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

async function loadActiveProgrammeAssignments(admin, userId) {
  const { data, error } = await admin
    .from('staff_programme_assignments')
    .select('id,programme_id,school_id')
    .eq('user_id', userId)
    .is('ended_at', null);
  if (error) throw error;
  return data || [];
}

async function preflightExistingTester(admin, row, lookupMaps, userId, organisationId) {
  const { data: existingProfile, error } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const organisationCheck = checkExistingOrganisation(existingProfile, organisationId);
  if (!organisationCheck.ok) return organisationCheck;

  const programme = lookupMaps.programmesByCode.get(row.programme_code);
  const school = lookupMaps.schoolsByUid.get(row.school_uid);
  const [zeroClassAssignments, programmeAssignments] = await Promise.all([
    loadZeroClassAssignments(admin, userId),
    loadActiveProgrammeAssignments(admin, userId),
  ]);

  validateZeroClassAssignments(zeroClassAssignments);
  return {
    ok: true,
    existingProgrammeAssignment: validateActiveProgrammeAssignments(programmeAssignments, {
      programmeId: programme.id,
      schoolId: school.id,
    }),
  };
}

async function ensureActiveProgrammeAssignment(admin, row, lookupMaps, userId, existing) {
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

async function processRow(admin, row, lookupMaps, organisationId, { dryRun = false } = {}) {
  let existingUser;
  try {
    existingUser = await findUserByEmail(admin, row.email);
  } catch (error) {
    return { status: 'error', reason: `auth preflight failed: ${error.message}` };
  }

  let existingProgrammeAssignment = null;
  if (existingUser) {
    try {
      const preflight = await preflightExistingTester(
        admin,
        row,
        lookupMaps,
        existingUser.id,
        organisationId
      );
      if (!preflight.ok) return { status: 'error', reason: preflight.reason };
      existingProgrammeAssignment = preflight.existingProgrammeAssignment;
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

  const profile = buildProfile(row, lookupMaps, userId, organisationId);
  const { error: profileErr } = await admin
    .from('users')
    .upsert(profile, { onConflict: 'id', ignoreDuplicates: true });

  if (profileErr) {
    if (createdNow) await admin.auth.admin.deleteUser(userId);
    return { status: 'error', reason: `profile upsert failed: ${profileErr.message}` };
  }

  // The preflight can race another provisioner. Never update the employer:
  // this single UPDATE refreshes mutable fields only while it still matches.
  const { data: updated, error: updateError } = await admin
    .from('users')
    .update({
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      job_title_id: profile.job_title_id,
      school_id: profile.school_id,
    })
    .eq('id', userId)
    .eq('organization_id', organisationId)
    .select('id');
  if (updateError) {
    if (createdNow) await admin.auth.admin.deleteUser(userId);
    return { status: 'error', reason: `profile update failed: ${updateError.message}` };
  }
  if (!updated?.length) {
    // Another provisioner has adopted this identity under a different organisation. Never delete
    // the Auth user here, even if this run created it: deleting it would cascade to the winner's
    // profile and Programme assignment.
    return { status: 'error', reason: 'organisation_conflict' };
  }

  try {
    await ensureActiveProgrammeAssignment(
      admin,
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

async function main(args = process.argv.slice(2)) {
  const organisationSlug = parseOrganisationArg(args);
  const dryRun = args.includes('--dry-run');
  const organisationFlagIndex = args.indexOf('--organization');
  const positionalArgs = args.filter((arg, index) => (
    arg !== '--dry-run' && index !== organisationFlagIndex && index !== organisationFlagIndex + 1
  ));
  if (positionalArgs.length !== 1 || positionalArgs[0].startsWith('--')) {
    throw new Error(PROVISIONING_USAGE);
  }

  const safeEnv = validateTesterProvisioningEnv({
    ...loadEnvFiles(),
    ...process.env,
  });
  const admin = createClient(safeEnv.SUPABASE_PROJECT_URL_SQLITE, safeEnv.SUPABASE_SECRET_KEY_SQLITE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Resolve once, including dry runs, before looking up or changing any user.
  const organisationId = await resolveOrganisationId(admin, organisationSlug);
  const csvPath = path.resolve(process.cwd(), positionalArgs[0]);
  const rows = normalizeTesterRows(parseCsvFile(csvPath));
  const lookupMaps = await loadLookupMaps(admin, rows);
  console.log(`Target: masi-app-sqlite (${SQLITE_PROJECT_ID})`);
  console.log(`Organisation: ${organisationSlug}`);
  console.log(`Processing ${rows.length} row(s) from ${csvPath}`);
  console.log(`Mode: zero-class tester provisioning${dryRun ? ' (dry run)' : ''}\n`);

  const summary = { created: 0, reused: 0, 'dry-run': 0, error: 0 };

  for (const row of rows) {
    const result = await processRow(admin, row, lookupMaps, organisationId, { dryRun });
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
  return summary.error > 0 ? 1 : 0;
}

if (require.main === module) {
  main().then(exitCode => {
    process.exitCode = exitCode;
  }).catch(error => {
    if (error.message === PROVISIONING_USAGE) {
      console.error(PROVISIONING_USAGE);
      console.error('CSV: email,password,first_name,last_name,job_title_code,school_uid,programme_code,tester_type');
      console.error('tester_type must be zero_class; seeded rosters use the future Head Office importer.');
    } else {
      console.error('Fatal:', error.message || error);
    }
    process.exitCode = 1;
  });
}

module.exports = { main, processRow };
