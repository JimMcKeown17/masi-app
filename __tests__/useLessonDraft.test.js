import React from 'react';
import { renderHook, act, waitFor, cleanupAsync } from '@testing-library/react-native';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { draftStart, holdDraftWrite, deferred, failDraftUpdates } from '../test-support/lessonDraftTestUtils';
import { MON } from '../test-support/lessonSaveFixtures';
import { useLessonDraft } from '../src/hooks/useLessonDraft';
import * as transitions from '../src/lessonPlan/lessonDraftState';
import * as engine from '../src/lessonPlan/engine/lessonPlan';
import { planForSave } from '../src/lessonPlan/engine';
import { saveLesson } from '../src/services/lessonSave';
import * as inputs from '../src/lessonPlan/inputs/lessonInputs';
import * as previewContent from '../src/lessonPlan/packs/previewContent';

let handle, start;
// Dispose mounted screens before the global default-handle teardown publishes closed.
const testHook = (name, run) => test(name, async () => {
  try { await run(); } finally { await cleanupAsync(); }
});
const wrapper = ({ children }) => <SignedInEAContext.Provider value={{
  handle, repositories: handle.repositories, services: handle.services,
}}>{children}</SignedInEAContext.Provider>;
const mount = options => renderHook(() => useLessonDraft(options ?? { start }), { wrapper });
const ready = async result => waitFor(() => {
  expect(result.current.status).toMatch(/unsaved|ready/);
  expect(result.current.plan).not.toBeNull();
});
const change = async (result, transition, ...args) => {
  await act(async () => { await result.current.apply(transition, ...args); });
};
const refusal = async promise => {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  expect(error).toBeDefined();
};

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance'] });
  jest.setSystemTime(new Date(MON));
  handle = getDefaultTestHandle();
  await handle.withTransaction(async db => {
    await seedCoreData(db);
    await db.runAsync('update staff_programme_assignments set user_id = ?', handle.userId);
    await db.runAsync("update classes set home_language = 'English'");
    await db.runAsync("insert into classes (id, school_id, name, grade, academic_year_id, home_language) values ('class-2', 'school-1', 'Other', '2', 'year-2026', 'isiXhosa')");
    for (const id of ['c1', 'c2', 'c3']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, reading_level, created_by) values (?, ?, 'Child', 'class-1', 'Letter Knowledge', ?)", id, id, handle.userId);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id) values (?, ?, ?)", id, handle.userId, id);
    }
    await db.runAsync("insert into groups (id, name, programme_id, class_id) values ('group-1', 'Group 1', 'programme-a', 'class-1')");
  });
  start = { group: { id: 'group-1', class_id: 'class-1', programme_id: 'programme-a' },
    members: [{ id: 'c1', class_id: 'class-1' }, { id: 'c2', class_id: 'class-1' }], upNextGroupId: 'group-1' };
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

for (const allowPreview of [false, true]) {
  testHook(`a new isiXhosa draft uses its edition pack with preview ${allowPreview}`, async () => {
    jest.spyOn(previewContent, 'isPreviewContentEnabled').mockReturnValue(allowPreview);
    start = { ...start, group: { ...start.group, class_id: 'class-2' } };
    const { result } = mount();
    expect(result.current.teachingOrder).toBeNull();
    await ready(result);
    expect(result.current.teachingOrder).toMatchObject({ kind: 'order', id: 'isixhosa-order-2026-10-23' });
    const expected = allowPreview ? 'isixhosa-candidates-preview-v2' : 'isixhosa-interim-letters-v2';
    expect(result.current.draft.pack_id).toBe(expected);
    expect(result.current.lessonInput.pack.id).toBe(expected);
    await change(result, transitions.setNotes, 'Persist the selected edition pack');
    expect((await handle.repositories.lessonDrafts.getActive()).pack_id).toBe(expected);
  });
}

