jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { colors } from '../src/constants/colors';
import LetterMasteryPanel from '../src/components/assessment/LetterMasteryPanel';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createMasteryRepository, masteryRepository } from '../src/db/repositories/masteryRepository';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { createFamilySyncFixture } from '../test-support/assessmentFamilySyncTestUtils';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('../src/services/supabaseClient', () => ({
  ...require('../test-support/supabaseTestConfig'), supabase: {},
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: { latestLetterResult: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: { getLetterMastery: jest.fn(), setLetterMastery: jest.fn() },
}));

describe('LetterMasteryPanel', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
  const classItem = { id: 'class-1', home_language: 'English' };
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
    assessmentsRepository.latestLetterResult.mockResolvedValue(null);
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

  test('assessment mastery stays locked and cannot be pressed', async () => {
    assessmentsRepository.latestLetterResult.mockResolvedValue({
      id: 'letter-assessment', child_id: child.id, question_code: 'letter_sounds',
      language: 'en', assessment_date: '2026-07-01',
      items: [{ prompt: 'A', is_correct: true, metadata: { reached: true } }],
    });
    const screen = render(panel());
    const tile = await screen.findByLabelText('a, mastered from assessment, locked');
    expect(assessmentsRepository.latestLetterResult).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'en' });
    expect(screen.getByText('Last assessed: 2026-07-01')).toBeTruthy();
    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ backgroundColor: colors.successBg, borderColor: colors.successBorder });
    fireEvent.press(tile);
    expect(masteryRepository.setLetterMastery).not.toHaveBeenCalled();
  });

  test.each([null, 'isiZulu'])('shows no letter grid for unsupported class language %s', async home_language => {
    const screen = render(panel({ classItem: { home_language } }));
    expect(await screen.findByText('No letter set for this class language.')).toBeTruthy();
    expect(screen.queryAllByText(/^[a-z]$/)).toHaveLength(0);
    expect(assessmentsRepository.latestLetterResult).not.toHaveBeenCalled();
    expect(masteryRepository.getLetterMastery).not.toHaveBeenCalled();
    expect(masteryRepository.setLetterMastery).not.toHaveBeenCalled();
  });

  test('an Afrikaans class shows Afrikaans confirmations only and saves new marks as af', async () => {
    storedRows = [stored('a', true, { language: 'af' }), stored('s')];
    const screen = render(panel({ classItem: { id: 'class-af', home_language: 'Afrikaans' } }));
    expect(await screen.findByLabelText('a, taught by coach')).toBeTruthy();
    expect(assessmentsRepository.latestLetterResult).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'af' });
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
  const classItem = { id: 'class-1', home_language: 'English' };
  const panel = () => (
    <SignedInEAContext.Provider value={{ repositories }}>
      <LetterMasteryPanel child={child} classItem={classItem} />
    </SignedInEAContext.Provider>
  );
  const mark = (letter, confirmed) => ({
    childId: f.childId, letter, language: 'en', confirmed,
  });
  const syncRefresh = screen => {
    offline = { ...offline, lastSyncResult: {
      tableResults: { letter_mastery: { success: true, synced: 1, failed: 0 } },
    } };
    useOffline.mockReturnValue(offline);
    screen.rerender(panel());
  };

  beforeEach(async () => {
    f = await createFamilySyncFixture();
    mastery = createMasteryRepository({ database: f.db });
    readRecords = mastery.getLetterMastery;
    writeRecord = mastery.setLetterMastery;
    await writeRecord(mark('m', false));
    read = jest.spyOn(mastery, 'getLetterMastery');
    write = jest.spyOn(mastery, 'setLetterMastery');
    repositories = { assessments: f.assessments, mastery };
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
});
