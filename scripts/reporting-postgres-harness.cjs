#!/usr/bin/env node
// Local PostgreSQL 17 only. No hosted database or credentials are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MIGRATIONS_DIR, assertDisposableAdminTarget, buildDatabaseUrl,
  bootstrapSql, runPsql, expectSqlState,
} = require('./history-authorization-postgres-harness.cjs');
const { installDefaultPrivileges } = require('./support-incident-postgres-harness.cjs');

// Fixed fixture identities; later tasks extend this block and seedFixture.
const UUID_EA_A = '14000000-0000-0000-0000-000000000001';
const UUID_EA_B = '14000000-0000-0000-0000-000000000002';
const UUID_EA_LATE = '14000000-0000-0000-0000-000000000003';
const UUID_EA_LEDGER = '14000000-0000-0000-0000-000000000004';
const UUID_EA_SUSP = '14000000-0000-0000-0000-000000000005';
const UUID_EA_TEST = '14000000-0000-0000-0000-000000000006';
const UUID_EA_NOPROG = '14000000-0000-0000-0000-000000000007';
const UUID_SCHOOL_1 = '24000000-0000-0000-0000-000000000001';
const UUID_SCHOOL_2 = '24000000-0000-0000-0000-000000000002';
const UUID_C1 = '54000000-0000-0000-0000-000000000001';
const UUID_CORRECTION = '64000000-0000-0000-0000-000000000001';
const UUID_CURRENT_CORRECTION = '64000000-0000-0000-0000-000000000002';
const UUID_SESSION_A = '84000000-0000-0000-0000-000000000001';
const UUID_SESSION_LATE = '84000000-0000-0000-0000-000000000002';
const UUID_ORGANIZATION = 'a111879f-d066-47c9-95a1-bed2a400319a';

const UUID_EA_MOVE = '14000000-0000-0000-0000-000000000008';
const UUID_EA_BULK = '14000000-0000-0000-0000-000000000009';
const UUID_K1 = '34000000-0000-0000-0000-000000000001';
const UUID_K2 = '34000000-0000-0000-0000-000000000002';
const UUID_G1 = '44000000-0000-0000-0000-000000000001';
const childId = (n) => `54000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const runId = (n) => `74000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const REPORTING_FUNCTIONS = [
  'public.masi_reporting_accounts_v1()',
  'public.masi_reporting_roster_v1(uuid[])',
  'public.masi_reporting_assessed_children_v1(uuid[], date, date)',
  'public.masi_reporting_daily_v1(uuid[], date, date)',
  'public.masi_reporting_ea_detail_v1(uuid, date, date)',
  'public.masi_reporting_sessions_v1(uuid[], date, date)',
  'public.masi_reporting_assessments_v1(uuid[], date, date)',
  'public.masi_reporting_time_entries_v1(uuid[], date, date)',
  'public.masi_reporting_incidents_v1(uuid[], timestamp with time zone, timestamp with time zone, text[])',
];
// Computed on a fully replayed schema (2026-10-31): the only non-reporting function the reader can
// EXECUTE is the PUBLIC-executable trigger function below; the reader has no USAGE on private and
// trigger functions cannot be called directly. Each entry has a refusal case in runCases.
const AUTH_GUARDED_ALLOWLIST = ['private.set_updated_at()'];
const T_LEDGER = '2026-10-29T09:00:00Z';
const READER_SQL = (sql) => `BEGIN READ ONLY; SET LOCAL ROLE masi_reporting_reader; ${sql}\nROLLBACK;`;
// runPsql and expectSqlState inherit PGTZ through their shared buildPsqlEnv.
process.env.PGTZ = 'UTC';
const asReader = (databaseUrl, sql) => runPsql({ databaseUrl, sql: READER_SQL(sql), label: 'as-reader' });

