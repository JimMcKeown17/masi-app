#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Opt-in staging probe for RLS SELECT visibility required by PostgREST upsert
 * and for the exact server-authoritative relationship acknowledgment snapshot.
 *
 * This script is intentionally not part of CI. It auto-loads .env / .env.local
 * and requires these masi-app-sqlite vars:
 *   - SUPABASE_PROJECT_URL_SQLITE     (https://<ref>.supabase.co)
 *   - SUPABASE_PUBLISHABLE_KEY_SQLITE (anon/publishable key — the EA client)
 *   - SUPABASE_SECRET_KEY_SQLITE      (service-role/secret key — admin seed; add from the dashboard)
 *   - SUPABASE_PROJECT_ID_SQLITE      (segygjzpujphwvrubusm)
 * Run: npm run rls:probe
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { parseEnvContent } = require('./sqlite-staging.cjs');

// Load .env / .env.local so `npm run rls:probe` works without manual exports
// (mirrors scripts/sqlite-staging.cjs). An explicit process.env value still wins.
const loadEnvFiles = (cwd = process.cwd()) => {
  const fileEnv = {};
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.join(cwd, filename);
    if (fs.existsSync(filePath)) {
      Object.assign(fileEnv, parseEnvContent(fs.readFileSync(filePath, 'utf8')));
    }
  }
  return { ...fileEnv, ...process.env };
};

const SQLITE_PROJECT_ID = 'segygjzpujphwvrubusm';
const LEGACY_PROJECT_ID = 'jcqrlwetutnpuchjoyyd';

const REQUIRED_ENV = [
  'SUPABASE_PROJECT_URL_SQLITE',
  'SUPABASE_PUBLISHABLE_KEY_SQLITE',
  'SUPABASE_SECRET_KEY_SQLITE',
  'SUPABASE_PROJECT_ID_SQLITE',
];

const PROBE_RULES = [
  {
    table: 'children',
    policy: 'children_select_created_by',
    assertion: 'created_by_self_select',
  },
  {
    table: 'classes',
    policy: 'classes_select_created_by',
    assertion: 'created_by_self_select',
  },
  {
    table: 'groups',
    policy: 'groups_select_created_by',
    assertion: 'created_by_self_select',
  },
  {
    table: 'sessions',
    policy: 'sessions_select_own_or_assigned_child_history',
    assertion: 'user_id_self_select',
  },
];

const RECONCILE_SNAPSHOT_KEYS = [
  'child_ea_assignment_ids',
  'assigned_child_ids',
  'visible_child_ids',
  'child_programme_enrollment_ids',
  'child_class_membership_ids',
  'class_ea_assignment_ids',
  'class_ids',
  'group_ea_assignment_ids',
  'group_ids',
  'child_group_membership_ids',
];

const sorted = (values) => [...values].sort();

const validateReconcileSnapshot = ({ snapshot, expected, userId, programmeId }) => {
  if (
    snapshot?.schema_version !== 1
    || snapshot?.complete !== true
    || snapshot?.user_id !== userId
    || snapshot?.active_programme_id !== programmeId
  ) {
    return false;
  }

  return RECONCILE_SNAPSHOT_KEYS.every((key) => (
    Array.isArray(snapshot[key])
    && JSON.stringify(sorted(snapshot[key])) === JSON.stringify(sorted(expected[key]))
  ));
};

const validateProbeEnv = (env) => {
  for (const key of REQUIRED_ENV) {
    if (!env[key]) {
      throw new Error(`${key} is required for the RLS visibility probe.`);
    }
  }

  if (env.SUPABASE_PROJECT_ID_SQLITE !== SQLITE_PROJECT_ID) {
    throw new Error(
      `SUPABASE_PROJECT_ID_SQLITE must be ${SQLITE_PROJECT_ID} for the RLS visibility probe.`
    );
  }

  if (env.SUPABASE_PROJECT_URL_SQLITE.includes(LEGACY_PROJECT_ID)) {
    throw new Error(`SUPABASE_PROJECT_URL_SQLITE must not target legacy project ${LEGACY_PROJECT_ID}.`);
  }

  if (!env.SUPABASE_PROJECT_URL_SQLITE.includes(SQLITE_PROJECT_ID)) {
    throw new Error(`SUPABASE_PROJECT_URL_SQLITE must contain ${SQLITE_PROJECT_ID}.`);
  }

  return env;
};

const createClient = (...args) => {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(...args);
};

const makeClient = (url, key) => createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const expectNoError = async (label, promise) => {
  const { data, error } = await promise;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
};

