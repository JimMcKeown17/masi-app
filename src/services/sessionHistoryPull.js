// CAP-004's historical delivery grant, complete-family fetch and page apply.
import { getActiveAcademicYear, getActiveProgrammeId } from '../db/repositories/domainRepositoryUtils';
import { createSessionsRepository } from '../db/repositories/sessionsRepository';
import { createHistoryWalkState, resetHistoryWalkState, runHistoryWalk } from './historyWalk';

export const SESSION_HISTORY_PAGE_SIZE = 200;
export const SESSION_HISTORY_REQUEST_TIMEOUT_MS = 15_000;
export const SESSION_HISTORY_RUN_BUDGET_MS = 60_000;
export const SESSION_HISTORY_OVERLAP_SECONDS = 120;
export const SESSION_HISTORY_STALENESS_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_HISTORY_REWALK_MIN_MS = 6 * DAY_MS;
export const SESSION_HISTORY_REWALK_JITTER_MS = 2 * DAY_MS;

export const sessionHistoryScope = (userId, programmeId) => `session_history_pull:${userId}:${programmeId}`;

export const createSessionHistoryState = createHistoryWalkState;
export const resetSessionHistoryState = resetHistoryWalkState;

export const runSessionHistoryPull = ({ userId, force = false, deps = {} } = {}) => {
  const repo = deps.repositories?.sessions || createSessionsRepository({ database: deps.database });
  return runHistoryWalk({ userId, force, deps, walk: {
    tag: 'SessionHistory', coverageKeys: ['childIds'], pageSize: SESSION_HISTORY_PAGE_SIZE,
    logTiming: false, dropLostCoverage: false,
    resolveScope: async ({ db, userId: actor }) => {
      const programmeId = actor ? await getActiveProgrammeId(db, actor) : null;
      const year = await getActiveAcademicYear(db);
      if (!programmeId || !year?.starts_on) return null;
      return { scope: sessionHistoryScope(actor, programmeId), windowStart: year.starts_on,
        context: { programmeId, windowStart: year.starts_on } };
    },
    readCoverage: async ({ db, userId: actor }) => ({
      childIds: (await db.getAllAsync(`
        select distinct child_id from child_ea_assignments
        where user_id = ? and unassigned_at is null
        order by child_id
      `, actor)).map((row) => row.child_id),
    }),
    fetchPage: async ({ request, position, overlapSeconds, pageSize, context }) => {
      const parents = await request('get_delivery_history_page', {
        p_programme_id: context.programmeId, p_window_start: context.windowStart,
        p_page_size: pageSize, p_after_updated_at: position?.updatedAt ?? null,
        p_after_id: position?.id ?? null, p_overlap_seconds: overlapSeconds,
      });
      const attendees = [];
      if (parents.length) {
        let after = null;
        for (;;) {
          const page = await request('get_delivery_history_attendee_page', {
            p_session_ids: parents.map((p) => p.id), p_page_size: SESSION_HISTORY_PAGE_SIZE,
            p_after_session_id: after?.session_id ?? null, p_after_attendee_id: after?.id ?? null,
          });
          attendees.push(...page);
          if (page.length < SESSION_HISTORY_PAGE_SIZE) break;
          after = page[page.length - 1];
        }
      }
      const byParent = new Map(parents.map((p) => [p.id, []]));
      for (const attendee of attendees) byParent.get(attendee.session_id)?.push(attendee);
      return { rows: parents,
        data: parents.map((session) => ({ session, attendees: byParent.get(session.id) })) };
    },
    savePage: ({ data, scope, pullState, admit }) => repo.saveHistoryPage(data, { scope, pullState, admit }),
  } });
};