// Control notifications independently of the transactional page/cursor write.
const historyVersions = () => {
  const store = handle.services.sessionHistory.store;
  let snapshot = store.getSnapshot();
  const listeners = new Set();
  jest.spyOn(store, 'getSnapshot').mockImplementation(() => snapshot);
  jest.spyOn(store, 'subscribe').mockImplementation(listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  return (version = 'pageVersion') => {
    snapshot = { ...snapshot, [version]: snapshot[version] + 1 };
    listeners.forEach(listener => listener());
  };
};
const finishLessonHistory = () => handle.withTransaction(async transaction => {
  await handle.repositories.sessions.saveSession({ id: 'previous-lesson', user_id: handle.userId,
    programme_id: 'programme-a', session_date: '2026-10-16', children_ids: ['c1'],
    activities: { lesson: { version: 1 } }, synced: true,
  }, { transaction });
  await handle.repositories.syncState.setPullState(`session_history_pull:${handle.userId}:programme-a`, {
    cursor: JSON.stringify({ windowStart: '2026-01-15', complete: true, lastFailureAt: null,
      rescanChildIds: ['c1', 'c2', 'c3'] }),
  }, { transaction });
});

for (const notify of [true, false]) {
  testHook(`history completed after opening ${notify ? 'refreshes before the first tick' : 'cannot lend new coverage to stale sessions without notification'}`, async () => {
    const bump = historyVersions();
    const { result } = mount();
    await ready(result);
    expect(result.current.lessonInput.sessions).toEqual([]);
    expect(result.current.base.sessionHistoryCoveredChildIds).toBeNull();
    expect(result.current.plan.history_complete).toBe(false);
    await finishLessonHistory();
    if (notify) await act(async () => { bump(); });
    await change(result, transitions.addChildForToday, 'c3');
    await ready(result);
    expect(result.current.lessonInput.presentChildren.map(child => child.id)).toEqual(['c1', 'c2', 'c3']);
    await change(result, transitions.toggleTick, 'letters', 'a');
    const persisted = await handle.repositories.lessonDrafts.getActive();
    expect(persisted.plan.reason).toBe('ok');
    expect(persisted.plan.history_complete).toBe(notify);
    expect(result.current.lessonInput.presentChildren.map(child => child.historyComplete)).toEqual([notify, notify, notify]);
    expect(result.current.lessonInput.sessions.map(session => session.id)).toEqual(notify ? ['previous-lesson'] : []);
  });
}

for (const version of ['pageVersion', 'runVersion']) {
  testHook(`${version} refresh keeps the old plan and choices in every render until the new base lands`, async () => {
    const bump = historyVersions();
    const renders = [];
    const realLoad = inputs.loadLessonBase;
    const load = jest.spyOn(inputs, 'loadLessonBase');
    const { result } = renderHook(() => {
      const lesson = useLessonDraft({ start });
      renders.push(lesson);
      return lesson;
    }, { wrapper });
    await ready(result);
    await change(result, transitions.setNotes, 'Unfrozen persisted lesson');
    const previous = result.current;
    expect(previous.draft.plan_fixed_at).toBeNull();
    await finishLessonHistory();
    const held = deferred();
    load.mockImplementationOnce(async options => { await held.promise; return realLoad(options); });
    renders.length = 0;
    await act(async () => { bump(version); });
    try {
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(result.current.base).toBe(previous.base);
      expect(result.current.plan).toBe(previous.plan);
      expect(result.current.choices).toBe(previous.choices);
    } finally {
      await act(async () => { held.resolve(); });
    }
    await waitFor(() => expect(result.current.plan.history_complete).toBe(true));
    expect(result.current.lessonInput.sessions.map(session => session.id)).toEqual(['previous-lesson']);
    expect(result.current.plan).not.toBe(previous.plan);
    expect(result.current.choices).not.toBe(previous.choices);
    for (const lesson of renders) {
      expect(lesson.plan).not.toBeNull();
      expect(lesson.choices).not.toBeNull();
      expect(lesson.lessonInput).not.toBeNull();
    }
    await waitFor(async () => expect((await handle.repositories.lessonDrafts.getActive()).plan.history_complete).toBe(true));
  });
}

testHook('a failed history refresh keeps the shown plan and no error', async () => {
  const bump = historyVersions();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const load = jest.spyOn(inputs, 'loadLessonBase');
  const { result } = mount();
  await ready(result);
  const previous = result.current;
  load.mockRejectedValueOnce(new Error('disk busy'));
  await act(async () => { bump(); });
  await waitFor(() => expect(warn).toHaveBeenCalledWith('[lesson] history refresh failed:', 'disk busy'));
  expect(result.current.inputError).toBeNull();
  expect(result.current.base).toBe(previous.base);
  expect(result.current.plan).toBe(previous.plan);
  expect(result.current.choices).toBe(previous.choices);
});

testHook('a resumed same-day unfrozen plan is replaced only when its inputs become more complete', async () => {
  const bump = historyVersions();
  const fixture = draftStart();
  const row = await handle.repositories.lessonDrafts.create({ ...fixture,
    plan: { ...fixture.plan, history_complete: false, mastery_complete: false } });
  const compute = jest.spyOn(engine, 'computeLessonPlan');
  const { result } = mount({ draftId: row.id });
  await ready(result);
  expect(result.current.plan).toEqual(row.plan);
  expect((await handle.repositories.lessonDrafts.getActive()).plan).toEqual(row.plan);
  expect(compute).not.toHaveBeenCalled();
  await finishLessonHistory();
  await act(async () => { bump(); });
  await waitFor(() => expect(result.current.plan.engine_version).toBe(2));
  expect(result.current.plan.history_complete).toBe(true);
  expect(result.current.lessonInput.sessions.map(session => session.id)).toEqual(['previous-lesson']);
  expect(result.current.draft.plan_fixed_at).toBeNull();
});

testHook('a history refresh that adds nothing keeps a resumed complete plan', async () => {
  const bump = historyVersions();
  const row = await handle.repositories.lessonDrafts.create(draftStart());
  const { result } = mount({ draftId: row.id });
  await ready(result);
  await finishLessonHistory();
  const load = jest.spyOn(inputs, 'loadLessonBase');
  await act(async () => { bump(); });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(result.current.lessonInput.sessions.map(session => session.id)).toEqual(['previous-lesson']));
  expect(result.current.plan).toEqual(row.plan);
  expect((await handle.repositories.lessonDrafts.getActive()).plan).toEqual(row.plan);
});