const buildPayload = (rule, context) => {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (rule.table === 'children') {
    return {
      id,
      first_name: 'RLS',
      last_name: 'Probe',
      reading_level: 'Word Reading',
      created_by: context.userId,
    };
  }

  if (rule.table === 'classes') {
    return {
      id,
      school_id: context.schoolId,
      name: 'RLS Probe Class',
      grade: 'R',
      created_by: context.userId,
    };
  }

  if (rule.table === 'groups') {
    return {
      id,
      name: 'RLS Probe Group',
      programme_id: context.programmeId,
      created_by: context.userId,
    };
  }

  if (rule.table === 'sessions') {
    return {
      id,
      user_id: context.userId,
      programme_id: context.programmeId,
      session_date: now.slice(0, 10),
      started_at: now,
      activities: {},
    };
  }

  throw new Error(`No probe payload builder for ${rule.table}.`);
};

const runRule = async ({ client, rule, context }) => {
  const payload = buildPayload(rule, context);
  const { data, error } = await client
    .from(rule.table)
    .upsert(payload, { onConflict: 'id' })
    .select(rule.table === 'children' ? 'id, reading_level' : 'id')
    .single();

  if (error) {
    return {
      ok: false,
      id: payload.id,
      error: error.message,
    };
  }

  const idRoundTrips = data?.id === payload.id;
  const readingLevelRoundTrips = rule.table !== 'children'
    || data?.reading_level === payload.reading_level;
  return {
    ok: idRoundTrips && readingLevelRoundTrips,
    id: payload.id,
    error: idRoundTrips && readingLevelRoundTrips
      ? null
      : 'upsert did not round-trip the expected id and reading level',
  };
};

const cleanupProbeContext = async (admin, context) => {
  if (!context) return;

  for (const table of [
    'child_group_memberships',
    'group_ea_assignments',
    'class_ea_assignments',
    'child_class_memberships',
    'child_programme_enrollments',
    'child_ea_assignments',
  ]) {
    if (context.createdIds?.[table]?.length) {
      await admin.from(table).delete().in('id', context.createdIds[table]);
    }
  }

  for (const table of ['sessions', 'groups', 'children', 'classes']) {
    if (context.createdIds?.[table]?.length) {
      await admin.from(table).delete().in('id', context.createdIds[table]);
    }
  }

  if (context.assignmentId) {
    await admin.from('staff_programme_assignments').delete().eq('id', context.assignmentId);
  }
  if (context.userId) {
    await admin.from('users').delete().eq('id', context.userId);
  }
  if (context.schoolId) {
    await admin.from('schools').delete().eq('id', context.schoolId);
  }
  if (context.programmeId) {
    await admin.from('programmes').delete().eq('id', context.programmeId);
  }
  if (context.academicYearId) {
    await admin.from('academic_years').delete().eq('id', context.academicYearId);
  }
  if (context.userId) {
    await admin.auth.admin.deleteUser(context.userId);
  }
};

const seedProbeContext = async ({ admin, anon, email, password }) => {
  const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const context = {
    schoolId: randomUUID(),
    programmeId: randomUUID(),
    assignmentId: randomUUID(),
    academicYearId: randomUUID(),
  };

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError) throw new Error(`auth user create failed: ${createError.message}`);

    context.userId = created.user.id;

    await expectNoError('school seed', admin.from('schools').insert({
      id: context.schoolId,
      school_uid: `rls-probe-${uniqueSuffix}`,
      name: `RLS Probe School ${uniqueSuffix}`,
    }));

    await expectNoError('programme seed', admin.from('programmes').insert({
      id: context.programmeId,
      code: `rls_probe_${uniqueSuffix}`,
      name: `RLS Probe Programme ${uniqueSuffix}`,
    }));

    await expectNoError('user profile seed', admin.from('users').insert({
      id: context.userId,
      first_name: 'RLS',
      last_name: 'Probe',
      email,
    }));

    await expectNoError('staff programme assignment seed', admin
      .from('staff_programme_assignments')
      .insert({
        id: context.assignmentId,
        user_id: context.userId,
        programme_id: context.programmeId,
        school_id: context.schoolId,
        created_by: context.userId,
      }));

    const { error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`probe sign-in failed: ${signInError.message}`);

    return context;
  } catch (error) {
    await cleanupProbeContext(admin, context);
    throw error;
  }
};

