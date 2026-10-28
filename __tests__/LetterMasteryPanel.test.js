import { useAssessmentHistoryStatus } from '../src/services/assessmentHistoryStatus';
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'), useAssessmentHistoryStatus: jest.fn(),
}));
beforeEach(() => useAssessmentHistoryStatus.mockReturnValue({ running: false, pageVersion: 0, runVersion: 0 }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../src/constants/colors';
import LetterMasteryPanel from '../src/components/assessment/LetterMasteryPanel';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createMasteryRepository, masteryRepository } from '../src/db/repositories/masteryRepository';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { createClassesRepository, classesRepository } from '../src/db/repositories/classesRepository';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(callback => require('react').useEffect(callback, [callback])),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: { letterEvidenceFor: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: { getLetterMastery: jest.fn(), setLetterMastery: jest.fn() },
}));

jest.mock('../src/db/repositories/classesRepository', () => ({
  ...jest.requireActual('../src/db/repositories/classesRepository'),
  classesRepository: { getActiveClassForChild: jest.fn() },
}));

describe('LetterMasteryPanel', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
  const classItem = { id: 'class-1', home_language: 'English', letter_order_edition: '2026-10-23' };
  const panel = (props = {}) => <LetterMasteryPanel child={child} classItem={classItem} {...props} />;
  const stored = (letter, confirmed = true, overrides = {}) => ({
    id: 'record-' + letter, child_id: child.id, letter, language: 'en', confirmed, ...overrides,
  });
  const syncResult = table => ({ tableResults: { [table]: { success: true, synced: 1, failed: 0 } } });

  let storedRows;
  const saveRecord = async args => {
    const record = stored(args.letter, args.confirmed, { child_id: args.childId, language: args.language });
    storedRows = storedRows.filter(row => row.letter !== args.letter || row.language !== args.language);
    storedRows.push(record);
    return record;
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync, lastSyncResult: null });
    classesRepository.getActiveClassForChild.mockResolvedValue(classItem);
    assessmentsRepository.letterEvidenceFor.mockResolvedValue([]);
    storedRows = [];
    masteryRepository.getLetterMastery.mockImplementation(async ({ childId, language }) =>
      storedRows.filter(row => row.child_id === childId && row.language === language));
    masteryRepository.setLetterMastery.mockImplementation(saveRecord);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });
  afterEach(() => jest.clearAllMocks());

  test('uses lowercase green taught tiles and the three-state legend', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([stored('a')]);
    const screen = render(panel());
    const tile = await screen.findByLabelText('a, taught by coach');
    expect(StyleSheet.flatten(tile.props.style).backgroundColor).toBe(colors.successText);
    expect(screen.getAllByText(/^[a-z]$/)).toHaveLength(26);
    ['Taught', 'Not yet', 'Assessment (locked)'].forEach(label => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.queryByText('New this session')).toBeNull();
  });

  test('a non-delivery child shows mastery evidence without any confirmation controls', async () => {
    assessmentsRepository.letterEvidenceFor.mockResolvedValue([{
      id: 'control-assessment', child_id: child.id, question_code: 'letter_sounds',
      language: 'en', assessment_date: '2026-07-01',
      items: [{ prompt: 'A', is_correct: true, metadata: { reached: true } }],
    }]);
    const screen = render(panel({ isDelivery: false }));
    expect(await screen.findByText('1 / 26 letters mastered')).toBeTruthy();
    expect(screen.getAllByText(/^[a-z]$/)).toHaveLength(26);
    expect(screen.queryAllByRole('button', { includeHiddenElements: true })).toHaveLength(0);
    fireEvent.press(screen.getByText('m'));
    expect(masteryRepository.setLetterMastery).not.toHaveBeenCalled();
  });

  test('assessment mastery stays locked and cannot be pressed', async () => {
    assessmentsRepository.letterEvidenceFor.mockResolvedValue([{
      id: 'letter-assessment', child_id: child.id, question_code: 'letter_sounds',
      language: 'en', assessment_date: '2026-07-01',
      items: [{ prompt: 'A', is_correct: true, metadata: { reached: true } }],
    }]);
    const screen = render(panel());
    const tile = await screen.findByLabelText('a, mastered from assessment, locked');
    expect(assessmentsRepository.letterEvidenceFor).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'en' });
    expect(screen.getByText('Last assessed: 2026-07-01')).toBeTruthy();
    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ backgroundColor: colors.successBg, borderColor: colors.successBorder });
    fireEvent.press(tile);
    expect(masteryRepository.setLetterMastery).not.toHaveBeenCalled();
  });

  test.each([null, 'isiZulu'])('shows no letter grid for unsupported class language %s', async home_language => {
    classesRepository.getActiveClassForChild.mockResolvedValue({ ...classItem, home_language });
    const screen = render(panel());
    expect(await screen.findByText('No letter set for this class language.')).toBeTruthy();
    expect(screen.queryAllByText(/^[a-z]$/)).toHaveLength(0);
    expect(assessmentsRepository.letterEvidenceFor).not.toHaveBeenCalled();
    expect(masteryRepository.getLetterMastery).not.toHaveBeenCalled();
    expect(masteryRepository.setLetterMastery).not.toHaveBeenCalled();
  });

  test('no active class membership has no letter grid', async () => {
    classesRepository.getActiveClassForChild.mockResolvedValue(null);
    const screen = render(panel());
    expect(await screen.findByText('No letter set for this class language.')).toBeTruthy();
    expect(screen.queryAllByText(/^[a-z]$/)).toHaveLength(0);
    expect(assessmentsRepository.letterEvidenceFor).not.toHaveBeenCalled();
    expect(masteryRepository.getLetterMastery).not.toHaveBeenCalled();
  });

  test('an unknown class edition asks for an app update without a grid', async () => {
    classesRepository.getActiveClassForChild.mockResolvedValue({ ...classItem, letter_order_edition: '2099-01-01' });
    const screen = render(panel());
    expect(await screen.findByText("Update the app to teach this class's letters.")).toBeTruthy();
    expect(screen.queryAllByText(/^[a-z]$/)).toHaveLength(0);
  });

  test('an Afrikaans class shows Afrikaans confirmations only and saves new marks as af', async () => {
    storedRows = [stored('a', true, { language: 'af' }), stored('s')];
    classesRepository.getActiveClassForChild.mockResolvedValue({ ...classItem, id: 'class-af', home_language: 'Afrikaans' });
    const screen = render(panel());
    expect(await screen.findByLabelText('a, taught by coach')).toBeTruthy();
    expect(assessmentsRepository.letterEvidenceFor).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'af' });
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledWith({ childId: child.id, language: 'af' });
    expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
    expect(screen.getByText('1 / 26 letters mastered')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await waitFor(() => expect(masteryRepository.setLetterMastery).toHaveBeenCalledWith({
      childId: child.id, letter: 'm', language: 'af', confirmed: true,
    }));
  });

  test('toggling a letter on then off writes corrections and updates the mastered count', async () => {
    const screen = render(panel());
    fireEvent.press(await screen.findByLabelText('a, not mastered'));
    await screen.findByText('1 / 26 letters mastered');
    expect(masteryRepository.setLetterMastery).toHaveBeenCalledTimes(1);
    expect(masteryRepository.setLetterMastery).toHaveBeenNthCalledWith(1, {
      childId: child.id, letter: 'a', language: 'en', confirmed: true,
    });
    expect(masteryRepository.setLetterMastery.mock.calls[0][0]).not.toHaveProperty('changedAt');
    fireEvent.press(screen.getByLabelText('a, taught by coach'));
    await screen.findByText('0 / 26 letters mastered');
    expect(masteryRepository.setLetterMastery).toHaveBeenCalledTimes(2);
    expect(masteryRepository.setLetterMastery).toHaveBeenNthCalledWith(2, {
      childId: child.id, letter: 'a', language: 'en', confirmed: false,
    });
    await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(3));
    expect(refreshSyncStatus).toHaveBeenCalledTimes(2);
    expect(triggerBackgroundSync).toHaveBeenCalledTimes(2);
  });

  test('the returned confirmation decides the displayed value', async () => {
    masteryRepository.setLetterMastery.mockResolvedValueOnce({ confirmed: false });
    const screen = render(panel());
    fireEvent.press(await screen.findByLabelText('a, not mastered'));
    await waitFor(() => expect(refreshSyncStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('a, not mastered')).toBeTruthy();
    expect(screen.getByText('0 / 26 letters mastered')).toBeTruthy();
  });

  test('a pending write prevents another letter write', async () => {
    let release;
    masteryRepository.setLetterMastery.mockImplementationOnce(async args => {
      await new Promise(resolve => { release = resolve; });
      return saveRecord(args);
    });
    const screen = render(panel());
    fireEvent.press(await screen.findByLabelText('a, not mastered'));
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    expect(masteryRepository.setLetterMastery).toHaveBeenCalledTimes(1);
    await act(async () => { release({ confirmed: true }); });
    expect(screen.getByLabelText('a, taught by coach')).toBeTruthy();
  });

  test('failed taught-letter save keeps the cell unsaved and shows a retryable error', async () => {
    masteryRepository.setLetterMastery.mockRejectedValueOnce(new Error('SQLite write failed'));
    const screen = render(panel());
    fireEvent.press(await screen.findByLabelText('a, not mastered'));
    expect(await screen.findByText('Letter update was not saved. Please try again.')).toBeTruthy();
    expect(screen.getByLabelText('a, not mastered')).toBeTruthy();
    expect(screen.queryByText('1 / 26 letters mastered')).toBeNull();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();
  });

  test('a sync-status refresh failure after a successful write does not show the save error', async () => {
    refreshSyncStatus.mockRejectedValueOnce(new Error('sync status read failed'));
    const screen = render(panel());
    fireEvent.press(await screen.findByLabelText('a, not mastered'));
    expect(await screen.findByText('1 / 26 letters mastered')).toBeTruthy();
    expect(screen.queryByText('Letter update was not saved. Please try again.')).toBeNull();
  });

  test('an increment of pageVersion re-reads once without a spinner and shows the new confirmation', async () => {
    const screen = render(panel());
    await screen.findByLabelText('a, not mastered');
    let release;
    masteryRepository.getLetterMastery.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    useAssessmentHistoryStatus.mockReturnValue({ running: true, pageVersion: 1, runVersion: 0 });
    screen.rerender(panel());
    await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(2));
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.getByLabelText('a, not mastered')).toBeTruthy();
    await act(async () => { release([stored('a')]); });
    expect(screen.getByLabelText('a, taught by coach')).toBeTruthy();
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(2);
  });

  test('mounting with a nonzero pageVersion loads once from useFocusEffect', async () => {
    useAssessmentHistoryStatus.mockReturnValue({ running: false, pageVersion: 9, runVersion: 4 });
    const screen = render(panel());
    await screen.findByText('0 / 26 letters mastered');
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
  });

  test('the panel re-reads after a sync pass that touched letter_mastery', async () => {
    masteryRepository.getLetterMastery.mockResolvedValueOnce([stored('a'), stored('s')]);
    const screen = render(panel());
    await screen.findByText('2 / 26 letters mastered');
    let release;
    masteryRepository.getLetterMastery.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync, lastSyncResult: syncResult('letter_mastery') });
    screen.rerender(panel());
    await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('a, taught by coach')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    await act(async () => { release([stored('a'), stored('s', false)]); });
    expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
    expect(screen.getByText('1 / 26 letters mastered')).toBeTruthy();
  });

  test('a sync pass that sent no mastery does not re-read', async () => {
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync, lastSyncResult: syncResult('letter_mastery') });
    const screen = render(panel());
    await screen.findByText('0 / 26 letters mastered');
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync, lastSyncResult: syncResult('children') });
    screen.rerender(panel());
    await act(async () => {});
    expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1);
  });

  test('only the latest load can publish its result and clear loading', async () => {
    let releaseOld, releaseNew;
    masteryRepository.getLetterMastery
      .mockReturnValueOnce(new Promise(resolve => { releaseOld = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { releaseNew = resolve; }));
    const screen = render(panel());
    await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(1));
    screen.rerender(panel({ child: { ...child, id: 'child-2' } }));
    await waitFor(() => expect(masteryRepository.getLetterMastery).toHaveBeenCalledTimes(2));
    await act(async () => { releaseOld([stored('a')]); });
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
    await act(async () => { releaseNew([stored('s', true, { child_id: 'child-2' })]); });
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.getByLabelText('s, taught by coach')).toBeTruthy();
    expect(screen.getByLabelText('a, not mastered')).toBeTruthy();
  });
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

