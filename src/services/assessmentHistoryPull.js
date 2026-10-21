// Assessment/run grants are class-scoped; mastery grants follow current delivery.
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createAssessmentsRepository } from '../db/repositories/assessmentsRepository';
import { createBatteryRunsRepository } from '../db/repositories/batteryRunsRepository';
import { createMasteryRepository, letterMasteryHistoryScope } from '../db/repositories/masteryRepository';
import { createHistoryWalkState, runHistoryWalk } from './historyWalk';

export const ASSESSMENT_HISTORY_PAGE_SIZE = 50;
export const ASSESSMENT_HISTORY_FIRST_PAGE_SIZE = 10;
export const BATTERY_RUN_HISTORY_PAGE_SIZE = 200;
export const LETTER_MASTERY_PAGE_SIZE = 200;

export const assessmentHistoryScope = (userId, programmeId) => `assessment_history_pull:${userId}:${programmeId}`;
export const batteryRunHistoryScope = (userId, programmeId) => `battery_run_history_pull:${userId}:${programmeId}`;
export { letterMasteryHistoryScope };

export const createAssessmentHistoryStates = () => ({
  batteryRuns: createHistoryWalkState(), assessments: createHistoryWalkState(), mastery: createHistoryWalkState(),
});

// Synced rows model grants the server already knows. Memberships on this phone are
// a conservative subset of the class roster; a weekly re-walk covers unseen changes.
export const readAssessmentScope = async (db, { userId, academicYearId }) => {
  const classes = await db.getAllAsync(`
    select distinct class_id from class_ea_assignments
    where ea_user_id = ? and unassigned_at is null and sync_status = 'synced'
    order by class_id
  `, userId);
  const children = await db.getAllAsync(`
    select distinct m.child_id from child_class_memberships m
    where m.academic_year_id = ? and m.sync_status = 'synced'
      and exists (
        select 1 from class_ea_assignments a where a.class_id = m.class_id
          and a.ea_user_id = ? and a.unassigned_at is null and a.sync_status = 'synced'
      )
    order by m.child_id
  `, academicYearId, userId);
  return { classIds: classes.map(row => row.class_id), childIds: children.map(row => row.child_id) };
};

export const readMasteryScope = async (db, { userId }) => ({
  childIds: (await db.getAllAsync(`
    select distinct child_id from child_ea_assignments
    where user_id = ? and unassigned_at is null and sync_status = 'synced'
    order by child_id
  `, userId)).map(row => row.child_id),
});

const resolveProgrammeScope = scopeFor => async ({ db, userId }) => {
  const programmeId = userId ? await getActiveProgrammeId(db, userId) : null;
  const year = await getActiveAcademicYear(db);
  if (!programmeId || !year?.starts_on) return null;
  return { scope: scopeFor(userId, programmeId), windowStart: year.starts_on,
    context: { programmeId, academicYearId: year.id } };
};
const readProgrammeCoverage = ({ db, userId, context }) =>
  readAssessmentScope(db, { userId, academicYearId: context.academicYearId });

const fetchPage = (rpc, programmeScoped) => async ({ request, position, overlapSeconds, pageSize, context }) => ({
  rows: await request(rpc, {
    ...(programmeScoped ? { p_programme_id: context.programmeId, p_academic_year_id: context.academicYearId } : {}),
    p_page_size: pageSize, p_after_updated_at: position?.updatedAt ?? null,
    p_after_id: position?.id ?? null, p_overlap_seconds: overlapSeconds,
  }),
});
const pageSaver = repo => ({ data, scope, pullState, admit }) =>
  repo.saveHistoryPage(data, { scope, pullState, admit });

export const runBatteryRunHistoryPull = ({ userId, force = false, deps = {} } = {}) => {
  const repo = deps.repositories?.batteryRuns || createBatteryRunsRepository({ database: deps.database });
  return runHistoryWalk({ userId, force, deps, walk: {
    tag: 'BatteryRunHistory', coverageKeys: ['childIds', 'classIds'],
    pageSize: BATTERY_RUN_HISTORY_PAGE_SIZE, logTiming: true, dropLostCoverage: true,
    resolveScope: resolveProgrammeScope(batteryRunHistoryScope), readCoverage: readProgrammeCoverage,
    fetchPage: fetchPage('get_battery_run_history_page', true), savePage: pageSaver(repo),
  } });
};

export const runAssessmentHistoryPull = ({ userId, force = false, deps = {} } = {}) => {
  const repo = deps.repositories?.assessments || createAssessmentsRepository({ database: deps.database });
  return runHistoryWalk({ userId, force, deps, walk: {
    tag: 'AssessmentHistory', coverageKeys: ['childIds', 'classIds'],
    pageSize: ASSESSMENT_HISTORY_PAGE_SIZE, firstPageSize: ASSESSMENT_HISTORY_FIRST_PAGE_SIZE,
    logTiming: true, dropLostCoverage: true,
    resolveScope: resolveProgrammeScope(assessmentHistoryScope), readCoverage: readProgrammeCoverage,
    fetchPage: fetchPage('get_assessment_history_page', true), savePage: pageSaver(repo),
  } });
};

export const runLetterMasteryHistoryPull = ({ userId, force = false, deps = {} } = {}) => {
  const repo = deps.repositories?.mastery || createMasteryRepository({ database: deps.database });
  return runHistoryWalk({ userId, force, deps, walk: {
    tag: 'LetterMasteryHistory', coverageKeys: ['childIds'], pageSize: LETTER_MASTERY_PAGE_SIZE,
    logTiming: true, dropLostCoverage: true,
    resolveScope: async ({ userId: actor }) => ({
      scope: letterMasteryHistoryScope(actor), windowStart: null,
    }),
    readCoverage: ({ db, userId: actor }) => readMasteryScope(db, { userId: actor }),
    fetchPage: fetchPage('get_letter_mastery_page', false), savePage: pageSaver(repo),
  } });
};
