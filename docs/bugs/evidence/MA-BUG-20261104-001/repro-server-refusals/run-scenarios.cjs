#!/usr/bin/env node
// REPRODUCER repro-server-refusals.
// Question: is legitimate offline history recorded BEFORE a lifecycle change refused when it
// uploads AFTER it? Disposable local PG17, bootstrap + every canonical Masi migration, then one
// rolled-back transaction per scenario. Each client call runs inside repro.step(), a SECURITY
// INVOKER plpgsql wrapper that executes the statement in a subtransaction (savepoint semantics)
// as the current role/claims and returns {ok, rows_affected, returned} or {ok:false, sqlstate,
// message, detail}. Statements mirror the PostgREST SQL that supabase-js produces for the call
// the Masi client makes (src/services/offlineSync.js:664-818).
//
// Rerun:
//   export PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH
//   export HISTORY_RLS_ADMIN_DATABASE_URL=postgresql://postgres:<password>@127.0.0.1:<port>/postgres
//   export HISTORY_RLS_DATABASE_NAME=masi_history_rls_repro_refusals
//   export HISTORY_RLS_DISPOSABLE_CONFIRM=I_UNDERSTAND_THIS_IS_DISPOSABLE
//   node run-scenarios.cjs            # writes sql/, raw/, results.json next to this file
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HARNESS = '/Users/jimmckeown/Development/masi-app/scripts/history-authorization-postgres-harness.cjs';
const { buildPsqlEnv, runPsql } = require(HARNESS);
const { loadDatabase, dropDatabase } = require(path.join(__dirname, 'load-db.cjs'));

const OUT = __dirname;
fs.mkdirSync(path.join(OUT, 'sql'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });

// ---------------------------------------------------------------- identities
const ORG = 'a111879f-d066-47c9-95a1-bed2a400319a';
const HO = '17000000-0000-0000-0000-000000000001';
const EA_A = '17000000-0000-0000-0000-000000000002';
const SCHOOL = '27000000-0000-0000-0000-000000000001';
const K = '47000000-0000-0000-0000-000000000001'; // class held by EA_A
const G = '77000000-0000-0000-0000-000000000001'; // group held by EA_A
const C = '57000000-0000-0000-0000-000000000001'; // direct + class + group + enrollment
const D = '57000000-0000-0000-0000-000000000002'; // group-only
const E = '57000000-0000-0000-0000-000000000003'; // class-only control
const SPA_LIT = '37000000-0000-0000-0000-000000000001';
const SPA_NUM = '37000000-0000-0000-0000-000000000002';
const CEA_K = '67000000-0000-0000-0000-000000000001';
const CA_C = '68000000-0000-0000-0000-000000000001';
const CCM_C = '69000000-0000-0000-0000-000000000001';
const CCM_E = '69000000-0000-0000-0000-000000000003';
const CPE_C = '6a000000-0000-0000-0000-000000000001';
const CPE_D = '6a000000-0000-0000-0000-000000000002';
const CPE_E = '6a000000-0000-0000-0000-000000000003';
const GEA_G = '6b000000-0000-0000-0000-000000000001';
const CGM_C = '6c000000-0000-0000-0000-000000000001';
const CGM_D = '6c000000-0000-0000-0000-000000000002';
const YEAR_2027 = '3a000000-0000-0000-0000-000000000027';

const NAMES = {
  [HO]: 'HO', [EA_A]: 'EA_A', [SCHOOL]: 'SCHOOL', [K]: 'CLASS_K', [G]: 'GROUP_G', [C]: 'CHILD_C',
  [D]: 'CHILD_D', [E]: 'CHILD_E', [SPA_LIT]: 'SPA_LIT', [SPA_NUM]: 'SPA_NUM', [CEA_K]: 'CEA_K',
  [CA_C]: 'CA_C', [CCM_C]: 'CCM_C', [CCM_E]: 'CCM_E', [CPE_C]: 'CPE_C', [CPE_D]: 'CPE_D',
  [CPE_E]: 'CPE_E', [GEA_G]: 'GEA_G', [CGM_C]: 'CGM_C', [CGM_D]: 'CGM_D',
};

// ---------------------------------------------------------------- timeline (SAST)
const GRANT_START = '2026-09-01T07:00:00+02:00'; // every grant/membership starts
const WORK_DAY = '2026-10-28'; // session_date / assessment_date of the offline work
const WORK_AT = '2026-10-28T09:00:00+02:00';
const WORK_END = '2026-10-28T09:40:00+02:00';
const ARCHIVE_AT = '2026-11-02T10:00:00+02:00'; // phone archive time or Head Office end
// Uploads run at the DB clock (now() inside each scenario transaction).

// ---------------------------------------------------------------- SQL helpers
const lit = (v) => (v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const jlit = (value) => {
  const text = JSON.stringify(value);
  assert.ok(!text.includes('$j$'));
  return `$j$${text}$j$`;
};

// supabase-js .upsert(payload(s), { onConflict: 'id', ignoreDuplicates }) with no .select():
// PostgREST POST, Prefer: resolution=ignore|merge-duplicates, missing=default, return=minimal.
// PostgREST emits INSERT ... SELECT FROM json body ... ON CONFLICT ("id") DO NOTHING |
// DO UPDATE SET <every payload column> = EXCLUDED.<col> ... RETURNING 1.
// Client: offlineSync.js:794-803 (single) and 806-818 (batch); sessions are insert-or-ignore
// (INSERT_OR_IGNORE_TABLES, offlineSync.js:224-227); session_attendees are merge upserts.
const upsert = (table, rows, { ignoreDuplicates, returning = 'RETURNING 1' }) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const cols = [...new Set(list.flatMap((row) => Object.keys(row)))];
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const conflict = ignoreDuplicates
    ? 'DO NOTHING'
    : `DO UPDATE SET ${cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')}`;
  return `INSERT INTO public.${table} (${colList}) SELECT ${colList} FROM pg_catalog.json_populate_recordset(NULL::public.${table}, ${jlit(list)}::json) ON CONFLICT ("id") ${conflict} ${returning}`.trim();
};

