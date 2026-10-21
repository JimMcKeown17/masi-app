#!/usr/bin/env node

// B2, Task 1: proves session/group C19 authorization against every canonical
// migration in a disposable local PostgreSQL database. Never loads dotenv or
// invokes Supabase CLI. Each behavior case runs in a rolled-back transaction.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR,
  assertDisposableAdminTarget,
  bootstrapSql,
  buildDatabaseUrl,
  expectSqlState,
  runPsql,
} = require('./history-authorization-postgres-harness.cjs');

const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const HEAD_OFFICE = '15000000-0000-0000-0000-000000000001';
const EA_A = '15000000-0000-0000-0000-000000000002';
const EA_B = '15000000-0000-0000-0000-000000000003';
const SCHOOL = '25000000-0000-0000-0000-000000000001';
const CLASS = '45000000-0000-0000-0000-000000000001';
const CHILD_C = '55000000-0000-0000-0000-000000000001';
const CHILD_D = '55000000-0000-0000-0000-000000000002';
const CHILD_C_ASSIGNMENT_A = '65000000-0000-0000-0000-000000000001';
const CHILD_C_ASSIGNMENT_B = '65000000-0000-0000-0000-000000000002';
const G1 = '75000000-0000-0000-0000-000000000001';
const G3 = '75000000-0000-0000-0000-000000000003';
const G_UNHELD = '75000000-0000-0000-0000-000000000004';
const G5 = '75000000-0000-0000-0000-000000000005';
const G4 = '75000000-0000-0000-0000-000000000006';
const G1_ASSIGNMENT = '85000000-0000-0000-0000-000000000001';
const G3_ASSIGNMENT = '85000000-0000-0000-0000-000000000003';
const G4_ASSIGNMENT = '85000000-0000-0000-0000-000000000004';
const G5_FORGED_ASSIGNMENT = '85000000-0000-0000-0000-000000000005';
const C_G1_MEMBERSHIP = '95000000-0000-0000-0000-000000000001';
const LITERACY = "(SELECT id FROM public.programmes WHERE code = 'literacy')";
const NUMERACY = "(SELECT id FROM public.programmes WHERE code = 'numeracy')";
const ACTIVE_YEAR = '(SELECT id FROM public.academic_years WHERE is_active)';

const sessionId = (n) => `86000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const attendeeId = (n) => `96000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const fixtureSql = `
INSERT INTO auth.users (id) VALUES ('${HEAD_OFFICE}'), ('${EA_A}'), ('${EA_B}');
INSERT INTO public.schools (id, name)
VALUES ('${SCHOOL}', 'Session group authorization harness school');
INSERT INTO public.users (id, first_name, last_name, school_id, organization_id) VALUES
  ('${HEAD_OFFICE}', 'Head', 'Office', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${EA_A}', 'Assigned', 'A', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a'),
  ('${EA_B}', 'Assigned', 'B', '${SCHOOL}', 'a111879f-d066-47c9-95a1-bed2a400319a');
INSERT INTO public.staff_programme_assignments (id, user_id, programme_id, school_id, created_by) VALUES
  ('35000000-0000-0000-0000-000000000001', '${EA_A}', ${LITERACY}, '${SCHOOL}', '${HEAD_OFFICE}'),
  ('35000000-0000-0000-0000-000000000002', '${EA_B}', ${LITERACY}, '${SCHOOL}', '${HEAD_OFFICE}');
INSERT INTO public.classes (id, school_id, name, grade, academic_year_id, created_by)
VALUES ('${CLASS}', '${SCHOOL}', 'Session group harness class', '1', ${ACTIVE_YEAR}, '${HEAD_OFFICE}');
INSERT INTO public.children (id, first_name, last_name, class_id, created_by) VALUES
  ('${CHILD_C}', 'Child', 'C', '${CLASS}', '${HEAD_OFFICE}'),
  ('${CHILD_D}', 'Child', 'D', '${CLASS}', '${HEAD_OFFICE}');
INSERT INTO public.child_ea_assignments (
  id, user_id, child_id, created_by, unassigned_at
) VALUES
  ('${CHILD_C_ASSIGNMENT_A}', '${EA_A}', '${CHILD_C}', '${HEAD_OFFICE}', NULL),
  ('${CHILD_C_ASSIGNMENT_B}', '${EA_B}', '${CHILD_C}', '${HEAD_OFFICE}', pg_catalog.now());
INSERT INTO public.groups (id, name, programme_id, class_id, created_by) VALUES
  ('${G1}', 'Held literacy group', ${LITERACY}, '${CLASS}', '${HEAD_OFFICE}'),
  ('${G3}', 'Held numeracy group', ${NUMERACY}, '${CLASS}', '${HEAD_OFFICE}'),
  ('${G_UNHELD}', 'Unheld literacy group', ${LITERACY}, '${CLASS}', '${HEAD_OFFICE}'),
  ('${G5}', 'EA-created numeracy group', ${NUMERACY}, '${CLASS}', '${EA_A}');
INSERT INTO public.group_ea_assignments (
  id, group_id, ea_user_id, programme_id, created_by
) VALUES
  ('${G1_ASSIGNMENT}', '${G1}', '${EA_A}', ${LITERACY}, '${HEAD_OFFICE}'),
  ('${G3_ASSIGNMENT}', '${G3}', '${EA_A}', ${NUMERACY}, '${HEAD_OFFICE}');
INSERT INTO public.child_group_memberships (id, child_id, group_id, created_by)
VALUES ('${C_G1_MEMBERSHIP}', '${CHILD_C}', '${G1}', '${HEAD_OFFICE}');
`;