function seedFixture(databaseUrl) {
  const ids = [UUID_EA_A, UUID_EA_B, UUID_EA_LATE, UUID_EA_LEDGER, UUID_EA_SUSP, UUID_EA_TEST, UUID_EA_NOPROG, UUID_EA_MOVE, UUID_EA_BULK];
  runPsql({ databaseUrl, label: 'reporting-fixture', sql: `
INSERT INTO auth.users(id) VALUES ${ids.map((id) => `('${id}')`).join(',')};
UPDATE auth.users SET banned_until = '2099-01-01T00:00:00Z' WHERE id = '${UUID_EA_SUSP}';
UPDATE auth.users SET raw_app_meta_data = '{"is_test_account":true}' WHERE id = '${UUID_EA_TEST}';
INSERT INTO public.schools(id,name,school_uid) VALUES
 ('${UUID_SCHOOL_1}','Reporting school 1','REPORTING-001'), ('${UUID_SCHOOL_2}','Reporting school 2',NULL);
INSERT INTO public.users(id,first_name,last_name,organization_id,school_id)
VALUES ${ids.map((id, i) => `('${id}','Reporting','EA ${i}','${UUID_ORGANIZATION}','${UUID_SCHOOL_1}')`).join(',')};
UPDATE public.academic_years SET is_active = false WHERE is_active AND label <> '2026';
INSERT INTO public.academic_years(label,starts_on,ends_on,is_active) VALUES ('2026','2026-01-01','2026-12-31',true)
ON CONFLICT(label) DO UPDATE SET starts_on=excluded.starts_on, ends_on=excluded.ends_on, is_active=true;
UPDATE public.programmes SET daily_session_target = CASE code WHEN 'literacy' THEN 3 WHEN 'numeracy' THEN 5 WHEN 'yeboneer' THEN 1 END
WHERE code IN ('literacy','numeracy','yeboneer');
INSERT INTO public.staff_programme_assignments(user_id,programme_id,school_id,assigned_at)
VALUES ('${UUID_EA_A}',(SELECT id FROM public.programmes WHERE code='literacy'),'${UUID_SCHOOL_1}','2026-09-01T00:00:00Z');
INSERT INTO public.children(id,first_name,last_name,created_by) VALUES ('${UUID_C1}','Reporting','Child','${UUID_EA_A}');
INSERT INTO public.letter_mastery_corrections(correction_id,child_id,letter,language,confirmed,requested_at,effective_at,changed_by,received_at)
VALUES ('${UUID_CORRECTION}','${UUID_C1}','s','en',true,'${T_LEDGER}','${T_LEDGER}','${UUID_EA_LEDGER}','${T_LEDGER}');
INSERT INTO public.letter_mastery(id,child_id,letter,language,confirmed,changed_at,correction_id,changed_by)
VALUES (private.letter_mastery_id('${UUID_C1}','s','en'),'${UUID_C1}','s','en',false,'2026-10-30T09:00:00Z','${UUID_CURRENT_CORRECTION}','${UUID_EA_B}');
INSERT INTO public.mobile_support_incidents(reporter_id,kind,repeat_key,report_id,payload,observed)
VALUES ('${UUID_EA_A}','diagnostics_sent','reporting-fixture',gen_random_uuid(),'{}',
 '{"application":{"version":"1.5.0","build":"55"},"device":{"platform":"android"}}');
INSERT INTO public.sessions(id,user_id,programme_id,session_date,created_at)
VALUES ('${UUID_SESSION_A}','${UUID_EA_A}',(SELECT id FROM public.programmes WHERE code='literacy'),'2026-10-20','2026-10-20T08:00:00Z');
` });
  // INSERT and SELECT share a transaction: server INSERT stamp and captured now()
  // are exactly equal, including microseconds (no JavaScript date round-trip).
  const T_LATE = runPsql({ databaseUrl, label: 'late-upload-fixture', sql: `BEGIN;
INSERT INTO public.sessions(id,user_id,programme_id,session_date,created_at)
VALUES ('${UUID_SESSION_LATE}','${UUID_EA_LATE}',(SELECT id FROM public.programmes WHERE code='literacy'),'2026-10-13','2026-10-13T08:00:00Z');
SELECT pg_catalog.now()::text;
COMMIT;` });
  runPsql({ databaseUrl, label: 'reporting-task-2-4-fixture', sql: `
INSERT INTO public.children(id,first_name,last_name,created_by)
SELECT ('54000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'Child',n::text,'${UUID_EA_A}' FROM generate_series(2,11) n;
INSERT INTO public.classes(id,school_id,name,grade,academic_year_id) VALUES
('${UUID_K1}','${UUID_SCHOOL_1}','K1','R',(SELECT id FROM public.academic_years WHERE label='2026')),
('${UUID_K2}','${UUID_SCHOOL_1}','K2','R',(SELECT id FROM public.academic_years WHERE label='2026'));
INSERT INTO public.staff_programme_assignments(user_id,programme_id,assigned_at,ended_at)
SELECT '${UUID_EA_MOVE}',id,'2026-09-01','2026-10-27' FROM public.programmes WHERE code='literacy';
INSERT INTO public.staff_programme_assignments(user_id,programme_id,assigned_at)
SELECT u,id,'2026-10-28' FROM public.programmes CROSS JOIN (VALUES ('${UUID_EA_B}'::uuid),('${UUID_EA_MOVE}'::uuid)) x(u)
WHERE code=CASE WHEN u='${UUID_EA_MOVE}'::uuid THEN 'numeracy' ELSE 'literacy' END;
INSERT INTO public.child_ea_assignments(user_id,child_id,assigned_at)
SELECT '${UUID_EA_A}',id,'2026-01-01' FROM public.children WHERE id BETWEEN '${childId(1)}' AND '${childId(6)}';
INSERT INTO public.child_ea_assignments(user_id,child_id,assigned_at) VALUES ('${UUID_EA_B}','${UUID_C1}','2026-01-01'),('${UUID_EA_MOVE}','${childId(7)}','2026-01-01');
INSERT INTO public.child_programme_enrollments(child_id,programme_id,enrolled_at,ended_at)
SELECT c.id,p.id,'2026-01-01',CASE WHEN c.id='${childId(3)}' THEN '2026-10-01'::timestamptz END
FROM public.children c CROSS JOIN public.programmes p WHERE p.code='literacy';
INSERT INTO public.child_class_memberships(child_id,class_id,academic_year_id,enrolled_at,exited_at)
SELECT c.id,CASE WHEN c.id='${childId(5)}' THEN '${UUID_K2}'::uuid ELSE '${UUID_K1}'::uuid END,y.id,'2026-01-01',
CASE WHEN c.id='${childId(4)}' THEN '2026-10-01'::timestamptz END FROM public.children c CROSS JOIN public.academic_years y WHERE y.label='2026';
UPDATE public.classes SET archived_at=now() WHERE id='${UUID_K2}';
UPDATE public.children SET archived_at=now() WHERE id='${childId(6)}';
INSERT INTO public.groups(id,name,programme_id,class_id) SELECT '${UUID_G1}','G1',id,'${UUID_K1}' FROM public.programmes WHERE code='literacy';
INSERT INTO public.group_ea_assignments(group_id,ea_user_id,programme_id) SELECT '${UUID_G1}','${UUID_EA_A}',id FROM public.programmes WHERE code='literacy';
INSERT INTO public.child_group_memberships(child_id,group_id) VALUES ('${UUID_C1}','${UUID_G1}'),('${childId(2)}','${UUID_G1}');
-- sessions_prevent_identity_change forbids setting group_id after insert, so re-create the
-- session with its group, as a phone upload would, keeping id, client created_at and date.
CREATE TEMP TABLE session_a_copy AS SELECT * FROM public.sessions WHERE id='${UUID_SESSION_A}';
DELETE FROM public.sessions WHERE id='${UUID_SESSION_A}';
INSERT INTO public.sessions(id,user_id,programme_id,class_id,group_id,session_date,state,activities,created_at)
SELECT id,user_id,programme_id,'${UUID_K1}','${UUID_G1}',session_date,state,
'{"letters_focused":["s","a"],"session_reading_level":"cannot_blend"}'::jsonb,created_at FROM session_a_copy;
INSERT INTO public.session_attendees(session_id,child_id,attendance_status) VALUES ('${UUID_SESSION_A}','${UUID_C1}','present'),('${UUID_SESSION_A}','${childId(2)}','late'),('${UUID_SESSION_A}','${childId(3)}','absent');
INSERT INTO public.sessions(user_id,programme_id,session_date,state)
SELECT '${UUID_EA_MOVE}',id,d,'completed' FROM public.programmes CROSS JOIN (VALUES ('2026-10-20'::date),('2026-10-21'::date)) x(d) WHERE code='literacy';
INSERT INTO public.sessions(user_id,programme_id,session_date,state) SELECT '${UUID_EA_A}',id,'2026-10-20','discarded' FROM public.programmes WHERE code='literacy';
INSERT INTO public.time_entries(user_id,sign_in_time,sign_out_time,auto_clocked_out) VALUES
('${UUID_EA_A}','2026-10-20T05:00Z','2026-10-20T13:30Z',false),
('${UUID_EA_A}','2026-10-21T05:00Z','2026-10-21T15:00Z',true),
('${UUID_EA_A}','2026-10-19T22:30Z',NULL,false);
INSERT INTO public.battery_runs(id,battery_code,battery_version,child_id,user_id,programme_id,language,started_at,completed_at,status)
SELECT ('74000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'wela_plus','2026.1',
CASE WHEN n=1 THEN '${childId(2)}'::uuid ELSE '${UUID_C1}'::uuid END,'${UUID_EA_A}',p.id,'en','2026-10-19T20:00Z',
CASE WHEN n=1 THEN '2026-10-19T22:30Z'::timestamptz WHEN n=4 THEN '2026-10-20T22:30Z'::timestamptz END,
CASE n WHEN 1 THEN 'completed' WHEN 2 THEN 'abandoned' WHEN 3 THEN 'in_progress' ELSE 'completed' END
FROM generate_series(1,4) n CROSS JOIN public.programmes p WHERE p.code='literacy';
INSERT INTO public.assessments(user_id,child_id,programme_id,assessment_type,assessment_date,question_code,score,total_items,derived,stopped_reason,battery_run_id)
SELECT '${UUID_EA_A}','${UUID_C1}',p.id,'letter_sounds','2026-10-20',q,1,4,'{}','completed','${runId(4)}'
FROM public.programmes p CROSS JOIN (VALUES ('letter_sounds'),('word_reading')) x(q) WHERE p.code='literacy';
INSERT INTO public.assessments(user_id,child_id,programme_id,assessment_type,assessment_date,question_code,score,total_items,derived,stopped_reason)
SELECT u,c,p.id,'letter_sounds',d,q,sc,4,j::jsonb,reason FROM public.programmes p CROSS JOIN (VALUES
('${UUID_EA_B}'::uuid,'${childId(2)}'::uuid,'2026-02-01'::date,'letter_sounds',1,'{}','completed'),
('${UUID_EA_A}','${childId(8)}','2026-10-22','letter_sounds',NULL,'{}','skipped_child_refused'),
('${UUID_EA_A}','${childId(9)}','2026-10-22','letter_sounds',0,'{}','completed'),
('${UUID_EA_TEST}','${childId(10)}','2026-10-20','letter_sounds',1,'{}','completed'),
('${UUID_EA_B}','${childId(11)}','2026-01-20','letter_sounds',1,'{}','completed'),
('${UUID_EA_B}','${childId(11)}','2026-10-20','letter_sounds',1,'{}','completed'),
('${UUID_EA_A}','${UUID_C1}','2026-10-22','wela_plus_story_writing',12,'{"max":16,"ea_rubric_total":12}','completed'),
('${UUID_EA_A}','${UUID_C1}','2026-10-22',NULL,1,'{}',NULL)
) x(u,c,d,q,sc,j,reason) WHERE p.code='literacy';
INSERT INTO public.assessments(user_id,child_id,programme_id,assessment_type,assessment_date,question_code,battery_run_id)
SELECT '${UUID_EA_A}','${UUID_C1}',p.id,'letter_sounds','2026-10-23','letter_sounds',b.id
FROM public.programmes p CROSS JOIN public.battery_runs b WHERE p.code='literacy' AND b.id IN ('${runId(2)}','${runId(3)}');
INSERT INTO public.assessments(user_id,child_id,programme_id,assessment_type,assessment_date,question_code)
SELECT '${UUID_EA_BULK}','${UUID_C1}',p.id,'letter_sounds','2026-10-14'::date+(n%7),'letter_sounds'
FROM generate_series(1,504) n CROSS JOIN public.programmes p WHERE p.code='literacy';
INSERT INTO public.mobile_support_incidents(reporter_id,kind,repeat_key,report_id,payload,observed,screenshot_path,received_at)
VALUES ('${UUID_EA_A}','ea_report','human-report',gen_random_uuid(),'{"message":"Save button hidden"}','{}','fixture/screenshot.png','2026-10-22T09:00Z'),
('${UUID_EA_TEST}','ea_report','outside-filter',gen_random_uuid(),'{"message":"Outside"}','{}',NULL,'2026-10-22T09:00Z');
` });
  return { T_LATE };
}

