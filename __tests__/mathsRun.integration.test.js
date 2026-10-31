jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
import { v4 as uuid } from 'uuid';
import { runMigrations } from '../src/db/migrations';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { MASI_MATHS_2026_1_DRAFT as battery, bundledItemSetFor, evaluateBatteryState, skippedResult,
  withRate, validateMathsResult } from '../src/assessment-questions';
import { validateResult } from '../src/assessment-questions/contractTest/validateResult';
import { assertSubmitShape } from '../src/services/assessmentFamilyPayload';
import { SERVER_COLUMNS } from '../src/services/syncServerColumns';

let db, second, userId, childId, programmeId, deliveryId, yearId, assessments, runs;
async function seed(database) {
  bindTestActor(database, userId);
  await database.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'numeracy', 'Numeracy');
  await database.runAsync("insert into staff_programme_assignments (id, user_id, programme_id, assigned_at) values (?, ?, ?, '2026-01-01')", uuid(), userId, programmeId);
  await database.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', childId, 'Test', 'Child');
  await database.runAsync("insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status) values (?, ?, ?, ?, 'synced')", deliveryId, childId, userId, userId);
  const year = new Date().getFullYear();
  await database.runAsync('insert into academic_years (id, label, starts_on, ends_on, is_active) values (?, ?, ?, ?, 1)', yearId, String(year), `${year}-01-01`, `${year}-12-31`);
}
beforeEach(async () => {
  userId=uuid(); childId=uuid(); programmeId=uuid(); deliveryId=uuid(); yearId=uuid();
  db=await createMigratedDatabase(runMigrations); await seed(db);
  assessments=createAssessmentsRepository({database:db}); runs=createBatteryRunsRepository({database:db});
});
afterEach(async () => { await second?.closeAsync(); second=null; await db?.closeAsync(); });

function buildResult(question) {
  const set=bundledItemSetFor(question.question_code, question.question_version, 'en');
  const items=set.items.map((item, position) => {
    const correct=question.question_code==='maths_add_counters'?position<3
      :question.question_code==='egma_number_id'?![1,4,7,10,13,16].includes(position):true;
    const strategy=set.kind==='maths_cards' && set.choices && correct ? ['count_all','count_on','known'][position%3] : undefined;
    return {position,item_key:item.item_key,prompt:item.prompt,is_correct:correct,
      metadata:{skill:item.skill,band:item.band,reached:true,...(strategy?{strategy}:{})}};
  });
  const correct=items.filter(item=>item.is_correct).length;
  const result={question_code:question.question_code,question_version:question.question_version,item_set_id:set.item_set_id,language:'en',
    duration_ms:question.question_code==='egma_number_id'?47000:30000,
    stopped_reason:question.question_code==='maths_add_counters'?'stop_rule':'completed',items,
    derived:{total_correct:correct,total_attempted:items.length,percent:Math.round(correct/items.length*100),
      last_attempted_position:items.length-1,tracks_progress:true,capture_mode:'sequential',was_timed:question.durationSec!==undefined,
      ...(set.strategy_step?{strategies:['head','fingers']}:{})}};
  expect(validateResult(result,{stopRule:set.stop_rule}).valid).toBe(true);
  expect(validateMathsResult(result)).toEqual({valid:true,errors:[]});
  return question.durationSec?withRate(result,question.durationSec):result;
}
async function saveFullAssessment() {
  const runId=uuid();
  await runs.startRun({id:runId,userId,childId,batteryCode:battery.battery_code,batteryVersion:battery.battery_version,language:'en'});
  const decided=[]; const expected=new Map();
  for (const question of battery.questions) {
    const skip=evaluateBatteryState(battery,decided).autoSkips.find(row=>row.question_code===question.question_code);
    const result=skip?skippedResult(question,'en','skipped_prerequisite_unmet'):buildResult(question);
    const assessmentId=uuid(); expected.set(assessmentId,JSON.parse(JSON.stringify(result)));
    await assessments.saveQuestionResult({assessmentId,userId,childId,batteryRunId:runId,result});
    decided.push({question_code:question.question_code,score:result.derived.total_correct,stopped_reason:result.stopped_reason});
  }
  expect(evaluateBatteryState(battery,decided).eligibleToFinalize).toBe(true);
  await runs.finalizeRun(runId,{questionCodes:battery.questions.map(question=>question.question_code)});
  return {runId,expected};
}

