jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { colors } from '../src/constants/colors';
import LetterMasteryPanel from '../src/components/assessment/LetterMasteryPanel';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: jest.fn() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: { latestLetterResult: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  ...jest.requireActual('../src/db/repositories/masteryRepository'),
  masteryRepository: {
    getLetterMastery: jest.fn(),
    saveLetterMasteryRecord: jest.fn(),
    updateLetterMasteryRecord: jest.fn(),
  },
}));

describe('LetterMasteryPanel', () => {
  const refreshSyncStatus = jest.fn();
  const triggerBackgroundSync = jest.fn();
  const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };
  const classItem = { id: 'class-1', home_language: 'English' };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ refreshSyncStatus, triggerBackgroundSync });
    assessmentsRepository.latestLetterResult.mockResolvedValue(null);
    masteryRepository.getLetterMastery.mockResolvedValue([]);
    masteryRepository.saveLetterMasteryRecord.mockResolvedValue('saved-id-1');
    masteryRepository.updateLetterMasteryRecord.mockResolvedValue(true);
    refreshSyncStatus.mockResolvedValue({ unsyncedCount: 1 });
  });

  afterEach(() => jest.clearAllMocks());

  test('uses lowercase green taught tiles and the three-state legend', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'rec-a', child_id: child.id, letter: 'a', language: 'English', _deleted: false },
    ]);
    const screen = render(<LetterMasteryPanel child={child} classItem={classItem} />);
    const tile = await screen.findByLabelText('a, taught by coach');
    expect(StyleSheet.flatten(tile.props.style).backgroundColor).toBe(colors.successText);
    expect(screen.getAllByText(/^[a-z]$/)).toHaveLength(26);
    ['Taught', 'Not yet', 'Assessment (locked)'].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.queryByText('New this session')).toBeNull();
  });

  test('assessment mastery stays locked and cannot be pressed', async () => {
    assessmentsRepository.latestLetterResult.mockResolvedValue({
      id: 'letter-assessment', child_id: child.id, question_code: 'letter_sounds',
      language: 'en', assessment_date: '2026-07-01',
      items: [{ prompt: 'A', is_correct: true, metadata: { reached: true } }],
    });
    const screen = render(<LetterMasteryPanel child={child} classItem={classItem} />);
    const letter = 'a';
    const tile = await screen.findByLabelText(`${letter}, mastered from assessment, locked`);
    expect(assessmentsRepository.latestLetterResult).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'en' });
    expect(screen.getByText('Last assessed: 2026-07-01')).toBeTruthy();
    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ backgroundColor: colors.successBg, borderColor: colors.successBorder });
    fireEvent.press(tile);
    expect(masteryRepository.saveLetterMasteryRecord).not.toHaveBeenCalled();
    expect(masteryRepository.updateLetterMasteryRecord).not.toHaveBeenCalled();
  });

  test.each([null, 'isiZulu'])('shows no letter grid for unsupported class language %s', async (homeLanguage) => {
    const screen = render(<LetterMasteryPanel child={child} classItem={{ home_language: homeLanguage }} />);
    expect(await screen.findByText('No letter set for this class language.')).toBeTruthy();
    expect(screen.queryAllByText(/^[a-z]$/)).toHaveLength(0);
    expect(assessmentsRepository.latestLetterResult).not.toHaveBeenCalled();
    expect(masteryRepository.getLetterMastery).not.toHaveBeenCalled();
  });

  test('an Afrikaans class shows Afrikaans confirmations only and saves new marks as Afrikaans', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'rec-a', child_id: child.id, letter: 'a', language: 'Afrikaans', _deleted: false },
      { id: 'rec-s', child_id: child.id, letter: 's', language: 'English', _deleted: false },
    ]);
    const screen = render(<LetterMasteryPanel child={child} classItem={{ id: 'class-af', home_language: 'Afrikaans' }} />);
    expect(await screen.findByLabelText('a, taught by coach')).toBeTruthy();
    expect(assessmentsRepository.latestLetterResult).toHaveBeenCalledWith({ userId: 'user-1', childId: child.id, language: 'af' });
    expect(screen.getByLabelText('s, not mastered')).toBeTruthy();
    expect(screen.getByText('1 / 26 letters mastered')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('m, not mastered'));
    await waitFor(() => expect(masteryRepository.saveLetterMasteryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ letter: 'm', language: 'Afrikaans' })
    ));
  });

  test('reactivates a soft-deleted record on toggle-on instead of creating a duplicate', async () => {
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'rec-a', child_id: 'child-1', letter: 'a', language: 'English', _deleted: true },
    ]);
    const { getByLabelText, getByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    // the soft-deleted row is filtered out of the initial taught set
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => {
      expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
        'rec-a',
        expect.objectContaining({ _deleted: false, deleted_at: null }),
      );
    });
    expect(masteryRepository.saveLetterMasteryRecord).not.toHaveBeenCalled();
    expect(getByText('1 / 26 letters mastered')).toBeTruthy();
  });

  test('toggling a letter on then off uses the saved id and updates the mastered count', async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));
    await waitFor(() => expect(getByText('1 / 26 letters mastered')).toBeTruthy());
    expect(masteryRepository.saveLetterMasteryRecord).toHaveBeenCalledTimes(1);

    // toggle off: the panel re-fetches the active record by logical key
    masteryRepository.getLetterMastery.mockResolvedValueOnce([
      { id: 'saved-id-1', child_id: 'child-1', letter: 'a', language: 'English', _deleted: false },
    ]);
    fireEvent.press(getByLabelText('a, taught by coach'));
    await waitFor(() =>
      expect(masteryRepository.updateLetterMasteryRecord).toHaveBeenCalledWith(
        'saved-id-1',
        expect.objectContaining({ _deleted: true }),
      ),
    );
    await waitFor(() => expect(queryByText('1 / 26 letters mastered')).toBeNull());
  });

  test('failed taught-letter save keeps the cell unsaved and shows a retryable error', async () => {
    masteryRepository.saveLetterMasteryRecord.mockRejectedValueOnce(new Error('SQLite write failed'));
    const { getByLabelText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(queryByText(/Letter update was not saved/i)).toBeTruthy());
    expect(queryByText('1 / 26 letters mastered')).toBeNull();
    expect(refreshSyncStatus).not.toHaveBeenCalled();
    expect(triggerBackgroundSync).not.toHaveBeenCalled();
  });

  test('a sync-status refresh failure after a successful write does not show the save error', async () => {
    refreshSyncStatus.mockRejectedValueOnce(new Error('sync status read failed'));
    const { getByLabelText, getByText, queryByText } = render(
      <LetterMasteryPanel child={child} classItem={classItem} />,
    );
    await waitFor(() => expect(getByLabelText('a, not mastered')).toBeTruthy());

    fireEvent.press(getByLabelText('a, not mastered'));

    await waitFor(() => expect(getByText('1 / 26 letters mastered')).toBeTruthy());
    expect(queryByText(/Letter update was not saved/i)).toBeNull();
  });
});