function runCases(databaseUrl, { T_LATE }) {
  const summary = {};
  const c = {
    value(name, sql, expected) {
      assert.equal(runPsql({ databaseUrl, sql, label: name }), expected, name);
      summary[name] = 'passed';
    },
    state(name, sql, sqlState) {
      expectSqlState({ databaseUrl, sql, label: name, sqlState });
      summary[name] = 'passed';
    },
  };
  const account = (id, expression) => `SELECT ${expression} FROM
jsonb_array_elements(public.masi_reporting_accounts_v1()->'accounts') a WHERE a->>'user_id'='${id}';`;
  c.value('accounts-shape', `SELECT jsonb_agg(k ORDER BY k)::text FROM
jsonb_object_keys(public.masi_reporting_accounts_v1()) k;`, '["academic_year", "accounts", "function_version", "generated_at", "programmes", "schools"]');
  c.value('accounts-ea-a', account(UUID_EA_A, "a#>>'{assignment,programme_code}'"), 'literacy');
  c.value('accounts-received-uses-server-time', account(UUID_EA_LATE,
    `(a#>>'{activity,last_data_received_at}')::timestamptz = '${T_LATE}'::timestamptz`), 't');
  c.value('accounts-received-ledger', account(UUID_EA_LEDGER,
    `(a#>>'{activity,last_data_received_at}')::timestamptz = '${T_LEDGER}'::timestamptz`), 't');
  c.value('accounts-received-never', account(UUID_EA_NOPROG, "a#>'{activity,last_data_received_at}' = 'null'::jsonb"), 't');
  c.value('accounts-test-flag', account(UUID_EA_TEST, "a#>>'{auth,is_test_flag}'"), 'true');
  c.value('accounts-release', account(UUID_EA_A, "a#>>'{last_receipt,app_version}'"), '1.5.0');
  c.value('accounts-noprog', account(UUID_EA_NOPROG, "a->'assignment' = 'null'::jsonb"), 't');
  const ids = (list) => `ARRAY[${list.map(id => `'${id}'::uuid`).join(',')}]`;
  const call = (fn, list = [UUID_EA_A], from = '2026-10-01', to = '2026-10-31') =>
    `public.masi_reporting_${fn}_v1(${ids(list)},'${from}','${to}')`;
  const detail = (id = UUID_EA_A) => `public.masi_reporting_ea_detail_v1('${id}','2026-10-01','2026-10-31')`;
  const check = (name, expression) => c.value(name, READER_SQL(`SELECT ${expression};`), 't');
  check('roster-ea-a', `(SELECT jsonb_agg(r->>'child_id' ORDER BY r->>'child_id') FROM jsonb_array_elements(public.masi_reporting_roster_v1(${ids([UUID_EA_A])})->'rows') r)='${JSON.stringify([UUID_C1,childId(2)])}'::jsonb`);
  check('roster-move', `public.masi_reporting_roster_v1(${ids([UUID_EA_MOVE])})->'rows'='[]'::jsonb`);
  check('roster-shared', `(SELECT count(*) FROM jsonb_array_elements(public.masi_reporting_roster_v1(${ids([UUID_EA_A,UUID_EA_B])})->'rows') r WHERE r->>'child_id'='${UUID_C1}')=2`);
  const assessed = (list,from='2026-01-15',to='2026-12-15') => call('assessed_children',list,from,to);
  check('assessed-eligible', `${assessed([UUID_EA_A,UUID_EA_B])}->'rows' @> '[{"child_id":"${UUID_C1}"},{"child_id":"${childId(2)}"}]'::jsonb`);
  check('assessed-skipped-only', `NOT (${assessed([UUID_EA_A])}->'rows' @> '[{"child_id":"${childId(8)}"}]'::jsonb) AND ${assessed([UUID_EA_A])}->'rows' @> '[{"child_id":"${childId(9)}"}]'::jsonb`);
  check('assessed-author-filter', `NOT (${assessed([UUID_EA_A])}->'rows' @> '[{"child_id":"${childId(10)}"}]'::jsonb) AND ${assessed([UUID_EA_TEST])}->'rows' @> '[{"child_id":"${childId(10)}"}]'::jsonb`);
  for (const [month,expected] of [['01','2026-01-20'],['10','2026-10-20'],['03',null]]) {
    check(`assessed-range-${month}`, expected ? `${assessed([UUID_EA_A,UUID_EA_B],`2026-${month}-01`,`2026-${month}-31`)}->'rows' @> '[{"child_id":"${childId(11)}","last_assessment_date":"${expected}"}]'::jsonb` : `NOT (${assessed([UUID_EA_A,UUID_EA_B],'2026-03-01','2026-03-31')}->'rows' @> '[{"child_id":"${childId(11)}"}]'::jsonb)`);
  }
  c.value('accounts-delivery-count', account(UUID_EA_A,"a#>>'{counts,delivery_children}'"),'2');
  c.value('received-mastery-ledger', `BEGIN; INSERT INTO public.letter_mastery_corrections(correction_id,child_id,letter,language,confirmed,requested_at,effective_at,changed_by,received_at) VALUES(gen_random_uuid(),'${UUID_C1}','s','en',true,now(),now(),'${UUID_EA_A}',now()); ${account(UUID_EA_A,"(a#>>'{activity,last_data_received_at}')::timestamptz=now()")} ROLLBACK;`,'t');
  check('daily-sessions', `${call('daily',[UUID_EA_MOVE])}->'sessions' @> '[{"day":"2026-10-20","programme_code":"literacy","sessions":1},{"day":"2026-10-21","programme_code":"literacy","sessions":1}]'::jsonb`);
  check('daily-clock-sast', `${call('daily',[UUID_EA_A],'2026-10-20','2026-10-20')}->'clock' @> '[{"day":"2026-10-20","entries":2,"completed_minutes":510}]'::jsonb AND ${call('daily',[UUID_EA_A],'2026-10-19','2026-10-19')}->'clock'='[]'::jsonb`);
  check('daily-clock-minutes', `${call('daily')}->'clock' @> '[{"day":"2026-10-20","completed_minutes":510}]'::jsonb`);
  check('daily-battery-sast', `${call('daily')}->'assessments' @> '[{"day":"2026-10-20","battery_runs_completed":1}]'::jsonb AND ${call('daily',[UUID_EA_A],'2026-10-19','2026-10-19')}->'assessments'='[]'::jsonb`);
  // C1 question results are dated Oct 20; their battery completed the next SAST day.
  check('daily-assessments', `${call('daily')}->'assessments' @> '[{"day":"2026-10-20","question_results":2,"battery_runs_completed":1,"children_assessed":1}]'::jsonb`);
  check('daily-skipped-separate', `${call('daily')}->'assessments' @> '[{"day":"2026-10-22","question_results":3,"skipped_results":1}]'::jsonb`);
  check('detail-latest-n', `${detail(UUID_EA_BULK)}#>>'{assessments,total}'='504' AND jsonb_array_length(${detail(UUID_EA_BULK)}#>'{assessments,rows}')=200 AND NOT EXISTS (SELECT 1 FROM (SELECT r->>'assessment_date' d,lag(r->>'assessment_date') OVER(ORDER BY n) prev FROM jsonb_array_elements(${detail(UUID_EA_BULK)}#>'{assessments,rows}') WITH ORDINALITY x(r,n)) q WHERE d>prev)`);
  check('detail-score-max', `${detail()}#>'{assessments,rows}' @> '[{"question_code":"wela_plus_story_writing","raw_score":12,"item_count":4,"score_max":16}]'::jsonb`);
  check('detail-score-max-null', `${detail()}#>'{assessments,rows}' @> '[{"question_code":"letter_sounds","score_max":null}]'::jsonb`);
  check('detail-letters', `${detail()}#>'{sessions,rows}' @> '[{"letters_focused":["s","a"]}]'::jsonb`);
  check('detail-groups', `${detail()}->'groups' @> '[{"group_id":"${UUID_G1}","members":2,"class_name":"K1"}]'::jsonb`);
  check('detail-weekly', `jsonb_array_length(${detail()}->'weekly')=12 AND ${detail()}#>>'{weekly,11,week_start}'='2026-10-26'`);
  check('detail-unknown-user', `${detail('ffffffff-ffff-ffff-ffff-ffffffffffff')}#>>'{assessments,total}'='0' AND ${detail('ffffffff-ffff-ffff-ffff-ffffffffffff')}#>>'{sessions,total}'='0' AND ${detail('ffffffff-ffff-ffff-ffff-ffffffffffff')}#>>'{time_entries,total}'='0'`);
  check('sessions-rows', `${call('sessions')}->'rows' @> '[{"id":"${UUID_SESSION_A}","class_name":"K1","present_count":2}]'::jsonb`);
  check('roster-null-ids', "public.masi_reporting_roster_v1(NULL)->>'argument'='p_user_ids'");
  check('detail-weekly-independent-of-from', `public.masi_reporting_ea_detail_v1('${UUID_EA_A}','2026-10-26','2026-10-31')->'weekly' @> '[{"week_start":"2026-10-19","sessions":1,"clock_days":2,"completed_hours":18.5,"question_results":7}]'::jsonb`);
  for (const activities of ['{"letters_focused":"s"}', '{"letters_focused":["s",1]}', '{}']) {
    c.value(`sessions-letters-defensive-${activities}`, `BEGIN; UPDATE public.sessions SET activities='${activities}' WHERE id='${UUID_SESSION_A}'; SET LOCAL ROLE masi_reporting_reader; SELECT ${call('sessions')}->'rows' @> '[{"id":"${UUID_SESSION_A}","letters_focused":null}]'::jsonb; ROLLBACK;`, 't');
  }
  check('sessions-discarded-excluded', `jsonb_array_length(${call('sessions')}->'rows')=1`);
  check('assessments-rows', `${call('assessments')}->'rows' @> '[{"question_code":"wela_plus_story_writing","battery_code":null,"window_label":null}]'::jsonb`);
  check('time-entries-rows', `${call('time_entries')}->'rows' @> '[{"auto_clocked_out":true,"duration_minutes":600}]'::jsonb`);
  const incidents = (kinds='NULL') => `public.masi_reporting_incidents_v1(${ids([UUID_EA_A])},'2026-10-01','2026-11-01',${kinds})`;
  check('incidents-summary', `${incidents()}->'rows' @> '[{"summary":"Save button hidden","has_screenshot":true}]'::jsonb`);
  check('incidents-kinds-filter', `jsonb_array_length(${incidents("ARRAY['ea_report']")}->'rows')=1`);
  check('incidents-user-filter', `NOT (${incidents()}->'rows' @> '[{"reporter_id":"${UUID_EA_TEST}"}]'::jsonb)`);
  check('incidents-v1-receipt-nulls', `${incidents()}->'rows' @> '[{"summary":"Save button hidden","first_seen_at":null,"last_seen_at":null}]'::jsonb`);
  check('assessments-legacy-null-question', `${call('assessments')}->'rows' @> '[{"question_code":null}]'::jsonb`);
  check('assessments-skipped-labelled', `${call('assessments')}->'rows' @> '[{"stopped_reason":"skipped_child_refused"}]'::jsonb`);
  check('assessments-completed-runs', `jsonb_array_length(${call('assessments')}->'completed_battery_runs')=2 AND ${call('assessments')}->'rows' @> '[{"battery_status":"abandoned"},{"battery_status":"in_progress"}]'::jsonb`);
  check('assessments-run-completed-out-of-range', `NOT (${call('assessments',[UUID_EA_A],'2026-10-20','2026-10-20')}->'completed_battery_runs' @> '[{"id":"${runId(4)}"}]'::jsonb) AND ${call('assessments',[UUID_EA_A],'2026-10-21','2026-10-21')}->'completed_battery_runs' @> '[{"id":"${runId(4)}"}]'::jsonb`);
  for (const [fn,limit] of [['daily',120],['sessions',92],['assessments',366],['time_entries',92],['assessed_children',366]]) {
    check(`${fn}-span-cap`, `public.masi_reporting_${fn}_v1(${ids([UUID_EA_A])},'2026-01-01','2026-01-01'::date+${limit})->>'error'='invalid_argument'`);
    check(`${fn}-null-ids`, `public.masi_reporting_${fn}_v1(NULL,'2026-10-01','2026-10-02')->>'argument'='${fn==='assessed_children'?'p_author_ids':'p_user_ids'}'`);
    check(`${fn}-range-invalid`, `public.masi_reporting_${fn}_v1(${ids([UUID_EA_A])},'2026-10-02','2026-10-01')->>'argument'='p_from'`);
  }
  check('incidents-span-cap', `public.masi_reporting_incidents_v1(${ids([UUID_EA_A])},'2026-01-01','2026-04-02',NULL)->>'error'='invalid_argument'`);
  assert.equal(asReader(databaseUrl, "SELECT public.masi_reporting_accounts_v1()->>'function_version';"), 'masi_reporting_accounts_v1');
  summary['reader-exec'] = 'passed';
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const signature of REPORTING_FUNCTIONS) c.value(`${role}-${signature}-denied`, `SELECT has_function_privilege('${role}','${signature}','EXECUTE');`, 'f');
  }
  c.value('reader-no-table-select', `SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname IN ('public','private','auth','storage') AND t.relkind IN ('r','p','v','m','f')
AND has_table_privilege('masi_reporting_reader',t.oid,'SELECT,INSERT,UPDATE,DELETE');`, '0');
  c.value('reader-executable-functions', `SELECT coalesce(jsonb_agg(signature ORDER BY signature),'[]') =
'${JSON.stringify([...REPORTING_FUNCTIONS, ...AUTH_GUARDED_ALLOWLIST].sort())}'::jsonb FROM
(SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private') AND has_function_privilege('masi_reporting_reader',p.oid,'EXECUTE')) f;`,
    't');
  // This RPC is explicitly revoked from PUBLIC, so the expected refusal is ACL denial.
  c.state('reader-submit-assessment-refused', READER_SQL("SELECT public.submit_assessment('{}','[]');"), '42501');
  c.state('reader-set-updated-at-refused', READER_SQL('SELECT private.set_updated_at();'), '42501');
  // Each future allowlist entry must also add an explicit auth-null refusal case.
  c.value('audit-atomic-bodies', `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'masi\\_reporting\\_%\\_v1' AND p.prosqlbody IS NULL;`, '0');
  const dependencies = `SELECT count(*) FROM pg_depend d JOIN pg_proc f ON f.oid=d.objid
WHERE d.classid='pg_proc'::regclass AND f.proname LIKE 'masi\\_reporting\\_%' AND d.refclassid='pg_proc'::regclass;`;
  c.value('audit-no-user-function-deps', dependencies, '0');
  c.value('audit-denylist', `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'masi\\_reporting\\_%\\_v1'
AND lower(pg_get_functiondef(p.oid)) ~ '(nextval|setval|set_config|pg_advisory|lo_|pg_notify|dblink|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_read_file|pg_ls_dir|pg_stat_reset)';`, '0');
  c.value('audit-negative-control', `BEGIN;
CREATE FUNCTION public.masi_reporting_probe_v0() RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
BEGIN ATOMIC SELECT private.close_overdue_time_entries(); END;
${dependencies}
DROP FUNCTION public.masi_reporting_probe_v0(); ROLLBACK;`, '1');
  c.value('reader-login-no-password', "SELECT rolpassword IS NULL AND rolcanlogin AND NOT rolinherit FROM pg_authid WHERE rolname='masi_reporting_reader';", 't');
  c.value('reader-role-settings', `SELECT count(*) FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
WHERE r.rolname='masi_reporting_reader' AND s.setdatabase=0
AND s.setconfig @> ARRAY['default_transaction_read_only=on','statement_timeout=15s'];`, '1');
  return summary;
}

