#!/usr/bin/env node

// Opt-in staging tool. Importing this file never loads env files or creates clients.
// Operator-only hosted modes (never run by CI/implementers):
//   npm run assessment-history:probe
//   npm run assessment-history:probe -- seed-volume       (requires a terminal)
//   npm run assessment-history:probe -- cleanup-volume --namespace <uuid>
// Uses the four *_SQLITE variables from rls-visibility-probe.cjs; never dotenv/CLI.
// Fixture results are synthetic probe.1 results, not a copy of a published letter card.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { parseEnvContent } = require('./sqlite-staging.cjs');
const { validateProbeEnv: validateRlsProbeEnv } = require('./rls-visibility-probe.cjs');

const PROJECT_REF = 'segygjzpujphwvrubusm';
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const MASTERY_NAMESPACE = '09dcf4b2-6c53-4c46-917f-33bc7f2df4d2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const requireUuid = (value, name) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${name} must be a UUID`);
};
const requireCount = (value, name, max, min = 1) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`${name} is outside fixture bounds`);
};
const programmeDay = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
const validateProbeEnv = env => {
  validateRlsProbeEnv(env);
  let url;
  try { url = new URL(env.SUPABASE_PROJECT_URL_SQLITE); } catch { throw new Error('Invalid SQLite project URL'); }
  if (url.origin !== PROJECT_URL || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`SUPABASE_PROJECT_URL_SQLITE must be exactly ${PROJECT_URL}`);
  }
  return env;
};