testHook('two mounted lessons with different facts converge on one plan after a history refresh', async () => {
  // Lesson stays mounted under Wrap up; each loads its own facts, so mastery can differ between them.
  const bump = historyVersions();
  let masteryDone = false;
  jest.spyOn(handle.services.assessmentHistory, 'masteryCompletenessByChild')
    .mockImplementation(async ({ childIds }) => Object.fromEntries(childIds.map(id => [id, masteryDone])));
  const lesson = mount();
  await ready(lesson.result);
  await change(lesson.result, transitions.setNotes, 'Unfrozen persisted lesson');
  masteryDone = true;
  const apply = jest.spyOn(handle.services.lessonDraft, 'apply');
  const wrapUp = mount({ draftId: lesson.result.current.draft.id });
  await ready(wrapUp.result);
  await finishLessonHistory();
  await act(async () => { bump(); });
  await waitFor(() => expect(lesson.result.current.base.sessions.map(session => session.id)).toEqual(['previous-lesson']));
  await waitFor(() => expect(wrapUp.result.current.base.sessions.map(session => session.id)).toEqual(['previous-lesson']));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  const stored = (await handle.repositories.lessonDrafts.getActive()).plan;
  expect(stored).toMatchObject({ history_complete: true, mastery_complete: true });
  expect(lesson.result.current.plan).toEqual(stored);
  expect(wrapUp.result.current.plan).toEqual(stored);
  // At most one upgrade per screen (mastery from Wrap up, then history), and never the same plan twice.
  const written = apply.mock.calls.filter(([transition]) => transition === transitions.setPlan)
    .map(call => JSON.stringify(call[1]));
  expect(written.length).toBeLessThanOrEqual(2);
  expect(new Set(written).size).toBe(written.length);
});

const resumeIncompletePlan = async () => {
  const fixture = draftStart();
  return handle.repositories.lessonDrafts.create({ ...fixture,
    plan: { ...fixture.plan, history_complete: false, mastery_complete: false } });
};