// Each boundary runs in its own rolled-back transaction in a separate disposable database.
// Decoys use another EA (and incidents also another kind/date) and must never affect the cap.
function runCapCases(databaseUrl) {
  const summary = {};
  const capEA = '19000000-0000-0000-0000-000000000001';
  const capIds = `ARRAY['${capEA}'::uuid]`;
  const p = `(SELECT id FROM public.programmes WHERE code='literacy')`;
  const child = `(SELECT id FROM reporting_cap_children WHERE n=1)`;
  runPsql({ databaseUrl, label: 'cap-base-fixture', sql: `
INSERT INTO auth.users(id) VALUES ('${capEA}');
INSERT INTO public.users(id,first_name,last_name,organization_id) VALUES ('${capEA}','Cap','EA','${UUID_ORGANIZATION}');
CREATE TABLE reporting_cap_children AS SELECT n,md5('reporting-cap-child-'||n)::uuid AS id FROM generate_series(1,100001) n;
INSERT INTO public.children(id,first_name,last_name,created_by) SELECT id,'Cap',n::text,'${capEA}' FROM reporting_cap_children;
` });
  const ranged = (fn) => `public.masi_reporting_${fn}_v1(${capIds},'2026-01-01','2026-04-02')`;
  function pair(name, limit, setup, overflow, call, arrays, exactSetup = '', decoy = '') {
    const size = arrays.map(key => `jsonb_array_length(d->'${key}')`).join('+');
    for (const extra of [false,true]) {
      const label = `cap-${name}-${extra?'plus-one':'exact'}`;
      const sql = `BEGIN; ${setup} ${exactSetup} ${decoy} ${extra?overflow:''}
SET LOCAL ROLE masi_reporting_reader;
WITH result AS (SELECT ${call} AS d)
SELECT ${extra ? `d->>'error'='too_much_data' AND (d->>'row_count')::bigint=${limit+1} AND NOT (d ?| ARRAY['rows','accounts','sessions','clock','assessments','completed_battery_runs','groups','time_entries','weekly'])` : `NOT(d ? 'error') AND (${size})=${limit}`} FROM result;
ROLLBACK;`;
      assert.equal(runPsql({ databaseUrl, sql, label }), 't', label);
      summary[label]='passed';
    }
  }
  const accountInsert = (count) => `INSERT INTO auth.users(id) SELECT md5('cap-account-'||n)::uuid FROM generate_series(1,${count}) n;
INSERT INTO public.users(id,first_name,last_name,organization_id) SELECT id,'Cap','Account','${UUID_ORGANIZATION}' FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=a.id);`;
  const accountCount = Number(runPsql({databaseUrl,sql:'SELECT count(*) FROM public.users;',label:'cap-account-baseline'}));
  pair('accounts',5000,accountInsert(5000-accountCount),accountInsert(5001-accountCount).replaceAll('cap-account-','cap-overflow-account-').replaceAll(`generate_series(1,${5001-accountCount})`,'generate_series(1,1)'),
    'public.masi_reporting_accounts_v1()',['accounts']);
  const rosterRows = (cond) => `INSERT INTO public.child_ea_assignments(user_id,child_id) SELECT '${capEA}',id FROM reporting_cap_children WHERE ${cond};
INSERT INTO public.child_programme_enrollments(child_id,programme_id) SELECT id,${p} FROM reporting_cap_children WHERE ${cond};
INSERT INTO public.child_class_memberships(child_id,class_id,academic_year_id) SELECT id,'${UUID_K1}',(SELECT id FROM public.academic_years WHERE label='2026') FROM reporting_cap_children WHERE ${cond};`;
  pair('roster',100000,`INSERT INTO public.staff_programme_assignments(user_id,programme_id) VALUES ('${capEA}',${p});`+rosterRows('n<=100000'),rosterRows('n=100001'),`public.masi_reporting_roster_v1(${capIds})`,['rows'],'',`INSERT INTO public.child_ea_assignments(user_id,child_id) VALUES ('${UUID_EA_B}',${child});`);
  const results = (cond) => `INSERT INTO public.assessments(user_id,child_id,programme_id,assessment_type,assessment_date) SELECT '${capEA}',id,${p},'letter_sounds','2026-01-01' FROM reporting_cap_children WHERE ${cond};`;
  const resultDecoy = `INSERT INTO public.assessments(user_id,child_id,programme_id,assessment_type,assessment_date) VALUES ('${UUID_EA_TEST}',(SELECT id FROM reporting_cap_children WHERE n=100001),${p},'letter_sounds','2026-01-01'),('${capEA}',(SELECT id FROM reporting_cap_children WHERE n=100001),${p},'letter_sounds','2025-01-01');`;
  pair('assessed-children',100000,results('n<=100000'),results('n=100001'),ranged('assessed_children'),['rows'],'',resultDecoy);
  const sessionInsert = (count,ea=capEA) => `INSERT INTO public.sessions(user_id,programme_id,session_date) SELECT '${ea}',${p},'2026-01-01' FROM generate_series(1,${count});`;
  pair('sessions',20000,sessionInsert(20000),sessionInsert(1),ranged('sessions'),['rows'],'',sessionInsert(1,UUID_EA_TEST));
  const clockInsert = (count,ea=capEA) => `INSERT INTO public.time_entries(user_id,sign_in_time,sign_out_time) SELECT '${ea}','2026-01-01T05:00Z'::timestamptz+n*interval '1 second','2026-01-01T06:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,${count}) n;`;
  pair('time-entries',20000,clockInsert(20000),clockInsert(1),ranged('time_entries'),['rows'],'',clockInsert(1,UUID_EA_TEST));
  // 49,999 questions + one completed battery is exactly the combined 50,000 cap.
  const completedRun = `INSERT INTO public.battery_runs(battery_code,battery_version,child_id,user_id,programme_id,language,started_at,completed_at,status) VALUES ('cap','1',${child},'${capEA}',${p},'en','2026-01-01','2026-01-01','completed');`;
  pair('assessments',50000,results('n<=49999')+completedRun,results('n=50000'),ranged('assessments'),['rows','completed_battery_runs'],'',resultDecoy);
  const incidentInsert = (count,ea=capEA,kind='ea_report',date='2026-01-01') => `INSERT INTO public.mobile_support_incidents(reporter_id,kind,repeat_key,report_id,payload,observed,received_at) SELECT '${ea}','${kind}','cap-'||n,gen_random_uuid(),'{}','{}','${date}' FROM generate_series(1,${count}) n;`;
  pair('incidents',5000,incidentInsert(5000),incidentInsert(1),`public.masi_reporting_incidents_v1(${capIds},'2026-01-01','2026-01-02',ARRAY['ea_report'])`,['rows'],'',incidentInsert(1,UUID_EA_TEST)+incidentInsert(1,capEA,'diagnostics_sent')+incidentInsert(1,capEA,'ea_report','2025-01-01'));
  const groups = (from,to) => `INSERT INTO public.groups(id,name,programme_id) SELECT md5('cap-group-'||n)::uuid,'Cap '||n,${p} FROM generate_series(${from},${to}) n;
INSERT INTO public.group_ea_assignments(group_id,ea_user_id,programme_id) SELECT md5('cap-group-'||n)::uuid,'${capEA}',${p} FROM generate_series(${from},${to}) n;`;
  pair('detail-groups',100,groups(1,100),groups(101,101),`public.masi_reporting_ea_detail_v1('${capEA}','2026-01-01','2026-01-02')`,['groups'],'',`INSERT INTO public.groups(id,name,programme_id) VALUES (md5('cap-decoy-group')::uuid,'Cap decoy',${p});
INSERT INTO public.group_ea_assignments(group_id,ea_user_id,programme_id) VALUES (md5('cap-decoy-group')::uuid,'${UUID_EA_TEST}',${p});`);
  // 1,667 EAs x 120 dates supplies enough distinct user/day buckets. Two of the
  // 200,000 buckets are clock and question buckets, proving the combined-array cap.
  const dailyUsers = `INSERT INTO auth.users(id) SELECT md5('cap-daily-'||n)::uuid FROM generate_series(1,1667) n;
INSERT INTO public.users(id,first_name,last_name,organization_id) SELECT md5('cap-daily-'||n)::uuid,'Daily',n::text,'${UUID_ORGANIZATION}' FROM generate_series(1,1667) n;`;
  const dailySessions = (from,to) => `INSERT INTO public.sessions(user_id,programme_id,session_date) SELECT md5('cap-daily-'||((n-1)/120+1))::uuid,${p},'2026-01-01'::date+((n-1)%120) FROM generate_series(${from},${to}) n;`;
  pair('daily',200000,dailyUsers+dailySessions(1,199998)+clockInsert(1)+results('n=1'),dailySessions(199999,199999),
    `public.masi_reporting_daily_v1(ARRAY(SELECT md5('cap-daily-'||n)::uuid FROM generate_series(1,1667) n) || ${capIds},'2026-01-01','2026-04-30')`,['sessions','clock','assessments'],'',sessionInsert(1,UUID_EA_TEST));
  return summary;
}