// supabase-js .update(patch).eq('id', id).select('id'): PATCH with return=representation =>
// UPDATE ... WHERE id = $1 RETURNING id. Client: offlineSync.js:749-768 (archive/restore) and
// 769-792 (UPDATE_BY_ID edits). Zero rows => ARCHIVE_NOT_APPLIED / UPDATE_NOT_APPLIED.
const updateById = (table, patch, id) => {
  const cols = Object.keys(patch);
  return `UPDATE public.${table} AS t SET ${cols.map((c) => `"${c}" = b."${c}"`).join(', ')} FROM pg_catalog.json_populate_record(NULL::public.${table}, ${jlit(patch)}::json) AS b WHERE t.id = ${lit(id)}::uuid RETURNING t.id`;
};

// supabase-js .rpc(name, args) => POST /rpc/name with named arguments.
const rpcSubmit = (family) => `SELECT public.submit_assessment(p_assessment := ${jlit(family.assessment)}::jsonb, p_items := ${jlit(family.items)}::jsonb) AS result`;
const rpcRun = (run) => `SELECT public.save_battery_run(p_run := ${jlit(run)}::jsonb) AS result`;
const rpcLetter = (c) => `SELECT * FROM public.set_letter_mastery(p_correction_id := ${lit(c.correction_id)}::uuid, p_child_id := ${lit(c.child_id)}::uuid, p_letter := ${lit(c.letter)}, p_language := ${lit(c.language)}, p_confirmed := ${c.confirmed}, p_changed_at := ${lit(c.changed_at)}::timestamptz)`;
const rpcSkill = (c) => `SELECT * FROM public.set_skill_mastery(p_correction_id := ${lit(c.correction_id)}::uuid, p_child_id := ${lit(c.child_id)}::uuid, p_step_key := ${lit(c.step_key)}, p_confirmed := ${c.confirmed}, p_changed_at := ${lit(c.changed_at)}::timestamptz)`;

// ---------------------------------------------------------------- payload builders
// Mirrors sessionsRepository.saveSession (src/db/repositories/sessionsRepository.js:205-257)
// filtered by SERVER_COLUMNS.sessions / session_attendees (src/services/syncServerColumns.js).
// Lesson sessions carry group_id and class_id (src/lessonPlan/lessonRecord.js:32-34).
const ctx = {}; // filled at runtime: programme ids
const hex = (n, width = 12) => n.toString(16).padStart(width, '0');
const idFor = (prefix, scenarioNo, n) => `${prefix}-0000-0000-0000-${hex(scenarioNo * 256 + n)}`;

const sessionPayload = ({ id, group = G, cls = K, programme = ctx.LIT }) => ({
  id, user_id: EA_A, programme_id: programme, class_id: cls, group_id: group,
  session_date: WORK_DAY, started_at: WORK_AT, ended_at: WORK_END,
  activities: {}, notes: '', created_at: WORK_AT, updated_at: WORK_END,
});
const attendeePayload = ({ id, session, child, group = G }) => ({
  id, session_id: session, child_id: child, group_id: group, attendance_status: 'present',
  created_at: WORK_AT, updated_at: WORK_END,
});
// Shapes copied from scripts/assessment-results-postgres-harness.cjs makeRun/makeFamily.
// battery_runs: offlineSync strips updated_at (src/services/syncPayload.js:42).
const runPayload = ({ id, child, cls = K, programme = ctx.LIT }) => ({
  id, user_id: EA_A, child_id: child, programme_id: programme, class_id: cls,
  battery_code: 'wela_plus_full', battery_version: '2024.1', assessment_purpose: 'progress_check',
  assessment_window_id: null, language: 'en', started_at: WORK_AT, completed_at: WORK_END,
  status: 'completed', notes: null, created_at: WORK_AT,
});
const familyPayload = ({ id, itemBase, child, programme = ctx.LIT, date = WORK_DAY }) => {
  const assessment = {
    id, user_id: EA_A, child_id: child, programme_id: programme, battery_run_id: null,
    question_code: 'letter_sounds', question_version: '2026.1', item_set_id: 'letter_sounds@2026.1.en',
    language: 'en', stopped_reason: 'completed', duration_ms: 1200,
    derived: { total_correct: 2, total_attempted: 3, capture_mode: 'sequential' },
    assessment_type: 'letter_sounds', score: 2, total_items: 3, capture_mode: 'sequential',
    assessment_purpose: 'progress_check', assessment_window_id: null, assessment_date: date,
    created_at: WORK_AT, updated_at: WORK_END,
  };
  const items = [0, 1, 2].map((position) => ({
    id: itemBase(position), assessment_id: id, position,
    item_key: ['a', 'b', 'c'][position], prompt: ['a', 'b', 'c'][position],
    is_correct: position !== 1, metadata: { row: 0, reached: true },
    created_at: WORK_AT, updated_at: WORK_END,
  }));
  return { assessment, items };
};
const letterPayload = ({ id, child }) => ({
  correction_id: id, child_id: child, letter: 'k', language: 'xh', confirmed: true, changed_at: WORK_AT,
});
const skillPayload = ({ id, child }) => ({
  correction_id: id, child_id: child, step_key: 'counting.1', confirmed: true, changed_at: WORK_AT,
});