testHook('a failed plan upgrade waits for the next change that saves instead of retrying', async () => {
  // Lesson stays mounted under Wrap up, so both screens see the upgrade and its failure.
  const bump = historyVersions();
  const row = await resumeIncompletePlan();
  const lesson = mount({ draftId: row.id });
  const wrapUp = mount({ draftId: row.id });
  await ready(lesson.result);
  await ready(wrapUp.result);
  const disk = await failDraftUpdates();
  try {
    await finishLessonHistory();
    await act(async () => { bump(); });
    await waitFor(() => expect(lesson.result.current.error).toBe("Couldn't save your last change."));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(disk.failed.attempts).toBeLessThanOrEqual(2);
    expect(lesson.result.current.plan.history_complete).toBe(true);
    expect(wrapUp.result.current.plan).toEqual(lesson.result.current.plan);
  } finally { disk.restore(); }
  await change(lesson.result, transitions.setNotes, 'Room on the phone again');
  await waitFor(() => expect(lesson.result.current.draft.plan.history_complete).toBe(true));
  expect(lesson.result.current.error).toBeNull();
  expect((await handle.repositories.lessonDrafts.getActive()).plan).toEqual(lesson.result.current.plan);
});

testHook('attendance projects loaded participants without blanking or reading again', async () => {
  const baseLoad = jest.spyOn(inputs, 'loadLessonBase');
  jest.spyOn(inputs, 'loadLessonParticipants');
  const renders = [];
  const { result } = renderHook(() => {
    const lesson = useLessonDraft({ start });
    renders.push(lesson);
    return lesson;
  }, { wrapper });
  await ready(result);
  renders.length = 0;
  await change(result, transitions.toggleAbsent, 'c2');
  await change(result, transitions.toggleAbsent, 'c2');
  expect(renders.length).toBeGreaterThan(0);
  for (const lesson of renders) {
    expect(lesson.lessonInput).not.toBeNull();
    expect(lesson.plan).not.toBeNull();
    expect(lesson.choices).not.toBeNull();
  }
  expect(baseLoad).toHaveBeenCalledTimes(1);
  expect(inputs.loadLessonParticipants).toHaveBeenCalledTimes(1);
});