const seedReconcileRelationships = async ({ admin, context }) => {
  const childId = context.createdIds.children[0];
  const classId = context.createdIds.classes[0];
  const groupId = context.createdIds.groups[0];
  const ids = {
    child_ea_assignments: [randomUUID()],
    child_programme_enrollments: [randomUUID()],
    child_class_memberships: [randomUUID()],
    class_ea_assignments: [randomUUID()],
    group_ea_assignments: [randomUUID()],
    child_group_memberships: [randomUUID()],
  };

  context.createdIds = { ...context.createdIds, ...ids };
  await expectNoError('academic year seed', admin.from('academic_years').insert({
    id: context.academicYearId,
    label: `RLS Probe ${context.academicYearId}`,
    starts_on: '2099-01-01',
    ends_on: '2099-12-31',
    is_active: false,
  }));
  await expectNoError('child EA assignment seed', admin.from('child_ea_assignments').insert({
    id: ids.child_ea_assignments[0],
    user_id: context.userId,
    child_id: childId,
    created_by: context.userId,
  }));
  await expectNoError('child programme enrollment seed', admin
    .from('child_programme_enrollments')
    .insert({
      id: ids.child_programme_enrollments[0],
      child_id: childId,
      programme_id: context.programmeId,
      created_by: context.userId,
    }));
  await expectNoError('child class membership seed', admin
    .from('child_class_memberships')
    .insert({
      id: ids.child_class_memberships[0],
      child_id: childId,
      class_id: classId,
      academic_year_id: context.academicYearId,
      created_by: context.userId,
    }));
  await expectNoError('class EA assignment seed', admin.from('class_ea_assignments').insert({
    id: ids.class_ea_assignments[0],
    class_id: classId,
    ea_user_id: context.userId,
    programme_id: context.programmeId,
    created_by: context.userId,
  }));
  await expectNoError('group EA assignment seed', admin.from('group_ea_assignments').insert({
    id: ids.group_ea_assignments[0],
    group_id: groupId,
    ea_user_id: context.userId,
    programme_id: context.programmeId,
    created_by: context.userId,
  }));
  await expectNoError('child group membership seed', admin
    .from('child_group_memberships')
    .insert({
      id: ids.child_group_memberships[0],
      child_id: childId,
      group_id: groupId,
      created_by: context.userId,
    }));

  return {
    child_ea_assignment_ids: ids.child_ea_assignments,
    assigned_child_ids: [childId],
    visible_child_ids: [childId],
    child_programme_enrollment_ids: ids.child_programme_enrollments,
    child_class_membership_ids: ids.child_class_memberships,
    class_ea_assignment_ids: ids.class_ea_assignments,
    class_ids: [classId],
    group_ea_assignment_ids: ids.group_ea_assignments,
    group_ids: [groupId],
    child_group_membership_ids: ids.child_group_memberships,
  };
};

const runReconcileAcknowledgmentRule = async ({ admin, client, context }) => {
  const expected = await seedReconcileRelationships({ admin, context });
  const { data, error } = await client.rpc('get_reconcile_acknowledgments');
  if (error) {
    return {
      ok: false,
      table: 'reconcile_acknowledgments',
      policy: 'security_definer_authenticated_snapshot',
      assertion: 'complete_exact_relationship_sets',
      error: error.message,
    };
  }

  const ok = validateReconcileSnapshot({
    snapshot: data,
    expected,
    userId: context.userId,
    programmeId: context.programmeId,
  });
  return {
    ok,
    table: 'reconcile_acknowledgments',
    policy: 'security_definer_authenticated_snapshot',
    assertion: 'complete_exact_relationship_sets',
    error: ok ? null : 'RPC snapshot did not exactly match the service-role relationship set',
  };
};

const runProbe = async (env = loadEnvFiles()) => {
  const safeEnv = validateProbeEnv(env);
  const admin = makeClient(safeEnv.SUPABASE_PROJECT_URL_SQLITE, safeEnv.SUPABASE_SECRET_KEY_SQLITE);
  const anon = makeClient(safeEnv.SUPABASE_PROJECT_URL_SQLITE, safeEnv.SUPABASE_PUBLISHABLE_KEY_SQLITE);
  const password = `RlsProbe-${randomUUID()}aA1!`;
  const email = `rls-probe-${Date.now()}-${randomUUID()}@example.invalid`;
  let context;

  try {
    context = await seedProbeContext({ admin, anon, email, password });
    context.createdIds = {};

    const results = [];
    for (const rule of PROBE_RULES) {
      const result = await runRule({ client: anon, rule, context });
      context.createdIds[rule.table] = [result.id];
      results.push({ ...rule, ...result });
    }

    if (results.every((result) => result.ok)) {
      results.push(await runReconcileAcknowledgmentRule({ admin, client: anon, context }));
    }

    return results;
  } finally {
    await cleanupProbeContext(admin, context);
  }
};

module.exports = {
  PROBE_RULES,
  RECONCILE_SNAPSHOT_KEYS,
  validateReconcileSnapshot,
  validateProbeEnv,
};

if (require.main === module) {
  runProbe()
    .then((results) => {
      let failed = false;
      for (const result of results) {
        const status = result.ok ? 'PASS' : 'FAIL';
        console.log(`${status} ${result.table} ${result.policy} ${result.assertion}`);
        if (!result.ok) {
          failed = true;
          console.error(`  ${result.error}`);
        }
      }
      process.exit(failed ? 1 : 0);
    })
    .catch((error) => {
      console.error(`FAIL rls visibility probe: ${error.message}`);
      process.exit(1);
    });
}