// One bundle of "work recorded on 2026-10-28" for a scenario.
const bundle = (no) => ({
  groupSession: idFor('87000000', no, 1),
  classSession: idFor('87000000', no, 2),
  att: (child, which) => idFor('97000000', no, (which === 'class' ? 0x80 : 0) + Number(child.slice(-1))),
  run: (child) => idFor('a7000000', no, Number(child.slice(-1))),
  assessment: (child) => idFor('b7000000', no, Number(child.slice(-1))),
  item: (child) => (position) => idFor('c7000000', no, Number(child.slice(-1)) * 16 + position),
  letter: (child) => idFor('d7000000', no, Number(child.slice(-1))),
  skill: (child) => idFor('e7000000', no, Number(child.slice(-1))),
});

// Step constructors. `mirrors` documents the client call; `order` is the client push order.
const ea = (label, sql, mirrors, order) => ({ label, actor: EA_A, sql, mirrors, order });
const ho = (label, sql, mirrors = 'Head Office SQL as postgres (superuser, bypasses RLS; triggers still fire)') => ({ label, actor: 'postgres', sql, mirrors, order: null });

const PUSH = { // offlineSync.js:48-67 PUSH_ORDER and :202-213 ARCHIVE_PUSH_ORDER
  archive: { classes: 1, groups: 1, children: 2, child_programme_enrollments: 3, child_class_memberships: 4,
    child_group_memberships: 5, class_ea_assignments: 6, group_ea_assignments: 6, child_ea_assignments: 7 },
  insert: { children: 2, sessions: 12, session_attendees: 13, battery_runs: 14, assessments: 15, letter_mastery: 16, skill_mastery: 17 },
};

const archiveStep = (table, id, patch, extra = '') => ea(
  `archive.${table}.${NAMES[id]}${extra}`,
  updateById(table, { ...patch, row_version: 2 }, id),
  `outbox archive -> .update(${JSON.stringify(Object.keys(patch).concat('row_version'))}).eq('id').select('id') (offlineSync.js:749-768, ARCHIVE_SERVER_COLUMNS :247-258, send-time row_version syncOutboxRepository.js:184-200)`,
  PUSH.archive[table]
);

const uploadSteps = (b, child, { session = 'group', withSession = true, items = ['run', 'assessment', 'letter', 'skill'], tag = '' } = {}) => {
  const sessionId = session === 'group' ? b.groupSession : b.classSession;
  const group = session === 'group' ? G : null;
  const steps = [];
  if (withSession) {
    steps.push(ea(`upload.session.${session}${tag}`, upsert('sessions', sessionPayload({ id: sessionId, group }), { ignoreDuplicates: true }),
      "sessions insert-or-ignore: .upsert(payload,{onConflict:'id',ignoreDuplicates:true}) (offlineSync.js:794-803, INSERT_OR_IGNORE_TABLES :224-227)", PUSH.insert.sessions));
  }
  steps.push(ea(`upload.attendee.${session}.${NAMES[child]}${tag}`,
    upsert('session_attendees', attendeePayload({ id: b.att(child, session), session: sessionId, child, group }), { ignoreDuplicates: false }),
    "session_attendees merge upsert: .upsert(payloads,{onConflict:'id',ignoreDuplicates:false}) (offlineSync.js:806-818 batch / :794-803 single)", PUSH.insert.session_attendees));
  if (items.includes('run')) {
    const cls = child === D ? null : K; // run class_id = child.class_id (AssessmentChildSelectScreen.js:168-169)
    steps.push(ea(`upload.battery_run.${NAMES[child]}${tag}`, rpcRun(runPayload({ id: b.run(child), child, cls })),
      ".rpc('save_battery_run',{p_run}) (offlineSync.js:678-689)", PUSH.insert.battery_runs));
  }
  if (items.includes('assessment')) {
    steps.push(ea(`upload.assessment.${NAMES[child]}${tag}`, rpcSubmit(familyPayload({ id: b.assessment(child), itemBase: b.item(child), child })),
      ".rpc('submit_assessment',{p_assessment,p_items}) (offlineSync.js:665-676)", PUSH.insert.assessments));
  }
  if (items.includes('letter')) {
    steps.push(ea(`upload.letter_mastery.${NAMES[child]}${tag}`, rpcLetter(letterPayload({ id: b.letter(child), child })),
      ".rpc('set_letter_mastery',args) (offlineSync.js:691-704)", PUSH.insert.letter_mastery));
  }
  if (items.includes('skill')) {
    steps.push(ea(`upload.skill_mastery.${NAMES[child]}${tag}`, rpcSkill(skillPayload({ id: b.skill(child), child })),
      ".rpc('set_skill_mastery',args) (offlineSync.js:707-720)", PUSH.insert.skill_mastery));
  }
  return steps;
};