testHook('attendance before the first tick recomputes the plan; after it, it does not', async () => {
  const { result } = mount();
  await ready(result);
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  expect(result.current.plan.present_child_ids).toEqual(['c1', 'c2']);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.plan.present_child_ids).toEqual(['c1']));
  await change(result, transitions.toggleTick, 'letters', 'a');
  const frozen = result.current.plan;
  expect(result.current.draft.plan_fixed_at).toBe(MON);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.lessonInput.presentChildren).toHaveLength(2));
  expect(result.current.plan).toEqual(frozen);
  expect((await handle.repositories.lessonDrafts.getActive()).plan).toEqual(frozen);
});
testHook('a different day never recomputes, frozen or not', async () => {
  const planSpy = jest.spyOn(engine, 'computeLessonPlan');
  for (const frozen of [false, true]) {
    const row = await handle.repositories.lessonDrafts.create(draftStart({ plan_fixed_at: frozen ? MON : null }));
    jest.setSystemTime(new Date('2026-10-21T09:00:00.000Z'));
    const { result, unmount } = mount({ draftId: row.id });
    await ready(result);
    expect(result.current.plan).toEqual(row.plan);
    await change(result, transitions.toggleAbsent, 'c2');
    await waitFor(() => expect(result.current.lessonInput.presentChildren).toHaveLength(1));
    expect(result.current.plan).toEqual(row.plan);
    expect(planSpy).not.toHaveBeenCalled();
    unmount();
    await handle.services.lessonDraft.discard();
  }
});
testHook('a mixed-class group needs a class; choosing stores class, language, pack and plan', async () => {
  start = { ...start, group: { ...start.group, class_id: null },
    members: [{ id: 'c1', class_id: 'class-1' }, { id: 'c2', class_id: 'class-2' }] };
  const { result } = mount();
  await waitFor(() => expect(result.current.needs).toBe('class'));
  await act(async () => {
    await refusal(result.current.ensureDraft());
    await refusal(result.current.apply(transitions.toggleTick, 'letters', 'a'));
  });
  expect(await handle.repositories.lessonDrafts.getActive()).toBeNull();
  await change(result, transitions.chooseClass, { classId: 'class-2' });
  await ready(result);
  const row = await handle.repositories.lessonDrafts.getActive();
  expect(row).toMatchObject({ class_id: 'class-2', language_code: 'xh', pack_id: 'isixhosa-interim-letters-v2',
    plan: { present_child_ids: ['c1', 'c2'] } });
  expect(result.current.needs).toBeNull();
});
testHook('a class with no language needs a language (P6)', async () => {
  await handle.withTransaction(db => db.runAsync('update classes set home_language = null'));
  const { result } = mount();
  await waitFor(() => expect(result.current.needs).toBe('language'));
  await act(async () => { await refusal(result.current.ensureDraft()); });
  await change(result, transitions.chooseLanguage, { languageCode: 'en' });
  await ready(result);
  expect(await handle.repositories.lessonDrafts.getActive()).toMatchObject({
    class_id: 'class-1', language_code: 'en', pack_id: 'english-interim-letters-v2', plan: { made_on: '2026-10-19' },
  });
});
testHook('engine functions run once per change', async () => {
  const planSpy = jest.spyOn(engine, 'computeLessonPlan');
  const choicesSpy = jest.spyOn(engine, 'computeLessonChoices');
  const { result, rerender } = mount();
  await ready(result);
  expect(planSpy).toHaveBeenCalledTimes(1);
  expect(choicesSpy).toHaveBeenCalledTimes(1);
  rerender({});
  await change(result, transitions.setNotes, 'nothing pedagogical changed');
  expect(planSpy).toHaveBeenCalledTimes(1);
  expect(choicesSpy).toHaveBeenCalledTimes(1);
  await change(result, transitions.toggleAbsent, 'c2');
  await waitFor(() => expect(result.current.plan.present_child_ids).toEqual(['c1']));
  expect(planSpy).toHaveBeenCalledTimes(2);
  expect(choicesSpy).toHaveBeenCalledTimes(2);
});
testHook('two mounted hook instances on one draft see the same draft, including a held edit', async () => {
  const first = mount();
  await ready(first.result);
  let row;
  await act(async () => { row = await first.result.current.ensureDraft(); });
  const held = await holdDraftWrite();
  let write;
  act(() => { write = first.result.current.apply(transitions.toggleTick, 'letters', 'a'); });
  await held.entered;
  const second = mount({ draftId: row.id });
  await waitFor(() => expect(second.result.current.draft?.ticks.letters).toEqual(['a']));
  expect(second.result.current.draft).toBe(first.result.current.draft);
  await act(async () => { held.release(); await write; });
  await waitFor(() => expect(second.result.current.draft).toBe(first.result.current.draft));
});