// Setup runs as postgres before the actor's statements; the whole transaction rolls back.
const asActor = (actorId, statement, setup = '') => `
BEGIN;
${setup}
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '${actorId}';
${statement}
ROLLBACK;
`;

const returnedIds = (output) => output.split('\n').map((line) => line.trim()).filter(Boolean);

// PostgREST's upsert (Prefer: resolution=merge-duplicates) for the mobile payload shape.
const upsertSql = (table, columns, values, returning = false) => `
INSERT INTO public.${table} (${columns.join(', ')})
VALUES ${(Array.isArray(values[0]) ? values : [values]).map((row) => `(${row.join(', ')})`).join(', ')}
ON CONFLICT (id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ')}${returning ? ' RETURNING id' : ''};
`;

// PostgREST's update(...).eq('id', ...).select('id').
const updateByIdSql = (table, assignments, id) => `
UPDATE public.${table} SET ${assignments} WHERE id = '${id}' RETURNING id;
`;

const sessionUpsert = ({
  id,
  actor = EA_A,
  programme = LITERACY,
  group = null,
  state = null,
  sessionDate = '2026-10-20',
}) => {
  const columns = ['id', 'user_id', 'programme_id', 'session_date'];
  const values = [`'${id}'`, `'${actor}'`, programme, `'${sessionDate}'`];
  if (group !== undefined) {
    columns.push('group_id');
    values.push(group === null ? 'NULL' : `'${group}'`);
  }
  if (state !== null) {
    columns.push('state');
    values.push(`'${state}'`);
  }
  return upsertSql('sessions', columns, values, true);
};

const attendeeUpsert = ({ id, session, child = CHILD_C, group = null }) => {
  const columns = ['id', 'session_id', 'child_id'];
  const values = [`'${id}'`, `'${session}'`, `'${child}'`];
  if (group !== undefined) {
    columns.push('group_id');
    values.push(group === null ? 'NULL' : `'${group}'`);
  }
  return upsertSql('session_attendees', columns, values, true);
};

const setupSession = ({
  id,
  actor = EA_A,
  programme = LITERACY,
  group = null,
  sessionDate = '2026-10-20',
}) => `
INSERT INTO public.sessions (id, user_id, programme_id, session_date, group_id)
VALUES ('${id}', '${actor}', ${programme}, DATE '${sessionDate}', ${group === null ? 'NULL' : `'${group}'`});
`;