const hoEndChild = (at = ARCHIVE_AT) => [
  ho('ho.end.child_ea_assignments.CA_C', `UPDATE public.child_ea_assignments SET unassigned_at = ${lit(at)} WHERE id = ${lit(CA_C)} RETURNING id`),
  ho('ho.end.child_class_memberships.CCM_C', `UPDATE public.child_class_memberships SET exited_at = ${lit(at)} WHERE id = ${lit(CCM_C)} RETURNING id`),
  ho('ho.end.child_group_memberships.CGM_C', `UPDATE public.child_group_memberships SET removed_at = ${lit(at)} WHERE id = ${lit(CGM_C)} RETURNING id`),
];
const hoProgrammeSwitch = () => [
  ho('ho.end.staff_programme_assignments.SPA_LIT', `UPDATE public.staff_programme_assignments SET ended_at = ${lit(ARCHIVE_AT)} WHERE id = ${lit(SPA_LIT)} RETURNING id`),
  ho('ho.open.staff_programme_assignments.SPA_NUM', `INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at, created_by) VALUES (${lit(SPA_NUM)}, ${lit(EA_A)}, ${lit(ctx.NUM)}, ${lit(SCHOOL)}, ${lit(ARCHIVE_AT)}, ${lit(HO)}) RETURNING id`),
];
const hoYearRollover = () => [
  ho('ho.year.deactivate_2026', 'UPDATE public.academic_years SET is_active = false WHERE is_active RETURNING label'),
  ho('ho.year.activate_2027', `INSERT INTO public.academic_years (id, label, starts_on, ends_on, is_active) VALUES (${lit(YEAR_2027)}, '2027', '2027-01-15', '2027-12-15', true) RETURNING label`),
];
const eaArchiveChildC = () => [ // childrenRepository.archiveChild (src/db/repositories/childrenRepository.js:930-975)
  archiveStep('children', C, { archived_at: ARCHIVE_AT }),
  archiveStep('child_programme_enrollments', CPE_C, { ended_at: ARCHIVE_AT }),
  archiveStep('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT }),
  archiveStep('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT }),
  archiveStep('child_ea_assignments', CA_C, { unassigned_at: ARCHIVE_AT }),
];
const eaArchiveGroupG = () => [ // groupsRepository.archiveGroup (src/db/repositories/groupsRepository.js:478-526)
  archiveStep('groups', G, { archived_at: ARCHIVE_AT }),
  archiveStep('child_group_memberships', CGM_C, { removed_at: ARCHIVE_AT }),
  archiveStep('child_group_memberships', CGM_D, { removed_at: ARCHIVE_AT }),
  archiveStep('group_ea_assignments', GEA_G, { unassigned_at: ARCHIVE_AT }),
];
const eaArchiveClassK = () => [ // classesRepository.archiveClass (src/db/repositories/classesRepository.js:223-310)
  archiveStep('classes', K, { archived_at: ARCHIVE_AT }),
  ea('update.children.CHILD_C.class_id_null', updateById('children', {
    first_name: 'Child', last_name: 'C', class_id: null, updated_at: ARCHIVE_AT, row_version: 2,
  }, C), "children 'update' (UPDATE_BY_ID_TABLES) -> .update(patch).eq('id').select('id') (offlineSync.js:769-792); archiveClass enqueues it for delivery children only (classesRepository.js:283-305)", PUSH.insert.children),
  archiveStep('child_class_memberships', CCM_C, { exited_at: ARCHIVE_AT }, '.delivery_child_only'),
  archiveStep('class_ea_assignments', CEA_K, { unassigned_at: ARCHIVE_AT }),
];

// ---------------------------------------------------------------- scenarios
const buildScenarios = () => {
  const S = [];
  {
    const b = bundle(0);
    S.push({
      id: 'S0', title: 'Baseline control: no lifecycle change',
      claim: 'Control: every payload used below is valid and accepted while all grants are active (so later refusals are caused by the lifecycle change, not by a bad payload).',
      steps: [
        ...uploadSteps(b, C),
        ...uploadSteps(b, D, { withSession: false, items: ['assessment', 'letter'] }),
        ...uploadSteps(b, E, { session: 'class', items: ['assessment', 'letter'] }),
      ],
    });
  }
  {
    const b = bundle(1);
    S.push({
      id: 'S1', title: "EA's own archive of child C uploads before C's earlier history (Masi push order)",
      claim: "After the phone's own archiveChild syncs (push orders 2-7), work recorded before the archive (push orders 12-17) is refused.",
      steps: [
        ...eaArchiveChildC(),
        ...uploadSteps(b, C, { session: 'group' }),
        ...uploadSteps(b, C, { session: 'class', items: [] }),
      ],
    });
  }
  {
    const b = bundle(2);
    S.push({
      id: 'S1-control', title: 'Same work and archive, but history uploads BEFORE the archive',
      claim: 'Control: if the history is pushed before the lifecycle rows, everything lands and the archive still applies.',
      steps: [
        ...uploadSteps(b, C, { session: 'group' }),
        ...uploadSteps(b, C, { session: 'class', items: [] }),
        ...eaArchiveChildC(),
      ],
    });
  }
  {
    const b = bundle(3);
    S.push({
      id: 'S1b', title: 'S1 with child C created by EA_A (creator arm)',
      claim: 'The children creator arm does not rescue attendees/mastery: write_for_child has no creator arm.',
      setup: `UPDATE public.children SET created_by = ${lit(EA_A)} WHERE id = ${lit(C)};`,
      steps: [...eaArchiveChildC(), ...uploadSteps(b, C, { session: 'group' })],
    });
  }
  {
    const b = bundle(4);
    S.push({
      id: 'S2', title: "Head Office ends C's direct assignment and memberships; EA_A then uploads earlier work",
      claim: 'A Head Office end (no child archive) refuses the same history as S1.',
      steps: [...hoEndChild(), ...uploadSteps(b, C, { session: 'group' }), ...uploadSteps(b, C, { session: 'class', items: [] })],
    });
  }
  {
    const b = bundle(5);
    const batch = [C, D].map((child) => attendeePayload({ id: b.att(child, 'group'), session: b.groupSession, child }));
    S.push({
      id: 'S3', title: 'Group-only child D: EA_A archives group G, then uploads the earlier group session',
      claim: 'After archiveGroup syncs, the session for G lands (held-group rule) but the attendee row for group-only child D is refused.',
      steps: [
        ...eaArchiveGroupG(),
        ea('upload.session.group', upsert('sessions', sessionPayload({ id: b.groupSession }), { ignoreDuplicates: true }),
          'sessions insert-or-ignore (offlineSync.js:794-803)', PUSH.insert.sessions),
        ea('upload.attendees.batch[C,D]', upsert('session_attendees', batch, { ignoreDuplicates: false }),
          'session_attendees batched merge upsert, all ready rows in one request (offlineSync.js:806-818, BATCHABLE_UPSERT_TABLES :215-223)', PUSH.insert.session_attendees),
        ea('upload.attendee.group.CHILD_C(fallback single)', upsert('session_attendees', batch[0], { ignoreDuplicates: false }),
          'per-record fallback after batch failure (offlineSync.js:1311-1400)', PUSH.insert.session_attendees),
        ea('upload.attendee.group.CHILD_D(fallback single)', upsert('session_attendees', batch[1], { ignoreDuplicates: false }),
          'per-record fallback after batch failure (offlineSync.js:1311-1400)', PUSH.insert.session_attendees),
        ...uploadSteps(b, D, { withSession: false, items: ['run', 'assessment'] }).filter((s) => !s.label.startsWith('upload.attendee')),
      ],
    });
  }
  {
    const b = bundle(6);
    S.push({
      id: 'S4', title: "Programme switch: Head Office ends EA_A's literacy programme assignment and opens numeracy",
      claim: 'Earlier literacy work (session, assessment, run) is refused once the literacy staff_programme_assignment has ended.',
      steps: [...hoProgrammeSwitch(), ...uploadSteps(b, C, { session: 'group' })],
    });
  }
  {
    const b = bundle(7);
    S.push({
      id: 'S4b', title: 'Programme switch after the session already landed: attendee and RPC uploads only',
      claim: 'Control for S4: is the attendee itself programme-checked, or only refused because its parent session was refused?',
      steps: [
        ea('upload.session.group(before switch)', upsert('sessions', sessionPayload({ id: b.groupSession }), { ignoreDuplicates: true }),
          'sessions insert-or-ignore (offlineSync.js:794-803)', PUSH.insert.sessions),
        ...hoProgrammeSwitch(),
        ...uploadSteps(b, C, { session: 'group', withSession: false }),
      ],
    });
  }
  {
    const b = bundle(8);
    const s = sessionPayload({ id: b.groupSession });
    const a = attendeePayload({ id: b.att(C, 'group'), session: b.groupSession, child: C });
    const family = familyPayload({ id: b.assessment(C), itemBase: b.item(C), child: C });
    const run = runPayload({ id: b.run(C), child: C });
    const letter = letterPayload({ id: b.letter(C), child: C });
    const skill = skillPayload({ id: b.skill(C), child: C });
    S.push({
      id: 'S5', title: "Lost-response replay after C's grants end (row already on the server)",
      claim: 'A replay of a session/attendee the server already holds is refused 42501 once authority is lost; RPC replays are acknowledged.',
      steps: [
        ea('first.session.group', upsert('sessions', s, { ignoreDuplicates: true }), 'first send, response lost', 12),
        ea('first.attendee.group.CHILD_C', upsert('session_attendees', a, { ignoreDuplicates: false }), 'first send, response lost', 13),
        ea('first.battery_run.CHILD_C', rpcRun(run), 'first send, response lost', 14),
        ea('first.assessment.CHILD_C', rpcSubmit(family), 'first send, response lost', 15),
        ea('first.letter_mastery.CHILD_C', rpcLetter(letter), 'first send, response lost', 16),
        ea('first.skill_mastery.CHILD_C', rpcSkill(skill), 'first send, response lost', 17),
        ...hoEndChild(),
        ea('replay.session.group(insert-or-ignore)', upsert('sessions', s, { ignoreDuplicates: true }), 'exact replay of the client call', 12),
        ea('replay.attendee.group.CHILD_C(merge upsert)', upsert('session_attendees', a, { ignoreDuplicates: false }), 'exact replay of the client call', 13),
        ea('replay.battery_run.CHILD_C', rpcRun(run), 'exact replay', 14),
        ea('replay.assessment.CHILD_C', rpcSubmit(family), 'exact replay', 15),
        ea('replay.letter_mastery.CHILD_C', rpcLetter(letter), 'exact replay', 16),
        ea('replay.skill_mastery.CHILD_C', rpcSkill(skill), 'exact replay', 17),
        { ...ea('VARIANT(not client).attendee merge upsert without RETURNING', upsert('session_attendees', a, { ignoreDuplicates: false, returning: '' }), 'sensitivity: same merge upsert with no RETURNING clause, run as a plain statement', null), plain: true },
        { ...ea('VARIANT(not client).session insert-or-ignore without RETURNING', upsert('sessions', s, { ignoreDuplicates: true, returning: '' }), 'sensitivity: same insert-or-ignore with no RETURNING clause, run as a plain statement', null), plain: true },
        ea('VARIANT(not client).attendee insert-or-ignore', upsert('session_attendees', a, { ignoreDuplicates: true }), 'sensitivity: ON CONFLICT DO NOTHING instead of merge', null),
      ],
    });
  }
  {
    const b = bundle(9);
    const s = sessionPayload({ id: b.groupSession });
    const a = attendeePayload({ id: b.att(C, 'group'), session: b.groupSession, child: C });
    const family = familyPayload({ id: b.assessment(C), itemBase: b.item(C), child: C });
    S.push({
      id: 'S5b', title: 'Lost-response replay after a programme switch',
      claim: 'A replayed session insert-or-ignore for a row the server already holds is refused 42501 once the programme assignment ends.',
      steps: [
        ea('first.session.group', upsert('sessions', s, { ignoreDuplicates: true }), 'first send, response lost', 12),
        ea('first.attendee.group.CHILD_C', upsert('session_attendees', a, { ignoreDuplicates: false }), 'first send, response lost', 13),
        ea('first.assessment.CHILD_C', rpcSubmit(family), 'first send, response lost', 15),
        ...hoProgrammeSwitch(),
        ea('replay.session.group(insert-or-ignore)', upsert('sessions', s, { ignoreDuplicates: true }), 'exact replay of the client call', 12),
        ea('replay.attendee.group.CHILD_C(merge upsert)', upsert('session_attendees', a, { ignoreDuplicates: false }), 'exact replay of the client call', 13),
        ea('replay.assessment.CHILD_C', rpcSubmit(family), 'exact replay', 15),
      ],
    });
  }
  {
    const b = bundle(10);
    S.push({
      id: 'S6a', title: 'Academic-year rollover while EA_A is still assigned to C',
      claim: 'A year flip alone does not refuse earlier-year work while current authority remains.',
      steps: [...hoYearRollover(), ...uploadSteps(b, C, { session: 'group' })],
    });
  }
  {
    const b = bundle(11);
    S.push({
      id: 'S6b', title: "Academic-year rollover after C's grants ended (previous-year assessment/run)",
      claim: 'After the active year flips, an assessment/run dated in the previous year is refused when only historical (held) grants exist.',
      steps: [...hoEndChild(), ...hoYearRollover(), ...uploadSteps(b, C, { session: 'group' })],
    });
  }
  {
    const b = bundle(12);
    const batch = [C, E].map((child) => attendeePayload({ id: b.att(child, 'class'), session: b.classSession, child, group: null }));
    S.push({
      id: 'S7', title: 'Class-only control child E: EA_A archives class K the Masi way',
      claim: 'After archiveClass syncs, an attendee row for class-only child E is refused; the assessment lands via the held-grant arm.',
      steps: [
        ...eaArchiveClassK(),
        ea('upload.session.class', upsert('sessions', sessionPayload({ id: b.classSession, group: null }), { ignoreDuplicates: true }),
          'sessions insert-or-ignore (offlineSync.js:794-803)', PUSH.insert.sessions),
        ea('upload.attendees.batch[C,E]', upsert('session_attendees', batch, { ignoreDuplicates: false }),
          'session_attendees batched merge upsert (offlineSync.js:806-818)', PUSH.insert.session_attendees),
        ea('upload.attendee.class.CHILD_C(fallback single)', upsert('session_attendees', batch[0], { ignoreDuplicates: false }),
          'per-record fallback (offlineSync.js:1311-1400)', PUSH.insert.session_attendees),
        ea('upload.attendee.class.CHILD_E(fallback single)', upsert('session_attendees', batch[1], { ignoreDuplicates: false }),
          'per-record fallback (offlineSync.js:1311-1400)', PUSH.insert.session_attendees),
        ...uploadSteps(b, E, { session: 'class', withSession: false, items: ['run', 'assessment', 'letter'] }).filter((s) => !s.label.startsWith('upload.attendee')),
      ],
    });
  }
  return S;
};

// ---------------------------------------------------------------- fixture
const fixtureSql = () => `
INSERT INTO auth.users (id) VALUES (${lit(HO)}), (${lit(EA_A)});
INSERT INTO public.schools (id, name) VALUES (${lit(SCHOOL)}, 'Repro server refusals school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  (${lit(HO)}, 'Head', 'Office', ${lit(SCHOOL)}, ${lit(ORG)}),
  (${lit(EA_A)}, 'EA', 'A', ${lit(SCHOOL)}, ${lit(ORG)});
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, assigned_at, created_by)
VALUES (${lit(SPA_LIT)}, ${lit(EA_A)}, ${lit(ctx.LIT)}, ${lit(SCHOOL)}, ${lit(GRANT_START)}, ${lit(HO)});
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES (${lit(K)}, ${lit(SCHOOL)}, 'Grade 1 K', '1', ${lit(ctx.YEAR)}, ${lit(HO)});
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  (${lit(C)}, 'Child', 'C', ${lit(K)}, ${lit(HO)}),
  (${lit(D)}, 'Child', 'D', NULL, ${lit(HO)}),
  (${lit(E)}, 'Child', 'E', ${lit(K)}, ${lit(HO)});
INSERT INTO public.child_ea_assignments (id, user_id, child_id, assigned_at, created_by)
VALUES (${lit(CA_C)}, ${lit(EA_A)}, ${lit(C)}, ${lit(GRANT_START)}, ${lit(HO)});
INSERT INTO public.child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at, created_by) VALUES
  (${lit(CCM_C)}, ${lit(C)}, ${lit(K)}, ${lit(ctx.YEAR)}, ${lit(GRANT_START)}, ${lit(HO)}),
  (${lit(CCM_E)}, ${lit(E)}, ${lit(K)}, ${lit(ctx.YEAR)}, ${lit(GRANT_START)}, ${lit(HO)});
INSERT INTO public.child_programme_enrollments (id, child_id, programme_id, enrolled_at, created_by) VALUES
  (${lit(CPE_C)}, ${lit(C)}, ${lit(ctx.LIT)}, ${lit(GRANT_START)}, ${lit(HO)}),
  (${lit(CPE_D)}, ${lit(D)}, ${lit(ctx.LIT)}, ${lit(GRANT_START)}, ${lit(HO)}),
  (${lit(CPE_E)}, ${lit(E)}, ${lit(ctx.LIT)}, ${lit(GRANT_START)}, ${lit(HO)});
INSERT INTO public.class_ea_assignments (id, class_id, ea_user_id, programme_id, assigned_at, created_by)
VALUES (${lit(CEA_K)}, ${lit(K)}, ${lit(EA_A)}, ${lit(ctx.LIT)}, ${lit(GRANT_START)}, ${lit(HO)});
INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
VALUES (${lit(G)}, 'Group G', ${lit(ctx.LIT)}, ${lit(K)}, ${lit(HO)});
INSERT INTO public.group_ea_assignments (id, group_id, ea_user_id, programme_id, assigned_at, created_by)
VALUES (${lit(GEA_G)}, ${lit(G)}, ${lit(EA_A)}, ${lit(ctx.LIT)}, ${lit(GRANT_START)}, ${lit(HO)});
INSERT INTO public.child_group_memberships (id, child_id, group_id, joined_at, created_by) VALUES
  (${lit(CGM_C)}, ${lit(C)}, ${lit(G)}, ${lit(GRANT_START)}, ${lit(HO)}),
  (${lit(CGM_D)}, ${lit(D)}, ${lit(G)}, ${lit(GRANT_START)}, ${lit(HO)});

CREATE SCHEMA repro;
CREATE FUNCTION repro.step(p_label text, p_sql text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE
  v_count bigint; v_rows jsonb; v_state text; v_msg text; v_detail text; v_hint text;
  v_actor text := nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '');
BEGIN
  BEGIN
    EXECUTE 'WITH pgrst_source AS (' || p_sql || ') SELECT pg_catalog.count(*), coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pgrst_source)), ''[]''::jsonb) FROM pgrst_source'
      INTO v_count, v_rows;
    RETURN pg_catalog.jsonb_build_object('label', p_label, 'role', current_user::text, 'actor', v_actor,
      'ok', true, 'rows_affected', v_count, 'returned', v_rows)::text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT,
      v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    RETURN pg_catalog.jsonb_build_object('label', p_label, 'role', current_user::text, 'actor', v_actor,
      'ok', false, 'sqlstate', v_state, 'message', v_msg, 'detail', nullif(v_detail, ''),
      'hint', nullif(v_hint, ''))::text;
  END;
END $fn$;
-- Plain statement (no CTE wrapper, no RETURNING needed); rows from GET DIAGNOSTICS ROW_COUNT.
CREATE FUNCTION repro.step_plain(p_label text, p_sql text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE
  v_count bigint; v_state text; v_msg text; v_detail text; v_hint text;
  v_actor text := nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '');
BEGIN
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN pg_catalog.jsonb_build_object('label', p_label, 'role', current_user::text, 'actor', v_actor,
      'ok', true, 'rows_affected', v_count, 'returned', null)::text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT,
      v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    RETURN pg_catalog.jsonb_build_object('label', p_label, 'role', current_user::text, 'actor', v_actor,
      'ok', false, 'sqlstate', v_state, 'message', v_msg, 'detail', nullif(v_detail, ''),
      'hint', nullif(v_hint, ''))::text;
  END;
END $fn$;
GRANT USAGE ON SCHEMA repro TO authenticated;
GRANT EXECUTE ON FUNCTION repro.step(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION repro.step_plain(text, text) TO authenticated;
`;

const stateSnapshotSql = `
SELECT pg_catalog.jsonb_build_object('label', '__state_after__',
  'sessions', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'programme', p.code, 'group_id', s.group_id, 'class_id', s.class_id) ORDER BY s.id), '[]') FROM public.sessions s JOIN public.programmes p ON p.id = s.programme_id),
  'session_attendees', (SELECT coalesce(jsonb_agg(jsonb_build_object('session_id', a.session_id, 'child_id', a.child_id) ORDER BY a.session_id, a.child_id), '[]') FROM public.session_attendees a),
  'battery_runs', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'child_id', r.child_id, 'programme', p.code) ORDER BY r.id), '[]') FROM public.battery_runs r JOIN public.programmes p ON p.id = r.programme_id),
  'assessments', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'child_id', x.child_id, 'programme', p.code, 'items', (SELECT count(*) FROM public.assessment_items i WHERE i.assessment_id = x.id)) ORDER BY x.id), '[]') FROM public.assessments x JOIN public.programmes p ON p.id = x.programme_id),
  'letter_mastery', (SELECT coalesce(jsonb_agg(jsonb_build_object('child_id', m.child_id, 'correction_id', m.correction_id, 'programme', p.code) ORDER BY m.child_id), '[]') FROM public.letter_mastery m LEFT JOIN public.programmes p ON p.id = m.programme_id),
  'skill_mastery', (SELECT coalesce(jsonb_agg(jsonb_build_object('child_id', m.child_id, 'correction_id', m.correction_id, 'programme', p.code) ORDER BY m.child_id), '[]') FROM public.skill_mastery m LEFT JOIN public.programmes p ON p.id = m.programme_id),
  'lifecycle', jsonb_build_object(
    'CHILD_C.archived_at', (SELECT archived_at FROM public.children WHERE id = ${lit(C)}),
    'CHILD_C.class_id', (SELECT class_id FROM public.children WHERE id = ${lit(C)}),
    'CA_C.unassigned_at', (SELECT unassigned_at FROM public.child_ea_assignments WHERE id = ${lit(CA_C)}),
    'CPE_C.ended_at', (SELECT ended_at FROM public.child_programme_enrollments WHERE id = ${lit(CPE_C)}),
    'CCM_C.exited_at', (SELECT exited_at FROM public.child_class_memberships WHERE id = ${lit(CCM_C)}),
    'CCM_E.exited_at', (SELECT exited_at FROM public.child_class_memberships WHERE id = ${lit(CCM_E)}),
    'CGM_C.removed_at', (SELECT removed_at FROM public.child_group_memberships WHERE id = ${lit(CGM_C)}),
    'CGM_D.removed_at', (SELECT removed_at FROM public.child_group_memberships WHERE id = ${lit(CGM_D)}),
    'GROUP_G.archived_at', (SELECT archived_at FROM public.groups WHERE id = ${lit(G)}),
    'GEA_G.unassigned_at', (SELECT unassigned_at FROM public.group_ea_assignments WHERE id = ${lit(GEA_G)}),
    'CLASS_K.archived_at', (SELECT archived_at FROM public.classes WHERE id = ${lit(K)}),
    'CEA_K.unassigned_at', (SELECT unassigned_at FROM public.class_ea_assignments WHERE id = ${lit(CEA_K)}),
    'SPA_LIT.ended_at', (SELECT ended_at FROM public.staff_programme_assignments WHERE id = ${lit(SPA_LIT)}),
    'SPA_NUM.open', (SELECT count(*) FROM public.staff_programme_assignments WHERE id = ${lit(SPA_NUM)} AND ended_at IS NULL),
    'active_year', (SELECT label FROM public.academic_years WHERE is_active),
    'db_now', pg_catalog.now()
  )
)::text;`;

// Authority probe as EA_A at the end of each scenario (read-only helpers, granted to authenticated).
const probeSql = () => `
SELECT pg_catalog.jsonb_build_object('label', '__ea_a_authority_after__',
  'write_for_child', jsonb_build_object(
    'CHILD_C', private.current_user_can_write_for_child(${lit(C)}),
    'CHILD_D', private.current_user_can_write_for_child(${lit(D)}),
    'CHILD_E', private.current_user_can_write_for_child(${lit(E)})),
  'delivers_to_child_C', private.current_user_delivers_to_child(${lit(C)}),
  'held_group_G_literacy', private.current_user_has_held_group_assignment(${lit(G)}, ${lit(ctx.LIT)})
)::text;`;

const scenarioScript = (scenario) => {
  const lines = ['BEGIN;'];
  if (scenario.setup) lines.push(scenario.setup);
  let current = null;
  for (const step of scenario.steps) {
    if (step.actor !== current) {
      if (step.actor === 'postgres') {
        lines.push("RESET ROLE;\nSET LOCAL request.jwt.claim.sub = '';");
      } else {
        lines.push(`SET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = ${lit(step.actor)};`);
      }
      current = step.actor;
    }
    assert.ok(!step.sql.includes('$step$'));
    lines.push(`SELECT repro.${step.plain ? 'step_plain' : 'step'}(${lit(step.label)}, $step$${step.sql}$step$);`);
  }
  lines.push(`SET LOCAL ROLE authenticated;\nSET LOCAL request.jwt.claim.sub = ${lit(EA_A)};`);
  lines.push(probeSql());
  lines.push('RESET ROLE;');
  lines.push(stateSnapshotSql);
  lines.push('ROLLBACK;');
  return lines.join('\n');
};

const friendly = (value) => JSON.parse(JSON.stringify(value), (key, v) => (typeof v === 'string' && NAMES[v] ? NAMES[v] : v));

const runScenario = (databaseUrl, scenario) => {
  const sql = scenarioScript(scenario);
  const sqlFile = path.join(OUT, 'sql', `${scenario.id}.sql`);
  fs.writeFileSync(sqlFile, `${sql}\n`);
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atq', databaseUrl, '-f', sqlFile], {
    encoding: 'utf8', env: buildPsqlEnv(`repro-${scenario.id}`), timeout: 180_000,
  });
  fs.writeFileSync(path.join(OUT, 'raw', `${scenario.id}.out`), `${result.stdout}${result.stderr ? `\n--- stderr ---\n${result.stderr}` : ''}`);
  assert.equal(result.status, 0, `${scenario.id} scaffolding failed:\n${result.stderr}`);
  const records = result.stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
  const stepResults = records.filter((r) => !r.label.startsWith('__'));
  assert.equal(stepResults.length, scenario.steps.length, `${scenario.id}: expected one result per step`);
  return {
    id: scenario.id,
    title: scenario.title,
    claim: scenario.claim,
    setup: scenario.setup || null,
    steps: stepResults.map((r, i) => ({
      push_order: scenario.steps[i].order,
      mirrors: scenario.steps[i].mirrors,
      ...friendly(r),
    })),
    ea_a_authority_after: friendly(records.find((r) => r.label === '__ea_a_authority_after__')),
    state_after: friendly(records.find((r) => r.label === '__state_after__')),
    sql_file: sqlFile,
  };
};