const buildProbeFamilies = ({ userId, childId, programmeId, assessmentDate, families = 20, itemsPerFamily = 61 }) => {
  for (const [name, value] of Object.entries({ userId, childId, programmeId })) requireUuid(value, name);
  requireCount(families, 'families', 200);
  requireCount(itemsPerFamily, 'itemsPerFamily', 1000);
  const date = new Date(`${assessmentDate}T08:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== assessmentDate) throw new TypeError('assessmentDate must be a calendar date');
  const createdAt = date.toISOString();
  const assessments = [], items = [];
  for (let n = 0; n < families; n++) {
    const id = randomUUID();
    const family = Array.from({ length: itemsPerFamily }, (_, position) => ({
      id: randomUUID(), assessment_id: id, position, item_key: `probe-${position}`,
      prompt: LETTERS[position % LETTERS.length], response: null, is_correct: position % 5 !== 0,
      metadata: { reached: true, row: Math.floor(position / 10), fixture: true }, created_at: createdAt,
    }));
    const correct = family.filter(i => i.is_correct).length;
    assessments.push({
      id, user_id: userId, child_id: childId, programme_id: programmeId,
      assessment_type: 'letter_sounds', question_code: 'letter_sounds', question_version: 'probe.1',
      item_set_id: 'letter_sounds@probe.1.en', language: 'en', stopped_reason: 'completed',
      assessment_purpose: 'progress_check', assessment_window_id: null, battery_run_id: null,
      assessment_date: assessmentDate, capture_mode: 'sequential', score: correct, total_items: itemsPerFamily,
      duration_ms: 10000, derived: { total_correct: correct, total_attempted: itemsPerFamily, fixture: true },
      created_at: createdAt,
    });
    items.push(...family);
  }
  return { assessments, items };
};

const validateProbePage = (rows, { families, itemsPerFamily }) => {
  const errors = [];
  if (!Array.isArray(rows)) return { ok: false, errors: ['Page must be an array'] };
  if (rows.length !== families) errors.push('Unexpected family count');
  const ids = new Set();
  let total = 0;
  for (const [n, row] of rows.entries()) {
    if (!row || typeof row.id !== 'string' || ids.has(row.id)) errors.push(`Family ${n}: missing or duplicate id`);
    ids.add(row?.id);
    if (!Array.isArray(row?.items)) { errors.push(`Family ${n}: missing item array`); continue; }
    total += row.items.length;
    if (row.total_items !== itemsPerFamily || row.items.length !== itemsPerFamily || row.items.length !== row.total_items) {
      errors.push(`Family ${n}: incomplete item array`);
    }
    if (row.items.some((item, position) => item?.position !== position)) errors.push(`Family ${n}: invalid position order`);
  }
  if (total <= 1000) errors.push('Page must contain more than 1,000 items');
  return { ok: errors.length === 0, errors };
};

// RFC 9562 UUIDv5, matching private.letter_mastery_id without importing app/Expo code.
// uuid@13 is ESM; these synchronous CJS fixture builders use Node's built-in SHA-1.
const domainId = (...parts) => {
  const digest = createHash('sha1').update(Buffer.from(MASTERY_NAMESPACE.replaceAll('-', ''), 'hex'))
    .update(parts.map(part => String(part ?? '')).join('\x1f')).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const buildVolumeFixture = ({ eaUserId, coEaUserId, programmeId, academicYearId,
  classes = 2, childrenPerClass = 35, resultsPerChild = 2, deliveryChildren = 30, confirmationsPerChild = 26 }) => {
  for (const [name, value] of Object.entries({ eaUserId, coEaUserId, programmeId, academicYearId })) requireUuid(value, name);
  requireCount(classes, 'classes', 20);
  requireCount(childrenPerClass, 'childrenPerClass', 100);
  requireCount(resultsPerChild, 'resultsPerChild', 10);
  requireCount(deliveryChildren, 'deliveryChildren', classes * childrenPerClass, 0);
  requireCount(confirmationsPerChild, 'confirmationsPerChild', 26, 0);
  const schoolId = randomUUID();
  const day = programmeDay(), now = new Date().toISOString();
  const tables = {
    schools: [{ id: schoolId, school_uid: `assessment-history-${schoolId}`, name: `Assessment history fixture ${schoolId}` }],
    classes: [], class_ea_assignments: [], children: [], child_class_memberships: [],
    child_programme_enrollments: [], child_ea_assignments: [], assessments: [], assessment_items: [], letter_mastery: [],
  };
  for (let c = 0; c < classes; c++) {
    const classId = randomUUID();
    tables.classes.push({ id: classId, school_id: schoolId, academic_year_id: academicYearId,
      name: `Fixture class ${c + 1}`, grade: '1', home_language: 'English', created_by: coEaUserId });
    tables.class_ea_assignments.push({ id: domainId('class_ea_assignments', classId, eaUserId, programmeId), class_id: classId, ea_user_id: eaUserId,
      programme_id: programmeId, created_by: coEaUserId });
    for (let n = 0; n < childrenPerClass; n++) {
      const childId = randomUUID(), index = c * childrenPerClass + n;
      tables.children.push({ id: childId, first_name: 'Fixture', last_name: `Child ${index + 1}`,
        class_id: classId, created_by: coEaUserId, reading_level: 'Word Reading' });
      tables.child_class_memberships.push({ id: randomUUID(), child_id: childId, class_id: classId,
        academic_year_id: academicYearId, created_by: coEaUserId });
      tables.child_programme_enrollments.push({ id: domainId('child_programme_enrollments', childId, programmeId), child_id: childId, programme_id: programmeId, created_by: coEaUserId });
      const family = buildProbeFamilies({ userId: coEaUserId, childId, programmeId, assessmentDate: day, families: resultsPerChild });
      tables.assessments.push(...family.assessments);
      tables.assessment_items.push(...family.items);
      if (index < deliveryChildren) {
        tables.child_ea_assignments.push({ id: domainId('child_ea_assignments', eaUserId, childId), child_id: childId, user_id: eaUserId, created_by: coEaUserId });
        for (const letter of LETTERS.slice(0, confirmationsPerChild)) {
          tables.letter_mastery.push({ id: domainId('letter_mastery', childId, letter, 'en'), child_id: childId, letter, language: 'en',
            confirmed: true, changed_at: now, correction_id: randomUUID(), changed_by: coEaUserId, programme_id: programmeId });
        }
      }
    }
  }
  return { tables };
};

const loadEnvFiles = (cwd = process.cwd()) => {
  const env = {};
  for (const filename of ['.env', '.env.local']) {
    const file = path.join(cwd, filename);
    if (fs.existsSync(file)) Object.assign(env, parseEnvContent(fs.readFileSync(file, 'utf8'), { filename }));
  }
  return { ...env, ...process.env };
};

// Never include SDK errors, request bodies, auth responses or env values in output.
class ProbeFailure extends Error {
  constructor(stage) { super(stage); this.stage = stage; }
}
const checked = async (stage, query) => {
  try {
    const result = await query;
    if (result.error) throw new Error();
    return result.data;
  } catch { throw new ProbeFailure(stage); }
};
const chunks = (values, size = 100) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));
const idsOf = rows => [...new Set(rows.map(row => row.id))];

// The only SDK import/client construction is behind the opt-in runtime entry point.
const makeClient = (env, key) => {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(PROJECT_URL, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
};

// Admin discovery is paginated, including cleanup: a capped SELECT is never absence proof.
const scopedRows = async (admin, table, column, values) => {
  const rows = [];
  for (const batch of chunks([...new Set(values)])) {
    let after;
    while (true) {
      let query = admin.from(table).select('id').in(column, batch).order('id').limit(500);
      if (after) query = query.gt('id', after);
      const page = await checked(`read ${table}`, query);
      if (!Array.isArray(page)) throw new ProbeFailure(`read ${table}`);
      if (!page.length) break;
      const next = page[page.length - 1].id;
      if (after && next <= after) throw new ProbeFailure(`paginate ${table}`);
      rows.push(...page);
      after = next;
    }
  }
  return rows;
};
const removeAndVerify = async (admin, table, column, values) => {
  for (const batch of chunks([...new Set(values)])) {
    await checked(`delete ${table}`, admin.from(table).delete().in(column, batch));
    let result;
    try { result = await admin.from(table).select('*', { count: 'exact', head: true }).in(column, batch); }
    catch { throw new ProbeFailure(`verify cleanup ${table}`); }
    if (result.error || result.count !== 0) throw new ProbeFailure(`verify cleanup ${table}`);
  }
};
const insertRows = async (admin, table, rows) => {
  for (const batch of chunks(rows, 200)) await checked(`seed ${table}`, admin.from(table).insert(batch));
};

const fixtureEmail = (namespace, role) => `assessment-history-${namespace}-${role}@example.invalid`;
const namespaceUsers = async (admin, namespace) => {
  const users = [];
  for (let page = 1; ; page++) {
    const data = await checked('discover fixture users', admin.auth.admin.listUsers({ page, perPage: 200 }));
    if (!Array.isArray(data?.users)) throw new ProbeFailure('discover fixture users');
    for (const user of data.users) {
      const meta = user.app_metadata;
      if (meta?.assessment_history_namespace !== namespace) continue;
      const role = meta.assessment_history_role;
      if (!meta.is_test_account || !['gate', 'co-ea'].includes(role)
        || !['probe', 'seed-volume'].includes(meta.assessment_history_mode)
        || user.email !== fixtureEmail(namespace, role)) throw new ProbeFailure('fixture ownership check');
      users.push(user);
    }
    if (data.users.length < 200) return users;
  }
};

// Namespace recovery also handles a lost create/insert response. No credentials or
// manifest are stored on disk. Users remain until all owned domain rows are gone.
const cleanupNamespace = async (admin, namespace) => {
  requireUuid(namespace, 'namespace');
  const users = await namespaceUsers(admin, namespace);
  const userIds = users.map(user => user.id);
  const schoolUid = `assessment-history-${namespace}`;
  const schoolIds = idsOf(await scopedRows(admin, 'schools', 'school_uid', [schoolUid]));
  const classIds = idsOf(await scopedRows(admin, 'classes', 'school_id', schoolIds));
  const childIds = idsOf([
    ...await scopedRows(admin, 'children', 'created_by', userIds),
    ...await scopedRows(admin, 'children', 'class_id', classIds),
  ]);
  const assessmentIds = idsOf([
    ...await scopedRows(admin, 'assessments', 'user_id', userIds),
    ...await scopedRows(admin, 'assessments', 'child_id', childIds),
  ]);
  // Gate operators may record a lesson/run or correct mastery on the disposable account.
  const sessionIds = idsOf(await scopedRows(admin, 'sessions', 'user_id', userIds));
  const groupIds = idsOf(await scopedRows(admin, 'groups', 'created_by', userIds));
  await removeAndVerify(admin, 'assessment_items', 'assessment_id', assessmentIds);
  await removeAndVerify(admin, 'assessments', 'id', assessmentIds);
  await removeAndVerify(admin, 'battery_runs', 'child_id', childIds);
  await removeAndVerify(admin, 'letter_mastery_corrections', 'child_id', childIds);
  await removeAndVerify(admin, 'letter_mastery', 'child_id', childIds);
  await removeAndVerify(admin, 'session_attendees', 'session_id', sessionIds);
  await removeAndVerify(admin, 'sessions', 'id', sessionIds);
  await removeAndVerify(admin, 'child_group_memberships', 'child_id', childIds);
  await removeAndVerify(admin, 'group_ea_assignments', 'group_id', groupIds);
  await removeAndVerify(admin, 'groups', 'id', groupIds);
  for (const table of ['child_ea_assignments', 'child_class_memberships', 'child_programme_enrollments']) {
    await removeAndVerify(admin, table, 'child_id', childIds);
  }
  await removeAndVerify(admin, 'class_ea_assignments', 'class_id', classIds);
  await removeAndVerify(admin, 'children', 'id', childIds);
  await removeAndVerify(admin, 'classes', 'id', classIds);
  await removeAndVerify(admin, 'time_entries', 'user_id', userIds);
  await removeAndVerify(admin, 'staff_programme_assignments', 'user_id', userIds);
  await removeAndVerify(admin, 'users', 'id', userIds);
  await removeAndVerify(admin, 'schools', 'id', schoolIds);
  for (const userId of userIds) await checked('delete fixture auth user', admin.auth.admin.deleteUser(userId));
  if ((await namespaceUsers(admin, namespace)).length) throw new ProbeFailure('verify auth cleanup');
  if ((await scopedRows(admin, 'schools', 'school_uid', [schoolUid])).length) throw new ProbeFailure('verify school cleanup');
};

const seedUser = async (admin, namespace, mode, role, password) => {
  const data = await checked('seed fixture auth user', admin.auth.admin.createUser({
    email: fixtureEmail(namespace, role), password, email_confirm: true,
    app_metadata: { is_test_account: true, assessment_history_namespace: namespace,
      assessment_history_mode: mode, assessment_history_role: role },
  }));
  if (!data?.user?.id || !UUID.test(data.user.id)) throw new ProbeFailure('seed fixture auth user');
  return data.user.id;
};
const references = async admin => {
  const programme = await checked('read Literacy programme', admin.from('programmes').select('id').eq('code', 'literacy').single());
  const year = await checked('read active academic year', admin.from('academic_years').select('id,starts_on,ends_on').eq('is_active', true).single());
  const jobTitle = await checked('read Literacy job title', admin.from('job_titles').select('id').eq('code', 'literacy_coach').single());
  const organization = await checked('read Masinyusane organization', admin.from('organizations').select('id').eq('id', 'a111879f-d066-47c9-95a1-bed2a400319a').single());
  if (![programme?.id, year?.id, jobTitle?.id, organization?.id].every(id => UUID.test(id || ''))
    || !/^\d{4}-\d{2}-\d{2}$/.test(year.starts_on)) throw new ProbeFailure('reference data preflight');
  return { programmeId: programme.id, year, jobTitleId: jobTitle.id, organizationId: organization.id };
};
const seedProfiles = async (admin, namespace, actors, schoolId, ref) => {
  await insertRows(admin, 'users', actors.map(({ id, role }) => ({
    id, email: fixtureEmail(namespace, role), first_name: 'History fixture', last_name: role,
    school_id: schoolId, job_title_id: ref.jobTitleId, organization_id: ref.organizationId,
  })));
  await insertRows(admin, 'staff_programme_assignments', actors.map(({ id }) => ({
    id: randomUUID(), user_id: id, programme_id: ref.programmeId, school_id: schoolId, created_by: id,
  })));
};
const namespaceSchool = (namespace, schoolId) => ({
  id: schoolId, school_uid: `assessment-history-${namespace}`, name: `Assessment history fixture ${namespace}`,
});

const probe = async (admin, client, namespace, ref) => {
  const password = `History-${randomUUID()}aA1!`;
  const userId = await seedUser(admin, namespace, 'probe', 'gate', password);
  const schoolId = randomUUID(), childId = randomUUID();
  await insertRows(admin, 'schools', [namespaceSchool(namespace, schoolId)]);
  await seedProfiles(admin, namespace, [{ id: userId, role: 'gate' }], schoolId, ref);
  await insertRows(admin, 'children', [{ id: childId, first_name: 'History fixture', last_name: 'Probe', created_by: userId }]);
  const family = buildProbeFamilies({ userId, childId, programmeId: ref.programmeId, assessmentDate: ref.year.starts_on });
  // Keep all fresh parent/item ids before the first write, including on failure.
  const assessmentIds = family.assessments.map(row => row.id);
  await insertRows(admin, 'assessments', family.assessments);
  await insertRows(admin, 'assessment_items', family.items);
  await checked('sign in probe user', client.auth.signInWithPassword({ email: fixtureEmail(namespace, 'gate'), password }));
  const rows = await checked('read authenticated assessment page', client.rpc('get_assessment_history_page', {
    p_programme_id: ref.programmeId, p_academic_year_id: ref.year.id, p_page_size: 50,
    p_after_updated_at: null, p_after_id: null, p_overlap_seconds: 0,
  }));
  const validated = validateProbePage(rows, { families: 20, itemsPerFamily: 61 });
  if (!validated.ok || !Array.isArray(rows) || rows.some(row => !assessmentIds.includes(row.id))) {
    throw new ProbeFailure('validate complete authenticated families');
  }
  const rawItems = await checked('read raw item cap control', admin.from('assessment_items').select('id').in('assessment_id', assessmentIds));
  if (!Array.isArray(rawItems) || rawItems.length !== 1000) throw new ProbeFailure('raw item cap must be exactly 1000');
  return { families: rows.length, items: rows.reduce((total, row) => total + row.items.length, 0), raw_item_cap: rawItems.length };
};

const seedVolume = async (admin, namespace, ref) => {
  const password = `History-${randomUUID()}aA1!`;
  const eaUserId = await seedUser(admin, namespace, 'seed-volume', 'gate', password);
  const coEaUserId = await seedUser(admin, namespace, 'seed-volume', 'co-ea', `History-${randomUUID()}aA1!`);
  const { tables } = buildVolumeFixture({ eaUserId, coEaUserId, programmeId: ref.programmeId, academicYearId: ref.year.id });
  tables.schools = [namespaceSchool(namespace, tables.schools[0].id)];
  // The builder knows a year id, not its dates. Use the server's start date so
  // the fixture remains in scope even when the active year differs from today.
  for (const row of tables.assessments) row.assessment_date = ref.year.starts_on;
  await insertRows(admin, 'schools', tables.schools);
  await seedProfiles(admin, namespace, [{ id: eaUserId, role: 'gate' }, { id: coEaUserId, role: 'co-ea' }], tables.schools[0].id, ref);
  for (const [table, rows] of Object.entries(tables)) {
    if (table !== 'schools') await insertRows(admin, table, rows);
  }
  // Exact counts, not a capped row list, verify the realistic-volume seed.
  for (const [table, expected, column, value] of [
    ['assessments', 140, 'user_id', coEaUserId],
    ['assessment_items', 8540, 'assessment_id', tables.assessments.map(row => row.id)],
    ['letter_mastery', 780, 'changed_by', coEaUserId],
  ]) {
    let count = 0;
    for (const batch of chunks(Array.isArray(value) ? value : [value])) {
      const result = await admin.from(table).select('id', { count: 'exact', head: true }).in(column, batch);
      if (result.error || !Number.isInteger(result.count)) throw new ProbeFailure(`verify volume ${table}`);
      count += result.count;
    }
    if (count !== expected) throw new ProbeFailure(`verify volume ${table}`);
  }
  return { email: fixtureEmail(namespace, 'gate'), password };
};

const parseArgs = args => {
  const mode = args[0] || 'probe';
  if (!['probe', 'seed-volume', 'cleanup-volume'].includes(mode)) throw new ProbeFailure('unknown mode');
  if (mode === 'cleanup-volume') {
    if (args.length !== 3 || args[1] !== '--namespace' || !UUID.test(args[2])) throw new ProbeFailure('cleanup-volume requires --namespace UUID');
    return { mode, namespace: args[2].toLowerCase() };
  }
  if (args.length > 1) throw new ProbeFailure('unexpected arguments');
  return { mode, namespace: randomUUID() };
};

const formatProbeFailure = error => `FAIL assessment history probe: ${error instanceof ProbeFailure ? error.stage : 'configuration or execution failed'}\n`;

const main = async () => {
  const { mode, namespace } = parseArgs(process.argv.slice(2));
  if (mode === 'seed-volume' && !process.stdout.isTTY) throw new ProbeFailure('seed-volume requires an operator terminal');
  const env = validateProbeEnv(loadEnvFiles());
  const admin = makeClient(env, env.SUPABASE_SECRET_KEY_SQLITE);
  // Namespace is a non-secret recovery key, printed before the first fixture write.
  process.stdout.write(`namespace=${namespace}\n`);
  if (mode === 'cleanup-volume') {
    await cleanupNamespace(admin, namespace);
    process.stdout.write('PASS cleanup-volume: zero fixture residue\n');
    return;
  }
  let keepVolume = false;
  let counts;
  try {
    const ref = await references(admin);
    if (mode === 'seed-volume') {
      const credentials = await seedVolume(admin, namespace, ref);
      // This is the sole credential-output path, and only on the operator's TTY.
      process.stdout.write(`email=${credentials.email}\npassword=${credentials.password}\n`);
      keepVolume = true;
    } else {
      counts = await probe(admin, makeClient(env, env.SUPABASE_PUBLISHABLE_KEY_SQLITE), namespace, ref);
    }
  } finally {
    if (!keepVolume) await cleanupNamespace(admin, namespace);
  }
  if (mode === 'probe') process.stdout.write(`PASS probe ${JSON.stringify({ ...counts, zero_residue: true })}\n`);
};

module.exports = { buildProbeFamilies, validateProbePage, buildVolumeFixture, validateProbeEnv, parseArgs, formatProbeFailure };

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(formatProbeFailure(error));
    process.exitCode = 1;
  });
}
