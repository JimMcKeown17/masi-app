import { letterMasteryDomainId, skillMasteryDomainId } from '../src/db/domainId';
import { compareServerTuples, serverTimestampMicros } from '../src/utils/serverTimestamps';
import { uuid } from './assessmentHistoryFixtures';

// Only the remote boundary is fake. Read each list anew: revocation hides rows between calls.
export const createHistoryServer = (lists = {}) => {
  const server = { calls: [], year: 'year-2026', disabled: new Set(), lists, onRequest: null };
  server.client = { rpc: (name, args) => ({ abortSignal: async () => {
    server.calls.push({ name, args });
    if (server.onRequest) await server.onRequest(name, args);
    if (server.disabled.has(name)) return { data: null, error: { code: 'MR001', message: 'rollout_disabled' } };
    if (name !== 'get_letter_mastery_page' && name !== 'get_skill_mastery_page' && args.p_academic_year_id !== server.year) {
      return { data: null, error: { code: 'MR002', message: 'academic_year_mismatch' } };
    }
    const source = server.lists[name];
    const rows = typeof source === 'function' ? source() : source || [];
    const sorted = [...rows].sort((a, b) => compareServerTuples([a.updated_at, a.id], [b.updated_at, b.id]));
    const data = sorted.filter(row => {
      if (!args.p_after_updated_at) return true;
      if (args.p_overlap_seconds) {
        return serverTimestampMicros(row.updated_at) >=
          serverTimestampMicros(args.p_after_updated_at) - args.p_overlap_seconds * 1e6;
      }
      return compareServerTuples([row.updated_at, row.id], [args.p_after_updated_at, args.p_after_id]) > 0;
    }).slice(0, args.p_page_size);
    return { data, error: null };
  } }) };
  return server;
};

export const masteryRow = (childId, letter, at, extra = {}) => ({
  id: letterMasteryDomainId({ childId, letter, language: 'en' }),
  child_id: childId, letter, language: 'en', confirmed: true,
  changed_at: at, correction_id: uuid(900), changed_by: 'user-2', programme_id: null,
  created_at: at, updated_at: at, child_first_name: 'Server', child_last_name: 'Child',
  child_preferred_name: null, ...extra,
});
export const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

export const skillMasteryRow = (childId, stepKey, at, extra = {}) => ({
  id: skillMasteryDomainId(childId, stepKey),
  child_id: childId, step_key: stepKey, confirmed: true,
  changed_at: at, correction_id: uuid(900), changed_by: 'user-2', programme_id: null,
  created_at: at, updated_at: at, child_first_name: 'Server', child_last_name: 'Child',
  child_preferred_name: null, ...extra,
});