testHook('beginSave from an untouched lesson includes the initial plan and locks edits immediately', async () => {
  const { result } = mount();
  await ready(result);
  const held = await holdDraftWrite();
  let saving, refused;
  act(() => {
    saving = result.current.beginSave();
    refused = result.current.apply(transitions.setNotes, 'too late').then(() => null, error => error);
  });
  await held.entered;
  expect((await refused)?.name).toBe('LessonDraftBusyError');
  let row;
  await act(async () => { held.release(); row = await saving; });
  expect(row.plan).toEqual(result.current.plan);
  expect(row.plan).not.toBeNull();
});
testHook('an untouched lesson opened before midnight and first changed after it keeps a plan for its own date', async () => {
  const { AppState } = require('react-native');
  const listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    listeners.push(listener); return { remove: () => {} };
  });
  jest.setSystemTime(new Date('2026-10-19T21:55:00.000Z')); // 23:55 Monday, programme time
  const { result } = mount();
  await ready(result);
  expect(result.current.draft.lesson_date).toBe('2026-10-19');
  jest.setSystemTime(new Date('2026-10-19T22:05:00.000Z')); // 00:05 Tuesday
  act(() => { for (const listener of listeners) listener('active'); });
  await waitFor(() => expect(result.current.plan.made_on).toBe('2026-10-20'));
  await change(result, transitions.toggleTick, 'letters', 'a');
  const stored = await handle.repositories.lessonDrafts.getActive();
  expect(stored.lesson_date).toBe('2026-10-20');
  expect(planForSave({ plan: stored.plan, lessonDate: stored.lesson_date })).toEqual({ plan: stored.plan, plan_reason: null });
});
testHook('a new lesson takes only group members on the visible roster, as the picker does', async () => {
  await handle.withTransaction(async db => {
    for (const id of ['hidden', 'handed-over']) {
      await db.runAsync("insert into children (id, first_name, last_name, class_id, created_by, hidden_at) values (?, ?, 'Child', 'class-1', ?, ?)",
        id, id, handle.userId, id === 'hidden' ? '2026-10-01T08:00:00Z' : null);
      await db.runAsync("insert into child_ea_assignments (id, user_id, child_id, assigned_at, unassigned_at) values (?, ?, ?, '2026-01-15', ?)",
        id, handle.userId, id, id === 'handed-over' ? '2026-10-01' : null);
    }
    for (const id of ['c1', 'c2', 'hidden', 'handed-over']) {
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values (?, ?, 'class-1', 'year-2026', '2026-01-15')", `ccm-${id}`, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-a')", `cpe-${id}`, id);
      await db.runAsync("insert into child_group_memberships (id, child_id, group_id, joined_at) values (?, ?, 'group-1', '2026-01-15')", `cgm-${id}`, id);
    }
    await db.runAsync("insert into group_ea_assignments (id, group_id, ea_user_id, programme_id) values ('gea', 'group-1', ?, 'programme-a')", handle.userId);
  });
  const { result } = mount({ start: { groupId: 'group-1', upNextGroupId: 'group-1' } });
  await ready(result);
  expect(result.current.draft.attendance.childIds).toEqual(['c1', 'c2']);
});

testHook('a frozen version-1 draft keeps its stored review letters when resumed and saved', async () => {
  await handle.withTransaction(async db => {
    for (const id of ['c1', 'c2']) {
      await db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values (?, ?, 'class-1', 'year-2026', '2026-01-15')", id, id);
      await db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id) values (?, ?, 'programme-a')", id, id);
    }
  });
  const storedPlan = { ...draftStart().plan, engine_version: 1,
    known_letters: ['m', 'l', 'a'], suggested_letters: ['o', 'k'],
    review_letters: ['m', 'l', 'a', 'u'], unlocked_letters: ['o', 'm', 'l', 'a', 'k', 'u'],
    blend_tier: null, suggested_blends: [], suggested_book: null };
  const row = await handle.repositories.lessonDrafts.create(draftStart({
    class_id: 'class-2', language_code: 'xh', pack_id: 'isixhosa-interim-letters-v1',
    plan: storedPlan, plan_fixed_at: MON,
  }));
  const planSpy = jest.spyOn(engine, 'computeLessonPlan');
  const { result } = mount({ draftId: row.id });
  await ready(result);
  await waitFor(() => expect(result.current.choices).not.toBeNull());
  expect(result.current.plan).toEqual(storedPlan);
  await change(result, transitions.setNotes, 'Keep the original review.');
  let saving;
  await act(async () => { saving = await result.current.beginSave(); });
  expect(saving.plan).toEqual(storedPlan);
  await act(async () => { await saveLesson({ handle, draft: saving, nowIso: MON }); });
  const sessions = await handle.repositories.sessions.getSessions({ userId: handle.userId });
  expect(sessions.find(session => session.id === row.session_id).activities.lesson.plan).toEqual(storedPlan);
  expect(planSpy).not.toHaveBeenCalled();
});


testHook('an added child holds suggestions and refuses ticks until its facts arrive', async () => {
  const realLoad = inputs.loadLessonParticipants;
  const load = jest.spyOn(inputs, 'loadLessonParticipants');
  const { result } = mount();
  await ready(result);
  const held = deferred();
  load.mockImplementationOnce(async options => { await held.promise; return realLoad(options); });
  await change(result, transitions.addChildForToday, 'c3');
  expect(result.current.lessonInput).toBeNull();
  expect(result.current.plan).toBeNull();
  expect(result.current.choices).toBeNull();
  const before = await handle.repositories.lessonDrafts.getActive();
  await expect(result.current.apply(transitions.toggleTick, 'letters', 'a'))
    .rejects.toThrow('Lesson suggestions are still loading.');
  expect(await handle.repositories.lessonDrafts.getActive()).toEqual(before);
  await act(async () => { held.resolve(); });
  await ready(result);
  expect(result.current.plan.present_child_ids).toEqual(['c1', 'c2', 'c3']);
});