const setupAttendee = ({ id, session, child = CHILD_C, group = null }) => `
INSERT INTO public.session_attendees (id, session_id, child_id, group_id)
VALUES ('${id}', '${session}', '${child}', ${group === null ? 'NULL' : `'${group}'`});
`;

const endG1Assignment = `
UPDATE public.group_ea_assignments
SET unassigned_at = pg_catalog.now(), handover_reason = 'Session group harness end'
WHERE id = '${G1_ASSIGNMENT}';
`;

const forgedG5Assignment = `
INSERT INTO public.group_ea_assignments (
  id, group_id, ea_user_id, programme_id, created_by, unassigned_at
) VALUES (
  '${G5_FORGED_ASSIGNMENT}', '${G5}', '${EA_A}', ${LITERACY}, '${EA_A}', pg_catalog.now()
) RETURNING id;
`;

const runSessionGroupCases = (databaseUrl) => {
  const passed = [];
  const accepts = (label, sql, expected) => {
    assert.deepEqual(
      returnedIds(runPsql({ databaseUrl, label, sql })),
      expected,
      label
    );
    passed.push(label);
  };
  const denies = (label, sql, sqlState = '42501') => {
    expectSqlState({ databaseUrl, label, sql, sqlState });
    passed.push(label);
  };

  const heldActiveSession = sessionId(1);
  accepts(
    'session-group-held-active',
    asActor(EA_A, sessionUpsert({ id: heldActiveSession, group: G1 })),
    [heldActiveSession]
  );

  const heldEndedSession = sessionId(2);
  accepts(
    'session-group-held-ended',
    asActor(
      EA_A,
      sessionUpsert({ id: heldEndedSession, group: G1 }),
      endG1Assignment
    ),
    [heldEndedSession]
  );

  const deleteSequenceSession = sessionId(3);
  const deleteSequenceAttendee = attendeeId(3);
  accepts(
    'session-group-delete-sequence',
    asActor(EA_A, `
      ${updateByIdSql(
        'groups',
        `archived_at = pg_catalog.now(), archived_by_user_id = '${EA_A}', archive_reason = 'Harness archive'`,
        G1
      )}
      ${updateByIdSql('child_group_memberships', 'removed_at = pg_catalog.now()', C_G1_MEMBERSHIP)}
      ${updateByIdSql(
        'group_ea_assignments',
        "unassigned_at = pg_catalog.now(), handover_reason = 'Harness archive'",
        G1_ASSIGNMENT
      )}
      ${sessionUpsert({ id: deleteSequenceSession, group: G1 })}
      ${attendeeUpsert({ id: deleteSequenceAttendee, session: deleteSequenceSession, group: G1 })}
    `),
    [G1, C_G1_MEMBERSHIP, G1_ASSIGNMENT, deleteSequenceSession, deleteSequenceAttendee]
  );

  denies(
    'session-group-never-held',
    asActor(EA_B, sessionUpsert({ id: sessionId(4), actor: EA_B, group: G1 }))
  );

  denies(
    'session-group-other-programme',
    asActor(EA_A, sessionUpsert({ id: sessionId(5), group: G3 }))
  );

  accepts(
    'session-group-forged-assignment-programme-insert',
    asActor(EA_A, forgedG5Assignment),
    [G5_FORGED_ASSIGNMENT]
  );
  denies(
    'session-group-forged-assignment-programme-session',
    asActor(EA_A, `
      ${forgedG5Assignment}
      ${sessionUpsert({ id: sessionId(6), group: G5 })}
    `)
  );
  const plainSession = sessionId(7);
  denies(
    'session-group-forged-assignment-programme-attendee',
    asActor(
      EA_A,
      `${forgedG5Assignment}
       ${attendeeUpsert({ id: attendeeId(7), session: plainSession, group: G5 })}`,
      setupSession({ id: plainSession })
    )
  );
  passed.push('session-group-forged-assignment-programme');

  denies(
    'session-group-unheld',
    asActor(EA_A, sessionUpsert({ id: sessionId(8), group: G_UNHELD }))
  );

  const nullGroupSession = sessionId(9);
  accepts(
    'session-group-null',
    asActor(EA_A, sessionUpsert({ id: nullGroupSession, group: undefined })),
    [nullGroupSession]
  );

  denies(
    'session-state-guard-kept-null-group',
    asActor(EA_A, sessionUpsert({ id: sessionId(10), group: undefined, state: 'in_progress' }))
  );
  denies(
    'session-state-guard-kept-held-group',
    asActor(EA_A, sessionUpsert({ id: sessionId(11), group: G1, state: 'in_progress' }))
  );
  passed.push('session-state-guard-kept');

  const conflictSession = sessionId(12);
  const conflictAttendee = attendeeId(12);
  accepts(
    'session-upsert-conflict-after-end',
    asActor(
      EA_A,
      `${sessionUpsert({ id: conflictSession, group: G1 })}
       SELECT group_id FROM public.sessions WHERE id = '${conflictSession}';`,
      `${setupSession({ id: conflictSession, group: G1 })}
       ${setupAttendee({ id: conflictAttendee, session: conflictSession, group: G1 })}
       ${endG1Assignment}`
    ),
    [conflictSession, G1]
  );

  const updateSession = sessionId(13);
  denies(
    'session-update-to-unheld-group',
    asActor(
      EA_A,
      updateByIdSql('sessions', `group_id = '${G_UNHELD}'`, updateSession),
      `${setupSession({ id: updateSession, group: G1 })}
       ${setupAttendee({ id: attendeeId(13), session: updateSession, group: G1 })}`
    )
  );

  const endedAttendeeSession = sessionId(14);
  const endedAttendee = attendeeId(14);
  accepts(
    'attendee-group-held-after-end',
    asActor(
      EA_A,
      attendeeUpsert({ id: endedAttendee, session: endedAttendeeSession, group: G1 }),
      `${setupSession({ id: endedAttendeeSession, group: G1 })}
       ${endG1Assignment}`
    ),
    [endedAttendee]
  );

  const unheldAttendeeSession = sessionId(15);
  denies(
    'attendee-group-unheld',
    asActor(
      EA_A,
      attendeeUpsert({ id: attendeeId(15), session: unheldAttendeeSession, group: G_UNHELD }),
      setupSession({ id: unheldAttendeeSession, group: G1 })
    )
  );

  const nullAttendeeSession = sessionId(16);
  const nullAttendee = attendeeId(16);
  accepts(
    'attendee-group-null',
    asActor(
      EA_A,
      attendeeUpsert({ id: nullAttendee, session: nullAttendeeSession, group: undefined }),
      setupSession({ id: nullAttendeeSession })
    ),
    [nullAttendee]
  );

  const childCheckSession = sessionId(17);
  denies(
    'attendee-child-check-unchanged',
    asActor(
      EA_A,
      attendeeUpsert({
        id: attendeeId(17),
        session: childCheckSession,
        child: CHILD_D,
        group: G1,
      }),
      setupSession({ id: childCheckSession, group: G1 })
    )
  );

  const beforeAssignmentSession = sessionId(18);
  denies(
    'session-before-own-assignment-refused',
    asActor(EA_A, `
      INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
      VALUES ('${G4}', 'New literacy group', ${LITERACY}, '${CLASS}', '${EA_A}');
      ${sessionUpsert({ id: beforeAssignmentSession, group: G4 })}
    `)
  );
  accepts(
    'session-before-own-assignment-accepted-after-assignment',
    asActor(EA_A, `
      INSERT INTO public.groups (id, name, programme_id, class_id, created_by)
      VALUES ('${G4}', 'New literacy group', ${LITERACY}, '${CLASS}', '${EA_A}');
      INSERT INTO public.group_ea_assignments (
        id, group_id, ea_user_id, programme_id, created_by
      ) VALUES ('${G4_ASSIGNMENT}', '${G4}', '${EA_A}', ${LITERACY}, '${EA_A}');
      ${sessionUpsert({ id: beforeAssignmentSession, group: G4 })}
    `),
    [beforeAssignmentSession]
  );
  passed.push('session-before-own-assignment');

  const historySession = sessionId(19);
  accepts(
    'history-page-returns-group-to-never-holder',
    asActor(
      EA_B,
      `SELECT id || '|' || group_id
       FROM public.get_delivery_history_page(
         ${LITERACY}, DATE '2026-01-01', 200, NULL, NULL, 0
       )
       WHERE id = '${historySession}';`,
      `${setupSession({ id: historySession, group: G1, sessionDate: '2026-10-19' })}
       ${setupAttendee({ id: attendeeId(19), session: historySession, group: G1 })}`
    ),
    [`${historySession}|${G1}`]
  );

  accepts(
    'helper-execute-grants',
    asActor(EA_A, `
      SELECT has_function_privilege(
          'authenticated',
          'private.current_user_has_held_group_assignment(uuid,uuid)',
          'EXECUTE'
        ), has_function_privilege(
          'anon',
          'private.current_user_has_held_group_assignment(uuid,uuid)',
          'EXECUTE'
        ), has_function_privilege(
          'public',
          'private.current_user_has_held_group_assignment(uuid,uuid)',
          'EXECUTE'
        );
    `),
    ['t|f|f']
  );
  expectSqlState({
    databaseUrl,
    label: 'helper-anon-call-refused',
    sqlState: '42501',
    sql: `BEGIN;
      SET LOCAL ROLE anon;
      SELECT private.current_user_has_held_group_assignment('${G1}', ${LITERACY});
      ROLLBACK;`,
  });
  passed.push('helper-anon-call-refused');

  accepts(
    'pins-replaced',
    asActor(EA_A, `
      SELECT
        count(*) FILTER (
          WHERE policyname LIKE 'sessions_forward_prep_pin_defaults_%'
        ),
        count(*) FILTER (
          WHERE policyname IN (
            'sessions_state_completed_group_held_insert',
            'sessions_state_completed_group_held_update',
            'session_attendees_group_held_insert',
            'session_attendees_group_held_update'
          ) AND permissive = 'RESTRICTIVE'
        )
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public';
    `),
    ['0|4']
  );

  return passed;
};