describe('LetterMasteryPanel read/tap ordering with real SQLite', () => {
  let f, mastery, readRecords, writeRecord, read, write, offline, child, repositories;
  const classItem = { id: 'class-1', home_language: 'English', letter_order_edition: '2026-10-23' };
  const panel = () => (
    <SignedInEAContext.Provider value={{ repositories }}>
      <LetterMasteryPanel child={child} classItem={classItem} />
    </SignedInEAContext.Provider>
  );
  const mark = (letter, confirmed) => ({
    childId: f.childId, letter, language: 'en', confirmed,
  });
  const failConfirmingM = () => f.db.execAsync(`
    create trigger reject_panel_m before insert on letter_mastery
    when new.letter = 'm' and new.confirmed = 1
    begin select raise(abort, 'injected panel save failure'); end;
  `);
  const syncRefresh = screen => {
    offline = { ...offline, lastSyncResult: {
      tableResults: { letter_mastery: { success: true, synced: 1, failed: 0 } },
    } };
    useOffline.mockReturnValue(offline);
    screen.rerender(panel());
  };

  beforeEach(async () => {
    f = await createFamilySyncFixture({ withDelivery: true });
    mastery = createMasteryRepository({ database: f.db });
    readRecords = mastery.getLetterMastery;
    writeRecord = mastery.setLetterMastery;
    await writeRecord(mark('m', false));
    read = jest.spyOn(mastery, 'getLetterMastery');
    write = jest.spyOn(mastery, 'setLetterMastery');
    await f.db.runAsync("insert into schools (id, name) values ('school-1', 'Test school')");
    await f.db.runAsync("insert into academic_years (id, label, starts_on, ends_on, is_active) values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1)");
    await f.db.runAsync("insert into classes (id, school_id, name, grade, home_language, academic_year_id) values ('class-1', 'school-1', 'English class', '1', 'English', 'year-2026')");
    await f.db.runAsync("update children set class_id = 'class-1' where id = ?", f.childId);
    await f.db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, enrolled_at) values ('active-class', ?, 'class-1', 'year-2026', '2026-01-15')", f.childId);
    repositories = { assessments: f.assessments, mastery, classes: createClassesRepository({ database: f.db }) };
    child = { id: f.childId, first_name: 'Test', last_name: 'Child' };
    offline = { refreshSyncStatus: jest.fn(async () => {}), triggerBackgroundSync: jest.fn(), lastSyncResult: null };
    useAuth.mockReturnValue({ user: { id: f.userId } });
    useOffline.mockReturnValue(offline);
  });
  afterEach(async () => {
    cleanup();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await f.db.closeAsync();
  });

  test('the active isiXhosa membership wins over the English class on the child row', async () => {
    await f.db.runAsync("insert into classes (id, school_id, name, grade, home_language, academic_year_id) values ('xhosa-class', 'school-1', 'Xhosa class', '1', 'isiXhosa', 'year-2026')");
    await f.db.runAsync("update child_class_memberships set class_id = 'xhosa-class' where id = 'active-class'");
    const screen = render(panel());
    expect(await screen.findByText('isiXhosa')).toBeTruthy();
    expect(screen.queryByText('English')).toBeNull();
    expect(screen.getAllByText(/^[a-z]$/).map(node => node.props.children).slice(0, 4)).toEqual(['o', 'm', 'l', 'a']);
    expect((await f.db.getFirstAsync('select class_id from children where id = ?', f.childId)).class_id).toBe('class-1');
    fireEvent.press(screen.getByLabelText('a, not mastered'));
    await screen.findByLabelText('a, taught by coach');
    expect(write).toHaveBeenCalledWith({ childId: f.childId, letter: 'a', language: 'xh', confirmed: true });
  });

  test('a pre-tap snapshot released after commit cannot change the tile or make the next tap confirm twice', async () => {
    const screen = render(panel());
    await screen.findByLabelText('m, not mastered');
    const captured = deferred(), release = deferred();
    read.mockImplementationOnce(async args => {
      const snapshot = await readRecords(args);
      captured.resolve(snapshot);
      await release.promise;
      return snapshot;
    });
    syncRefresh(screen);
    expect(await captured.promise).toEqual([expect.objectContaining({ confirmed: false })]);

    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await screen.findByLabelText('m, taught by coach');
    expect(await readRecords({ childId: f.childId, language: 'en' }))
      .toEqual([expect.objectContaining({ confirmed: true })]);

    await act(async () => { release.resolve(); });
    const tileStillShowsCommit = screen.queryByLabelText('m, taught by coach') !== null;
    fireEvent.press(screen.getByText('m'));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect({
      tileStillShowsCommit,
      corrections: write.mock.calls.map(([args]) => args.confirmed),
    }).toEqual({ tileStillShowsCommit: true, corrections: [true, false] });
    expect(await readRecords({ childId: f.childId, language: 'en' }))
      .toEqual([expect.objectContaining({ confirmed: false })]);
  });

  test('a read started after the tap commits publishes the current repository state', async () => {
    const screen = render(panel());
    await screen.findByLabelText('m, not mastered');
    const captured = deferred(), release = deferred();
    write.mockImplementationOnce(async args => {
      const record = await writeRecord(args);
      // Another storage change is not in the setter's single-record reply.
      await writeRecord(mark('s', true));
      return record;
    });
    read.mockImplementationOnce(async args => {
      const snapshot = await readRecords(args);
      captured.resolve(snapshot);
      await release.promise;
      return snapshot;
    });

    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await screen.findByLabelText('m, taught by coach');
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(await captured.promise).toEqual([
      expect.objectContaining({ letter: 'm', confirmed: true }),
      expect.objectContaining({ letter: 's', confirmed: true }),
    ]);
    expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    await act(async () => { release.resolve(); });
    expect(screen.getByLabelText('s, taught by coach')).toBeTruthy();
    expect(screen.getByText('2 / 26 letters mastered')).toBeTruthy();
  });

  test('a background read cannot publish while a tap is pending', async () => {
    await writeRecord(mark('s', true));
    const screen = render(panel());
    await screen.findByLabelText('s, taught by coach');
    const releaseWrite = deferred();
    write.mockImplementationOnce(async args => {
      await releaseWrite.promise;
      return writeRecord(args);
    });
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await writeRecord(mark('s', false));
    const captured = deferred();
    read.mockImplementationOnce(async args => {
      const snapshot = await readRecords(args);
      captured.resolve();
      return snapshot;
    });
    syncRefresh(screen);
    await act(async () => { await captured.promise; });
    const readWasHeldBack = screen.queryByLabelText('s, taught by coach') !== null;
    await act(async () => { releaseWrite.resolve(); });
    expect(readWasHeldBack).toBe(true);
    expect(await screen.findByLabelText('m, taught by coach')).toBeTruthy();
    expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
  });

  test('a post-save read is invalidated by the next tap', async () => {
    const screen = render(panel());
    await screen.findByLabelText('m, not mastered');
    const captured = deferred(), release = deferred();
    read.mockImplementationOnce(async args => {
      const snapshot = await readRecords(args);
      captured.resolve();
      await release.promise;
      return snapshot;
    });
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await screen.findByLabelText('m, taught by coach');
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await captured.promise;

    fireEvent.press(screen.getByLabelText('m, taught by coach'));
    await screen.findByLabelText('m, not mastered');
    await act(async () => { release.resolve(); });
    expect(screen.getByLabelText('m, not mastered')).toBeTruthy();
    expect(write.mock.calls.map(([args]) => args.confirmed)).toEqual([true, false]);
    expect(await readRecords({ childId: f.childId, language: 'en' }))
      .toEqual([expect.objectContaining({ confirmed: false })]);
  });

  test('an invalidated sync refresh followed by a failed save re-reads storage and keeps the grid retryable', async () => {
    await writeRecord(mark('s', true));
    const screen = render(panel());
    await screen.findByLabelText('s, taught by coach');
    await failConfirmingM();
    await writeRecord(mark('s', false));

    const captured = deferred(), releaseRead = deferred(), releaseWrite = deferred();
    read.mockImplementationOnce(async args => {
      const snapshot = await readRecords(args);
      captured.resolve(snapshot);
      await releaseRead.promise;
      return snapshot;
    });
    syncRefresh(screen);
    expect(await captured.promise).toContainEqual(expect.objectContaining({ letter: 's', confirmed: false }));
    write.mockImplementationOnce(async args => {
      await releaseWrite.promise;
      return writeRecord(args);
    });
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await act(async () => { releaseRead.resolve(); });
    expect(screen.getByLabelText('s, taught by coach')).toBeTruthy();

    await act(async () => { releaseWrite.resolve(); });
    expect(await screen.findByText('Letter update was not saved. Please try again.')).toBeTruthy();
    expect(await screen.findByLabelText('s, not mastered')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.getByLabelText('m, not mastered').props.accessibilityState.disabled).toBe(false);
    expect(offline.refreshSyncStatus).not.toHaveBeenCalled();
    expect(offline.triggerBackgroundSync).not.toHaveBeenCalled();

    await f.db.execAsync('drop trigger reject_panel_m');
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    expect(await screen.findByLabelText('m, taught by coach')).toBeTruthy();
    expect(screen.queryByText('Letter update was not saved. Please try again.')).toBeNull();
    expect(write.mock.calls.map(([args]) => args.confirmed)).toEqual([true, true]);
    expect(await readRecords({ childId: f.childId, language: 'en' })).toEqual([
      expect.objectContaining({ letter: 'm', confirmed: true }),
      expect.objectContaining({ letter: 's', confirmed: false }),
    ]);
  });

  test('a focus refresh discarded during a failed save cannot leave loading stuck', async () => {
    const screen = render(panel());
    await screen.findByLabelText('m, not mastered');
    await failConfirmingM();
    const releaseWrite = deferred();
    write.mockImplementationOnce(async args => {
      await releaseWrite.promise;
      return writeRecord(args);
    });
    fireEvent.press(screen.getByLabelText('m, not mastered'));

    const captured = deferred(), releaseRead = deferred();
    read.mockImplementationOnce(async args => {
      const snapshot = await readRecords(args);
      captured.resolve();
      await releaseRead.promise;
      return snapshot;
    });
    await act(async () => { useFocusEffect.mock.calls.at(-1)[0](); });
    await captured.promise;
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();
    await act(async () => { releaseRead.resolve(); });
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).not.toBeNull();

    await act(async () => { releaseWrite.resolve(); });
    expect(await screen.findByText('Letter update was not saved. Please try again.')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.getByLabelText('m, not mastered').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText('0 / 26 letters mastered')).toBeTruthy();
    expect(offline.refreshSyncStatus).not.toHaveBeenCalled();
    expect(offline.triggerBackgroundSync).not.toHaveBeenCalled();
  });
});