testHook('failed added-child facts refuse ticks and retry the current participants', async () => {
  const load = jest.spyOn(inputs, 'loadLessonParticipants');
  const baseLoad = jest.spyOn(inputs, 'loadLessonBase');
  const { result } = mount();
  await ready(result);
  load.mockRejectedValueOnce(new Error('Read failed'));
  await change(result, transitions.addChildForToday, 'c3');
  await waitFor(() => expect(result.current.error?.message).toBe('Read failed'));
  expect(result.current.plan).toBeNull();
  const before = await handle.repositories.lessonDrafts.getActive();
  await expect(result.current.apply(transitions.toggleTick, 'letters', 'a'))
    .rejects.toThrow('Lesson suggestions are still loading.');
  expect(await handle.repositories.lessonDrafts.getActive()).toEqual(before);
  act(() => result.current.retry());
  await ready(result);
  expect(result.current.error).toBeNull();
  expect(result.current.plan.present_child_ids).toEqual(['c1', 'c2', 'c3']);
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ participantChildIds: ['c1', 'c2', 'c3'] }));
  expect(baseLoad).toHaveBeenCalledTimes(1);
});

for (const transition of [transitions.chooseClass, transitions.chooseLanguage]) {
  for (const resumed of [false, true]) {
    testHook(`${transition.name} persists only present children${resumed ? ' on yesterday\'s resumed draft' : ''}`, async () => {
      const choosingClass = transition === transitions.chooseClass;
      start = { ...start, group: { ...start.group, class_id: choosingClass ? null : 'class-1' },
        members: [{ id: 'c1', class_id: 'class-1' }, { id: 'c2', class_id: choosingClass ? 'class-2' : 'class-1' }] };
      if (!choosingClass) await handle.withTransaction(db => db.runAsync('update classes set home_language = null'));
      let options;
      if (resumed) {
        const row = await handle.repositories.lessonDrafts.create(draftStart({ lesson_date: '2026-10-18',
          class_id: choosingClass ? null : 'class-1', language_code: null, pack_id: null, plan: null }));
        options = { draftId: row.id };
      }
      const { result } = mount(options);
      await waitFor(() => expect(result.current.needs).toBe(choosingClass ? 'class' : 'language'));
      await change(result, transitions.toggleAbsent, 'c2');
      await change(result, transition, transition === transitions.chooseClass
        ? { classId: 'class-2' } : { languageCode: 'xh' });
      const saved = await handle.repositories.lessonDrafts.getActive();
      expect(saved.plan.present_child_ids).toEqual(['c1']);
      expect(saved.plan.reason).not.toBe('no_children');
      expect(saved.lesson_date).toBe(resumed ? '2026-10-18' : '2026-10-19');
    });
  }
}


testHook('a frozen draft hides its stored plan while added-child facts load', async () => {
  const realLoad = inputs.loadLessonParticipants;
  const load = jest.spyOn(inputs, 'loadLessonParticipants');
  const { result } = mount();
  await ready(result);
  await change(result, transitions.toggleTick, 'letters', 'a');
  const frozen = result.current.plan;
  const held = deferred();
  load.mockImplementationOnce(async options => { await held.promise; return realLoad(options); });
  await change(result, transitions.addChildForToday, 'c3');
  expect(result.current.plan).toBeNull();
  expect(result.current.choices).toBeNull();
  await expect(result.current.apply(transitions.toggleTick, 'letters', 'm'))
    .rejects.toThrow('Lesson suggestions are still loading.');
  await act(async () => { held.resolve(); });
  await ready(result);
  expect(result.current.lessonInput.presentChildren.map(child => child.id)).toEqual(['c1', 'c2', 'c3']);
  expect(result.current.plan).toEqual(frozen);
});