const main = () => {
  const baseName = process.env.HISTORY_RLS_DATABASE_NAME;
  const databaseName = baseName ? `${baseName}_session_group` : baseName;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.HISTORY_RLS_ADMIN_DATABASE_URL,
    databaseName,
    confirmation: process.env.HISTORY_RLS_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  const quotedDatabase = quoteIdentifier(databaseName);

  runPsql({
    databaseUrl: adminDatabaseUrl,
    sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`,
    label: 'drop-stale-database',
  });
  runPsql({
    databaseUrl: adminDatabaseUrl,
    sql: `CREATE DATABASE ${quotedDatabase};`,
    label: 'create-database',
  });
  try {
    runPsql({ databaseUrl, sql: bootstrapSql, label: 'bootstrap' });
    runPsql({
      databaseUrl,
      label: 'supabase-default-privileges',
      sql: `
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
      `,
    });
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort()) {
      runPsql({
        databaseUrl,
        file: path.join(MIGRATIONS_DIR, filename),
        label: `migration-${filename}`,
      });
    }
    runPsql({ databaseUrl, sql: fixtureSql, label: 'session-group-fixture' });
    const cases = runSessionGroupCases(databaseUrl);
    process.stdout.write(`${JSON.stringify({ passed: cases.length, cases })}\n`);
  } finally {
    runPsql({
      databaseUrl: adminDatabaseUrl,
      sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`,
      label: 'drop-database',
    });
  }
};

if (require.main === module) {
  main();
}

module.exports = { fixtureSql, runSessionGroupCases };