const main = () => {
  const { databaseUrl, migrations } = loadDatabase();
  try {
    const ids = runPsql({ databaseUrl, label: 'ids', sql: `
      SELECT (SELECT id FROM public.programmes WHERE code = 'literacy') || '|' ||
             (SELECT id FROM public.programmes WHERE code = 'numeracy') || '|' ||
             (SELECT id FROM public.academic_years WHERE is_active) || '|' ||
             (SELECT (pg_catalog.now() AT TIME ZONE 'Africa/Johannesburg')::date);` }).split('|');
    [ctx.LIT, ctx.NUM, ctx.YEAR, ctx.TODAY] = ids;
    NAMES[ctx.LIT] = 'literacy'; NAMES[ctx.NUM] = 'numeracy'; NAMES[ctx.YEAR] = 'year_2026';
    runPsql({ databaseUrl, label: 'fixture', sql: fixtureSql() });
    const results = buildScenarios().map((scenario) => runScenario(databaseUrl, scenario));
    const output = {
      generated_at: new Date().toISOString(),
      masi_commit: spawnSync('git', ['-C', '/Users/jimmckeown/Development/masi-app', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
      migrations_loaded: migrations.length,
      db_today_sast: ctx.TODAY,
      timeline: { GRANT_START, WORK_DAY, WORK_AT, ARCHIVE_AT },
      results,
    };
    fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);
    for (const scenario of results) {
      process.stdout.write(`\n=== ${scenario.id}: ${scenario.title}\n`);
      for (const step of scenario.steps) {
        const outcome = step.ok
          ? `OK rows=${step.rows_affected} returned=${JSON.stringify(step.returned)}`
          : `ERR ${step.sqlstate} ${step.message}${step.detail ? ` | ${step.detail}` : ''}`;
        process.stdout.write(`  [${step.push_order ?? '--'}] ${step.label} (${step.actor || step.role}): ${outcome}\n`);
      }
      process.stdout.write(`  authority: ${JSON.stringify(scenario.ea_a_authority_after)}\n`);
      const st = scenario.state_after;
      process.stdout.write(`  landed: sessions=${st.sessions.length} attendees=${JSON.stringify(st.session_attendees.map((a) => a.child_id))} runs=${st.battery_runs.length} assessments=${st.assessments.length} letter=${JSON.stringify(st.letter_mastery)} skill=${st.skill_mastery.length}\n`);
    }
  } finally {
    if (!process.env.KEEP_DB) dropDatabase();
  }
};

main();
