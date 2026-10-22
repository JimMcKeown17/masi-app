import { getTestWriter } from './testDatabase';
import { lessonDraftInput } from './lessonSaveFixtures';

export const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
export const observe = promise => promise.then(value => ({ value }), error => ({ error }));
export const draftStart = (overrides = {}) => lessonDraftInput({
  plan_fixed_at: null, ticks: { letters: [], blends: [], books: [], noOneNew: [], blendTierShown: null },
  tracker_changes: {}, reading_level_changes: {}, notes: null, ...overrides,
});
// Pause at the native adapter, below the real handle, transaction and repository layers.
export const holdDraftWrite = async ({ fail = false } = {}) => {
  const db = await getTestWriter();
  const original = db.runAsync;
  const entered = deferred();
  const release = deferred();
  let first = true;
  db.runAsync = async (sql, ...params) => {
    const firstDraftWrite = first && /(?:insert into|update) lesson_drafts/i.test(sql);
    if (firstDraftWrite) { first = false; entered.resolve(); }
    await release.promise;
    if (firstDraftWrite && fail) throw new Error('Disk full');
    return original(sql, ...params);
  };
  return { entered: entered.promise, release: () => release.resolve(), restore: () => { db.runAsync = original; } };
};