test('a full maths assessment saves, gates and finalizes', async () => {
  const {runId}=await saveFullAssessment(); const saved=await runs.getRunWithResults(runId);
  expect(saved.status).toBe('completed'); expect(saved.results).toHaveLength(17);
  expect(saved.results.filter(row=>row.stopped_reason==='skipped_prerequisite_unmet').map(row=>row.question_code))
    .toEqual(['egma_addition_l1','egma_addition_l2','egma_word_problems']);
  const outbox=await db.getAllAsync('select table_name, status, payload from sync_outbox');
  expect(outbox).toHaveLength(18); expect(outbox.every(row=>row.status==='pending')).toBe(true);
  const headers=outbox.filter(row=>row.table_name==='battery_runs'); expect(headers).toHaveLength(1);
  expect(JSON.parse(headers[0].payload)).toMatchObject({battery_code:'masi_maths',battery_version:'2026.1-draft',status:'completed'});
  const families=outbox.filter(row=>row.table_name==='assessments'); expect(families).toHaveLength(17);
  families.forEach(row=>expect(()=>assertSubmitShape(JSON.parse(row.payload))).not.toThrow());
});

test('maths metadata survives save, outbox and history re-store', async () => {
  const {runId,expected}=await saveFullAssessment();
  const originals=await assessments.getQuestionResults({userId,childId,includeSkipped:true}); expect(originals).toHaveLength(17);
  for (const original of originals) {
    const emitted=expected.get(original.id);
    expect(original.derived).toEqual(emitted.derived);
    expect(original.items.map(item=>item.metadata)).toEqual(emitted.items.map(item=>item.metadata));
  }
  const added=originals.find(row=>row.question_code==='maths_add_counters');
  expect(added.items.slice(0,3).map(item=>item.metadata)).toEqual(['count_all','count_on','known'].map(strategy=>({skill:'add_objects',band:5,reached:true,strategy})));
  expect(originals.find(row=>row.question_code==='egma_subtraction_l1').derived.strategies).toEqual(['head','fingers']);
  expect(originals.find(row=>row.question_code==='egma_number_id').derived.correct_per_minute).toBe(17.9);
  const outbox=await db.getAllAsync('select table_name, payload from sync_outbox');
  const project=(columns,value)=>Object.fromEntries(columns.map(key=>[key,value[key]??null]));
  const header=project(SERVER_COLUMNS.battery_runs,JSON.parse(outbox.find(row=>row.table_name==='battery_runs').payload));
  // Upload headers omit the server-owned update timestamp; the history RPC supplies it.
  header.updated_at = header.completed_at ?? header.created_at;
  const pages=outbox.filter(row=>row.table_name==='assessments').map(row=>{
    const family=JSON.parse(row.payload); const original=originals.find(value=>value.id===family.id);
    expect(family.derived).toEqual(original.derived);
    expect(family.items.map(item=>item.metadata)).toEqual(original.items.map(item=>item.metadata));
    return {...project(SERVER_COLUMNS.assessments,family),updated_at:family.updated_at??family.created_at,
      items:family.items.map(item=>project(['id','position','item_key','prompt','response','is_correct','metadata'],item)),
      battery_run:header,child_first_name:'Test',child_last_name:'Child',child_preferred_name:null};
  });
  second=await createMigratedDatabase(runMigrations); expect(second).not.toBe(db); await seed(second);
  const restoredRepo=createAssessmentsRepository({database:second});
  expect(await second.getFirstAsync('select count(*) as n from assessments')).toEqual({n:0});
  const applied=await restoredRepo.saveHistoryPage(pages,{scope:'assessment_history_pull:maths',pullState:{lastPulledAt:header.updated_at,cursor:null},admit:()=>true});
  expect(applied).toMatchObject({inserted:17,present:0,runsInserted:1}); expect(applied.inserted).toBeGreaterThan(0);
  expect(await second.getAllAsync('select * from sync_outbox')).toEqual([]);
  expect(await second.getFirstAsync('select sync_status, started_here from battery_runs where id = ?',runId)).toEqual({sync_status:'synced',started_here:0});
  const restored=await restoredRepo.getQuestionResults({userId,childId,includeSkipped:true}); expect(restored).toHaveLength(17);
  for (const row of restored) {
    const original=originals.find(value=>value.id===row.id);
    expect(row.sync_status).toBe('synced'); expect(row.derived).toEqual(original.derived);
    expect(row.items.map(item=>item.metadata)).toEqual(original.items.map(item=>item.metadata));
    expect(row.items.every(item=>item.sync_status==='synced')).toBe(true);
  }
});
