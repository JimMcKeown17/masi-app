import { getDefaultTestHandle } from '../test-support/defaultTestHandle';
import { getTestReader, getTestWriter, openDefaultTestHandle } from '../test-support/testDatabase';
import { requestClose } from '../src/session/signedInHandle';
import * as state from '../src/lessonPlan/lessonDraftState';
import { MON } from '../test-support/lessonSaveFixtures';
import { deferred, observe, draftStart, holdDraftWrite } from '../test-support/lessonDraftTestUtils';
import { saveLesson } from '../src/services/lessonSave';

let handle, controller, drafts;
beforeEach(() => {
  handle = getDefaultTestHandle();
  drafts = handle.repositories.lessonDrafts;
  controller = handle.services.lessonDraft;
});
const start = () => controller.open({ start: draftStart() });
const tick = value => controller.apply(state.toggleTick, 'letters', value, { plan: draftStart().plan, nowIso: MON });
const stored = () => drafts.getActive();
const expectError = async (promise, name) => {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  expect(error?.name).toBe(name);
  return error;
};

test('opening a new lesson writes nothing', async () => {
  await start();
  expect(controller.getSnapshot()).toMatchObject({ status: 'unsaved', draft: draftStart() });
  expect(await stored()).toBeNull();
});
test('the first change creates the draft', async () => {
  await start();
  const row = await tick('a');
  expect(row.id).toEqual(expect.any(String));
  expect((await stored()).ticks.letters).toEqual(['a']);
  expect(controller.getSnapshot().status).toBe('ready');
});
test('rapid changes persist in order', async () => {
  await start();
  const held = await holdDraftWrite();
  const writes = Array.from({ length: 10 }, (_, i) => tick(String(i)));
  await held.entered;
  expect(controller.getSnapshot().draft.ticks.letters).toHaveLength(10);
  held.release();
  await Promise.all(writes);
  expect((await stored()).ticks.letters).toEqual(Array.from({ length: 10 }, (_, i) => String(i)));
  expect(await (await handle.getReader()).getFirstAsync('select count(*) as n from lesson_drafts')).toEqual({ n: 1 });
});
test('cross-screen edits persist in order', async () => {
  await start();
  await controller.ensureDraft();
  const held = await holdDraftWrite();
  const first = tick('a');
  const second = controller.apply(state.toggleNoOneNew, 'c1');
  const third = tick('m');
  await held.entered;
  held.release();
  await Promise.all([first, second, third]);
  expect((await stored()).ticks).toMatchObject({ letters: ['a', 'm'], noOneNew: ['c1'] });
});
test('a second screen opening the draft while a write is held attaches and sees the pending edits', async () => {
  await start();
  const row = await controller.ensureDraft();
  const read = jest.spyOn(drafts, 'getActive');
  const held = await holdDraftWrite();
  const write = tick('a');
  await held.entered;
  const attached = await controller.open({ draftId: row.id });
  expect(attached.ticks.letters).toEqual(['a']);
  expect(controller.getSnapshot().draft).toBe(attached);
  expect(read).not.toHaveBeenCalled();
  held.release();
  await write;
});
test('a load that settles after discard or after the handle closes changes nothing', async () => {
  const row = await drafts.create(draftStart());
  const reader = await getTestReader();
  const original = reader.getFirstAsync;
  const entered = deferred(), release = deferred();
  reader.getFirstAsync = async (...args) => {
    const value = await original(...args);
    if (/select \* from lesson_drafts limit/i.test(args[0])) { entered.resolve(); await release.promise; }
    return value;
  };
  const opening = observe(controller.open({ draftId: row.id }));
  await entered.promise;
  const discarding = controller.discard();
  release.resolve();
  await Promise.all([opening, discarding]);
  expect(controller.getSnapshot()).toMatchObject({ status: 'empty', draft: null });
  expect(await stored()).toBeNull();
  reader.getFirstAsync = original;

  const other = await drafts.create(draftStart());
  const gate = deferred(), loaded = deferred();
  reader.getFirstAsync = async (...args) => {
    const value = await original(...args);
    if (/select \* from lesson_drafts limit/i.test(args[0])) { loaded.resolve(); await gate.promise; }
    return value;
  };
  const later = observe(controller.open({ draftId: other.id }));
  await loaded.promise;
  const closing = requestClose({ reason: 'test' });
  expect((await later).error?.name).toBe('StaleActorError');
  gate.resolve();
  await closing;
  expect(controller.getSnapshot()).toMatchObject({ status: 'closed', draft: null });
});
test('save waits for queued edits and refuses new ones', async () => {
  await start();
  const held = await holdDraftWrite();
  const write = tick('a');
  await held.entered;
  let saved = false;
  const saving = controller.beginSave().then(row => { saved = true; return row; });
  await expectError(tick('m'), 'LessonDraftBusyError');
  expect(saved).toBe(false);
  held.release();
  await write;
  expect((await saving).ticks.letters).toEqual(['a']);
  expect(controller.getSnapshot().status).toBe('saving');
});
test('a failed write drops only that change; later queued changes still land', async () => {
  await start();
  await controller.ensureDraft();
  const held = await holdDraftWrite({ fail: true });
  const lost = observe(tick('a'));
  const kept = tick('m');
  await held.entered;
  expect(controller.getSnapshot().draft.ticks.letters).toEqual(['a', 'm']);
  held.release();
  expect((await lost).error.message).toBe('Disk full');
  await kept;
  expect((await stored()).ticks.letters).toEqual(['m']);
  expect(controller.getSnapshot()).toMatchObject({ draft: { ticks: { letters: ['m'] } }, error: "Couldn't save your last change." });
});
test('an edit that fails after Save is pressed stops the save: no session, no attendees, draft kept', async () => {
  await start();
  const row = await controller.ensureDraft();
  const held = await holdDraftWrite({ fail: true });
  const lost = observe(tick('a'));
  await held.entered;
  const saving = observe(controller.beginSave().then(draft => saveLesson({
    handle, draft, sessionTypeFields: {}, nowIso: MON,
  })));
  held.release();
  await lost;
  expect((await saving).error?.name).toBe('LessonDraftWriteError');
  expect(controller.getSnapshot().status).toBe('ready');
  expect((await stored()).id).toBe(row.id);
  const reader = await handle.getReader();
  expect(await reader.getAllAsync('select * from sessions')).toEqual([]);
  expect(await reader.getAllAsync('select * from session_attendees')).toEqual([]);
  await controller.apply(state.setNotes, 'try again');
});
test('a failed save reopens edits; a successful save clears the controller', async () => {
  await start();
  await tick('a');
  await controller.beginSave();
  controller.endSave({ saved: false });
  await controller.apply(state.setNotes, 'new');
  await controller.beginSave();
  const db = await getTestWriter();
  const write = jest.spyOn(db, 'runAsync');
  controller.endSave({ saved: true });
  expect(controller.getSnapshot()).toMatchObject({ status: 'empty', draft: null });
  expect(write).not.toHaveBeenCalled();
});
test('after the handle closes, apply and beginSave reject and nothing is written', async () => {
  await start();
  await controller.ensureDraft();
  const tables = ['lesson_drafts', 'sessions', 'session_attendees', 'sync_outbox'];
  const before = await Promise.all(tables.map(async table => (await handle.getReader()).getAllAsync(`select * from ${table}`)));
  const held = await holdDraftWrite();
  const old = observe(tick('a')), queued = observe(tick('m'));
  await held.entered;
  const closing = requestClose({ reason: 'test close' });
  expect((await old).error?.name).toBe('StaleActorError');
  expect((await queued).error?.name).toBe('StaleActorError');
  await expectError(tick('z'), 'StaleActorError');
  await expectError(controller.beginSave(), 'StaleActorError');
  const snapshot = controller.getSnapshot();
  held.release();
  await closing;
  expect(controller.getSnapshot()).toBe(snapshot);
  // Reopen the same file: neither the held edit nor the queued edit survived revocation.
  const reopened = await openDefaultTestHandle();
  const after = await Promise.all(tables.map(async table => (await reopened.getReader()).getAllAsync(`select * from ${table}`)));
  expect(after).toEqual(before);
  expect(reopened.services.lessonDraft).not.toBe(controller);
  expect(snapshot).toMatchObject({ status: 'closed', draft: null });
});
test('a corrupt draft gives corrupt and discard deletes it', async () => {
  const row = await drafts.create(draftStart());
  await handle.withTransaction(tx => tx.runAsync("update lesson_drafts set ticks = 'broken'"));
  await controller.open({ draftId: row.id });
  expect(controller.getSnapshot()).toMatchObject({ status: 'corrupt', existingDraftId: row.id });
  await controller.discard();
  expect(await stored()).toBeNull();
});
test('a second start while a draft exists gives exists with its id', async () => {
  const row = await drafts.create(draftStart());
  await start();
  await expectError(controller.ensureDraft(), 'LessonDraftExistsError');
  expect(controller.getSnapshot()).toMatchObject({ status: 'exists', existingDraftId: row.id });
});
test('a write that settles after discard or clear cannot republish its draft', async () => {
  await start();
  await controller.ensureDraft();
  let held = await holdDraftWrite();
  const write = tick('a');
  await held.entered;
  const discard = controller.discard();
  held.release();
  await Promise.all([write, discard]);
  expect(controller.getSnapshot()).toMatchObject({ status: 'empty', draft: null });
  expect(await stored()).toBeNull();
  held.restore();
  await start();
  held = await holdDraftWrite();
  const pending = tick('m');
  await held.entered;
  controller.endSave({ saved: true });
  const cleared = controller.getSnapshot();
  held.release();
  await pending;
  expect(controller.getSnapshot()).toBe(cleared);
});
test('an earlier failed edit is reported even when a later queued edit succeeded', async () => {
  await start();
  await controller.ensureDraft();
  const held = await holdDraftWrite({ fail: true });
  const lost = observe(tick('a')), kept = tick('m');
  await held.entered;
  held.release();
  await lost;
  await kept;
  await expectError(controller.beginSave(), 'LessonDraftWriteError');
  expect((await controller.beginSave()).ticks.letters).toEqual(['m']);
});
