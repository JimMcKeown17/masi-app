global.__MASI_NO_DEFAULT_HANDLE__ = true;
jest.mock('expo-updates', () => ({ channel: null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn(callback => require('react').useEffect(callback, [callback])) }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }) }));
const mockOffline = { lastSyncResult: null, refreshSyncStatus: jest.fn(async () => {}), triggerBackgroundSync: jest.fn() };
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/services/assessmentHistoryStatus', () => ({ ...jest.requireActual('../src/services/assessmentHistoryStatus'), useAssessmentHistoryStatus: () => ({ pageVersion: 0 }) }));
import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { requestOpen, resetHandleRegistryForTests } from '../src/session/signedInHandle';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { rememberProgrammeSubject } from '../src/utils/programmeSubject';
import { PROGRAMME_CHANGED_NOTE, stepPhrase } from '../src/numeracyLesson/copy';
import { getCurriculum } from '../content/numeracy-curriculum';
import * as masteryModule from '../src/db/repositories/skillMasteryRepository';
import NumberTrackerPanel from '../src/components/numeracy/NumberTrackerPanel';
let handle, dir, fixtureWriter;
const userId = '11111111-1111-4111-8111-111111111111';
const child = { id: 'c1', first_name: 'Lwazi', last_name: 'Test' };
const motion = { motionLevel: 'still', reduceMotion: true, tier: 'static' };
const ui = (props = {}) => <SignedInEAContext.Provider value={{ handle, repositories: handle.repositories }}><NumberTrackerPanel child={child} {...props} /></SignedInEAContext.Provider>;
const render = props => renderWithProviders(ui(props), { motion });
const tile = (screen, key, state = 'Not yet') => screen.getByLabelText(`${stepPhrase(getCurriculum(), key)}, ${state}`);
const ready = async screen => screen.findByText('Number tracker · 0 / 37 steps');
const rows = async () => (await handle.getReader()).getAllAsync('select * from skill_mastery');
const outbox = async () => (await handle.getReader()).getAllAsync("select * from sync_outbox where table_name = 'skill_mastery'");
const mark = (stepKey, confirmed = true) => handle.repositories.skillMastery.setSkillMastery({ childId: child.id, stepKey, confirmed });
const move = () => handle.withTransaction(async db => {
  await db.runAsync("update staff_programme_assignments set ended_at = '2026-11-01' where id = 'spa'");
  await db.runAsync("insert into staff_programme_assignments (id,user_id,programme_id,assigned_at) values ('literacy', ?, 'programme-a', '2026-11-01')", userId);
});
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'number-panel-'));
  fixtureWriter = null;
  handle = await requestOpen({ userId, openDatabase: async name => {
    const db = createBetterSqliteTestDatabase(path.join(dir, name), { honorQueryOnly: true });
    if (!fixtureWriter) fixtureWriter = db;
    return db;
  } });
  await handle.withTransaction(async db => {
    await seedCoreData(db, { includeStaffProgrammeAssignment: false });
    await db.runAsync("insert into staff_programme_assignments (id,user_id,programme_id,assigned_at) values ('spa', ?, 'programme-b', '2026-01-15')", userId);
    await db.runAsync("insert into children (id,first_name,last_name,sync_status) values ('c1','Lwazi','Test','synced')");
    await db.runAsync("insert into child_ea_assignments (id,child_id,user_id,sync_status) values ('ea','c1',?,'synced')", userId);
  });
  mockOffline.lastSyncResult = null;
});
afterEach(async () => { cleanup(); jest.restoreAllMocks(); jest.clearAllMocks(); await resetHandleRegistryForTests(); fs.rmSync(dir, { recursive: true, force: true }); });
test('tapping a not-yet tile ticks it at once and writes one outbox slot', async () => {
  const s = render(); await ready(s); fireEvent.press(tile(s, 'add.5'));
  await waitFor(() => expect(tile(s, 'add.5', 'Ticked')).toBeTruthy());
  expect(await rows()).toEqual([expect.objectContaining({ confirmed: 1, sync_status: 'pending' })]); expect(await outbox()).toHaveLength(1);
});
test('tapping a ticked tile unticks it', async () => {
  await mark('add.5'); const s = render(); await s.findByText('Number tracker · 1 / 37 steps'); fireEvent.press(tile(s, 'add.5', 'Ticked'));
  await waitFor(() => expect(tile(s, 'add.5')).toBeTruthy()); expect((await rows())[0].confirmed).toBe(0);
});
test('an assessment tile does not toggle and explains why', async () => {
  await handle.withTransaction(async db => {
    await db.runAsync(`insert into assessments (id,user_id,child_id,programme_id,assessment_type,assessment_date,question_code,question_version,stopped_reason,sync_status) values ('egma',?,'c1','programme-b','maths_read_numbers','2026-06-01','maths_read_numbers','masi-egma-en-2026-1','completed','synced')`, userId);
    for (let i = 0; i < 3; i++) await db.runAsync(`insert into assessment_items (id,assessment_id,position,item_key,is_correct,metadata,sync_status) values (?,'egma',?,?,1,?,'synced')`, `i${i}`, i, String(i), JSON.stringify({ skill: 'read_numbers', band: 10, reached: true }));
  });
  const s = render(); await s.findByText('Number tracker · 2 / 37 steps'); fireEvent.press(tile(s, 'read_numbers.10', 'Assessment'));
  expect(await s.findByText('EGMA shows this step, so it stays ticked.')).toBeTruthy(); expect(await rows()).toEqual([]); expect(await outbox()).toEqual([]);
});
test('an implied tile does not toggle and explains which tick implies it', async () => {
  await mark('add.10'); const s = render(); await s.findByText('Number tracker · 2 / 37 steps'); fireEvent.press(tile(s, 'add.5', 'Known'));
  expect(await s.findByText("Known because 'up to 10' is ticked.")).toBeTruthy(); expect(await rows()).toHaveLength(1);
});
test('a kept-back tap shows no error', async () => {
  const s = render(); await ready(s);
  const read = jest.spyOn(handle.repositories.skillMastery, 'getSkillMastery');
  jest.spyOn(masteryModule, 'createSkillMasteryRepository').mockReturnValueOnce({ setSkillMastery: jest.fn(async () => null) });
  fireEvent.press(tile(s, 'add.5')); await waitFor(() => expect(read).toHaveBeenCalled());
  expect(await rows()).toEqual([]); expect(s.queryByText('Step update was not saved. Please try again.')).toBeNull();
});
test('a read started before a tap never overwrites the tap', async () => {
  const s = render(); await ready(s);
  const repo = handle.repositories.skillMastery, original = repo.getSkillMastery;
  let release, captured;
  const snapshotReady = new Promise(resolve => { captured = resolve; });
  jest.spyOn(repo, 'getSkillMastery').mockImplementationOnce(async args => { const snapshot = await original(args); captured(); await new Promise(resolve => { release = resolve; }); return snapshot; });
  mockOffline.lastSyncResult = { tableResults: { skill_mastery: {} } }; s.rerender(ui()); await act(async () => { await snapshotReady; });
  fireEvent.press(tile(s, 'add.5')); await waitFor(() => expect(tile(s, 'add.5', 'Ticked')).toBeTruthy());
  await act(async () => { release(); }); expect(tile(s, 'add.5', 'Ticked')).toBeTruthy();
  fireEvent.press(tile(s, 'add.5', 'Ticked')); await waitFor(() => expect(tile(s, 'add.5')).toBeTruthy()); expect((await rows())[0].confirmed).toBe(0);
});
test('a skill_mastery sync result refreshes the panel', async () => {
  const s = render(); await ready(s); await mark('add.5'); mockOffline.lastSyncResult = { tableResults: { skill_mastery: {} } }; s.rerender(ui());
  await waitFor(() => expect(tile(s, 'add.5', 'Ticked')).toBeTruthy());
});
test('a letter_mastery-only sync result does not refresh the number panel', async () => {
  const s = render(); await ready(s); const read = jest.spyOn(handle.repositories.skillMastery, 'getSkillMastery');
  mockOffline.lastSyncResult = { tableResults: { letter_mastery: {} } }; s.rerender(ui()); await act(async () => {}); expect(read).not.toHaveBeenCalled();
});
test('a non-delivery child is read-only', async () => {
  const s = render({ isDelivery: false }); await ready(s); expect(tile(s, 'add.5').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(tile(s, 'add.5'));
  fireEvent.press(s.getByLabelText('Add, steps')); expect(s.queryByRole('button', { name: 'Tick' })).toBeNull(); expect(await rows()).toEqual([]);
});
test('a tap stamps the confirmed numeracy programme', async () => {
  const s = render(); await ready(s); fireEvent.press(tile(s, 'add.5')); await waitFor(() => expect(tile(s, 'add.5', 'Ticked')).toBeTruthy()); expect((await rows())[0].programme_id).toBe('programme-b');
});
test('a programme move while the panel is open writes nothing on the next tap', async () => {
  const s = render(); await ready(s); await move(); fireEvent.press(tile(s, 'add.5')); expect(await s.findByText(PROGRAMME_CHANGED_NOTE)).toBeTruthy(); expect(await rows()).toEqual([]); expect(await outbox()).toEqual([]);
});
test('cached maths after a move to literacy gives a read-only grid', async () => {
  rememberProgrammeSubject(handle, { code: 'numeracy' }); await move(); const s = render(); await s.findByText(PROGRAMME_CHANGED_NOTE); fireEvent.press(tile(s, 'add.5')); expect(await rows()).toEqual([]); expect(await outbox()).toEqual([]);
});

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const syncRefresh = s => { mockOffline.lastSyncResult = { tableResults: { skill_mastery: {} } }; s.rerender(ui()); };
const holdRead = () => {
  const repo = handle.repositories.skillMastery, read = repo.getSkillMastery;
  const captured = deferred(), release = deferred();
  jest.spyOn(repo, 'getSkillMastery').mockImplementationOnce(async args => {
    const snapshot = await read(args); captured.resolve(snapshot); await release.promise; return snapshot;
  });
  return { captured, release };
};
const holdWrite = extra => {
  const repo = masteryModule.createSkillMasteryRepository({ database: handle });
  const release = deferred();
  jest.spyOn(masteryModule, 'createSkillMasteryRepository').mockReturnValueOnce({
    ...repo, setSkillMastery: async args => { await release.promise; const result = await repo.setSkillMastery(args); await extra?.(args); return result; },
  });
  return release;
};
test('a read started after the tap commits publishes the current repository state', async () => {
  const s = render(); await ready(s);
  const repo = masteryModule.createSkillMasteryRepository({ database: handle });
  jest.spyOn(masteryModule, 'createSkillMasteryRepository').mockReturnValueOnce({ ...repo, setSkillMastery: async args => {
    const record = await repo.setSkillMastery(args);
    await repo.setSkillMastery({ ...args, stepKey: 'count.5' }); return record;
  } });
  const read = holdRead(); fireEvent.press(tile(s, 'add.5'));
  await act(async () => { await read.captured.promise; });
  expect(tile(s, 'add.5', 'Ticked')).toBeTruthy(); expect(tile(s, 'count.5')).toBeTruthy();
  await act(async () => { read.release.resolve(); }); expect(tile(s, 'count.5', 'Ticked')).toBeTruthy();
});
test('a background read cannot publish while a tap is pending', async () => {
  await mark('count.5'); const s = render(); await s.findByText('Number tracker · 1 / 37 steps');
  await mark('count.5', false);
  const releaseWrite = holdWrite(); fireEvent.press(tile(s, 'add.5'));
  const read = holdRead(); syncRefresh(s); await act(async () => { await read.captured.promise; read.release.resolve(); });
  expect(tile(s, 'count.5', 'Ticked')).toBeTruthy();
  await act(async () => { releaseWrite.resolve(); });
  await waitFor(() => expect(tile(s, 'add.5', 'Ticked')).toBeTruthy());
  await waitFor(() => expect(tile(s, 'count.5')).toBeTruthy());
});
test('a post-save read is invalidated by the next tap', async () => {
  const s = render(); await ready(s); const read = holdRead(); fireEvent.press(tile(s, 'add.5'));
  await act(async () => { await read.captured.promise; }); expect(tile(s, 'add.5', 'Ticked')).toBeTruthy();
  fireEvent.press(tile(s, 'add.5', 'Ticked')); await waitFor(() => expect(tile(s, 'add.5')).toBeTruthy());
  await act(async () => { read.release.resolve(); }); expect(tile(s, 'add.5')).toBeTruthy(); expect((await rows())[0].confirmed).toBe(0);
});
test('an invalidated sync refresh followed by a failed save re-reads storage and keeps the grid retryable', async () => {
  await mark('count.5'); const s = render(); await s.findByText('Number tracker · 1 / 37 steps');
  await mark('count.5', false);
  await fixtureWriter.execAsync("create trigger reject_add before insert on skill_mastery when new.step_key = 'add.5' begin select raise(abort, 'injected failure'); end;");
  const read = holdRead(); syncRefresh(s); await act(async () => { await read.captured.promise; });
  const releaseWrite = holdWrite(); fireEvent.press(tile(s, 'add.5'));
  await act(async () => { read.release.resolve(); }); expect(tile(s, 'count.5', 'Ticked')).toBeTruthy();
  await act(async () => { releaseWrite.resolve(); });
  await s.findByText('Step update was not saved. Please try again.');
  await waitFor(() => expect(tile(s, 'count.5')).toBeTruthy());
  expect(tile(s, 'add.5').props.accessibilityState.disabled).toBe(false);
  expect(mockOffline.refreshSyncStatus).toHaveBeenCalledTimes(1); expect(mockOffline.triggerBackgroundSync).toHaveBeenCalledTimes(1);
  await fixtureWriter.execAsync('drop trigger reject_add');
  fireEvent.press(tile(s, 'add.5')); await waitFor(() => expect(tile(s, 'add.5', 'Ticked')).toBeTruthy());
});
test('a focus refresh discarded during a failed save cannot leave loading stuck', async () => {
  const s = render(); await ready(s);
  await fixtureWriter.execAsync("create trigger reject_add before insert on skill_mastery begin select raise(abort, 'injected failure'); end;");
  const releaseWrite = holdWrite(); fireEvent.press(tile(s, 'add.5'));
  const read = holdRead();
  await act(async () => { require('@react-navigation/native').useFocusEffect.mock.calls.at(-1)[0](); });
  await act(async () => { await read.captured.promise; read.release.resolve(); });
  await act(async () => { releaseWrite.resolve(); });
  await s.findByText('Step update was not saved. Please try again.');
  expect(tile(s, 'add.5').props.accessibilityState.disabled).toBe(false);
});
test('the open skill sheet ticks through the same writer and rebuilds its row', async () => {
  const s = render(); await ready(s); fireEvent.press(s.getByLabelText('Add, steps'));
  fireEvent.press(await s.findByRole('button', { name: 'Tick' }));
  await waitFor(() => expect(s.getByText(/Ticked by you/)).toBeTruthy());
  expect((await rows())[0]).toEqual(expect.objectContaining({ step_key: 'add.5', confirmed: 1, programme_id: 'programme-b' }));
  expect(await outbox()).toHaveLength(1);
  fireEvent.press(s.getByRole('button', { name: 'Tick' }));
  await waitFor(async () => expect(await rows()).toHaveLength(2));
  expect((await rows()).map(row => row.step_key).sort()).toEqual(['add.10', 'add.5']);
});
test('a tap changes the tile before the write finishes', async () => {
  const s = render(); await ready(s);
  const release = holdWrite();
  fireEvent.press(tile(s, 'add.5'));
  expect(tile(s, 'add.5', 'Ticked')).toBeTruthy();
  expect(await rows()).toEqual([]);
  await act(async () => { release.resolve(); });
  await waitFor(async () => expect(await outbox()).toHaveLength(1));
});
test('a second tile can be tapped while the first write is pending', async () => {
  const s = render(); await ready(s); const release = holdWrite();
  fireEvent.press(tile(s, 'add.5'));
  fireEvent.press(tile(s, 'count.5'));
  expect(tile(s, 'add.5', 'Ticked')).toBeTruthy();
  expect(tile(s, 'count.5', 'Ticked')).toBeTruthy();
  expect(await rows()).toHaveLength(0);
  await act(async () => { release.resolve(); });
  await waitFor(async () => expect(await rows()).toHaveLength(2));
  expect((await rows()).every(row => row.confirmed === 1)).toBe(true);
  expect(await outbox()).toHaveLength(2);
  await waitFor(() => expect(mockOffline.refreshSyncStatus).toHaveBeenCalledTimes(1));
  expect(mockOffline.triggerBackgroundSync).toHaveBeenCalledTimes(1);
});
test('tick then untick of one tile lands in order', async () => {
  const s = render(); await ready(s); const release = holdWrite();
  fireEvent.press(tile(s, 'add.5')); fireEvent.press(tile(s, 'add.5', 'Ticked'));
  expect(tile(s, 'add.5')).toBeTruthy();
  await act(async () => { release.resolve(); });
  await waitFor(async () => expect((await rows())[0]?.confirmed).toBe(0));
  expect(await outbox()).toHaveLength(1);
  expect(tile(s, 'add.5')).toBeTruthy();
});
test('taps keep their order across closing and reopening the tracker', async () => {
  const first = render(); await ready(first); const release = holdWrite();
  fireEvent.press(tile(first, 'add.5'));
  fireEvent.press(tile(first, 'add.5', 'Ticked'));
  first.unmount();
  const reopened = render(); await ready(reopened);
  fireEvent.press(tile(reopened, 'add.5'));
  await act(async () => { release.resolve(); });
  await waitFor(() => expect(mockOffline.refreshSyncStatus).toHaveBeenCalledTimes(2));
  expect(await rows()).toEqual([expect.objectContaining({ step_key: 'add.5', confirmed: 1 })]);
  expect(tile(reopened, 'add.5', 'Ticked')).toBeTruthy();
});
test('a failed write rolls the tile back from SQLite and shows the note', async () => {
  const s = render(); await ready(s);
  await fixtureWriter.execAsync("create trigger reject_add before insert on skill_mastery begin select raise(abort, 'injected failure'); end;");
  const release = holdWrite(); fireEvent.press(tile(s, 'add.5'));
  expect(tile(s, 'add.5', 'Ticked')).toBeTruthy();
  await act(async () => { release.resolve(); });
  await s.findByText('Step update was not saved. Please try again.');
  expect(tile(s, 'add.5')).toBeTruthy();
  expect(await rows()).toHaveLength(0); expect(await outbox()).toHaveLength(0);
});
test('a failed write rolls only its own tile back and later taps still land', async () => {
  const s = render(); await ready(s);
  await fixtureWriter.execAsync("create trigger reject_add before insert on skill_mastery when new.step_key = 'add.5' begin select raise(abort, 'injected failure'); end;");
  const release = holdWrite(); fireEvent.press(tile(s, 'add.5')); fireEvent.press(tile(s, 'count.5'));
  expect(tile(s, 'count.5', 'Ticked')).toBeTruthy();
  await act(async () => { release.resolve(); });
  await s.findByText('Step update was not saved. Please try again.');
  await waitFor(() => expect(mockOffline.refreshSyncStatus).toHaveBeenCalledTimes(1));
  expect(tile(s, 'add.5')).toBeTruthy();
  expect(tile(s, 'count.5', 'Ticked')).toBeTruthy();
  expect(await rows()).toEqual([expect.objectContaining({ step_key: 'count.5', confirmed: 1 })]);
  expect(await outbox()).toHaveLength(1);
  expect(mockOffline.triggerBackgroundSync).toHaveBeenCalledTimes(1);
});