function main() {
  const databaseName = process.env.MASI_REPORTING_DATABASE_NAME;
  const adminUrl = assertDisposableAdminTarget({
    adminDatabaseUrl: process.env.MASI_REPORTING_ADMIN_DATABASE_URL,
    databaseName, confirmation: process.env.MASI_REPORTING_DISPOSABLE_CONFIRM,
  });
  const adminDatabaseUrl = buildDatabaseUrl(adminUrl, 'postgres').href;
  const databaseUrl = buildDatabaseUrl(adminUrl, databaseName).href;
  // assertDisposableAdminTarget has already restricted the identifier alphabet.
  const quotedDatabase = `"${databaseName}"`;
  const capName = 'masi_history_rls_reporting_cap';
  assert.notEqual(databaseName, capName, 'main and cap database names must differ');
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-stale-database' });
  runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE ${quotedDatabase};`, label: 'create-database' });
  let passed = false;
  let summary;
  const capUrl = buildDatabaseUrl(adminUrl, capName).href;
  try {
    runPsql({ databaseUrl, sql: `${bootstrapSql}
ALTER TABLE auth.users ADD COLUMN raw_app_meta_data jsonb NOT NULL DEFAULT '{}',
ADD COLUMN last_sign_in_at timestamptz, ADD COLUMN email_confirmed_at timestamptz;`, label: 'bootstrap' });
    // Model Supabase's API-role default ACLs with the existing harness helper.
    installDefaultPrivileges(databaseUrl);
    for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      runPsql({ databaseUrl, file: path.join(MIGRATIONS_DIR, filename), label: `migration-${filename}` });
    }
    const fixture = seedFixture(databaseUrl);
    summary = runCases(databaseUrl, fixture);
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS "${capName}" WITH (FORCE);`, label: 'drop-stale-cap-database' });
    runPsql({ databaseUrl: adminDatabaseUrl, sql: `CREATE DATABASE "${capName}" TEMPLATE ${quotedDatabase};`, label: 'create-cap-database' });
    Object.assign(summary, runCapCases(capUrl));
    passed = true;
  } finally {
    let capCleanupPassed = false;
    try {
      runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS "${capName}" WITH (FORCE);`, label: 'drop-cap-database' });
      capCleanupPassed = true;
    } finally {
      if (!passed || !capCleanupPassed || process.env.MASI_REPORTING_KEEP !== '1') {
        runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-database' });
      }
    }
  }
  if (process.env.MASI_REPORTING_KEEP === '1') {
    try {
      // These connections are opened after cleanup chose to retain the database.
      assert.equal(runPsql({databaseUrl: adminDatabaseUrl,sql: `SELECT count(*) FROM pg_database WHERE datname='${databaseName}';`,label:'keep-retains-database'}),'1');
      assert.equal(runPsql({databaseUrl,sql: `SELECT count(*) FROM pg_proc WHERE proname LIKE 'masi\\_reporting\\_%\\_v1';`,label:'keep-retains-functions'}),'9');
      assert.equal(asReader(databaseUrl,"SELECT public.masi_reporting_accounts_v1()->>'function_version';"),'masi_reporting_accounts_v1');
      summary['keep-retains']='passed';
    } catch (error) {
      runPsql({ databaseUrl: adminDatabaseUrl, sql: `DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE);`, label: 'drop-failed-handoff' });
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({ cases: Object.keys(summary).length, ...summary })}\n`);
  if (process.env.MASI_REPORTING_KEEP === '1') process.stdout.write(`RETAINED ${databaseName}\n`);
}
if (require.main === module) main();
module.exports = { seedFixture, asReader, runCases, runCapCases, main, REPORTING_FUNCTIONS, AUTH_GUARDED_ALLOWLIST };
