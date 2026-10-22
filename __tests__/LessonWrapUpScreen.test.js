global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import * as ReactNative from 'react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { draftStart, deferred } from '../test-support/lessonDraftTestUtils';
import LessonWrapUpScreen from '../src/screens/lessons/LessonWrapUpScreen';
import { saveLesson, LessonSaveError } from '../src/services/lessonSave';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: callback => require('react').useEffect(callback, [callback]),
}));
jest.mock('../src/hooks/useProgrammeTodayKey', () => ({ useProgrammeTodayKey: () => '2026-10-22' }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ profile: {} }) }));
jest.mock('../src/context/LookupsContext', () => ({ useLookupsContext: () => ({ jobTitles: [] }) }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ refreshFromCache: jest.fn() }) }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ refreshSyncStatus: jest.fn() }) }));
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: () => ({ handle: mockHandle, repositories: mockHandle.repositories }) }));
jest.mock('../src/hooks/useLessonDraft', () => ({ useLessonDraft: options => mockUseLessonDraft(options) }));
jest.mock('../src/services/lessonSave', () => ({ ...jest.requireActual('../src/services/lessonSave'), saveLesson: jest.fn() }));
jest.mock('../src/utils/masteryState', () => ({
  ...jest.requireActual('../src/utils/masteryState'), loadMasteryState: jest.fn(async ({ childId }) => ({
    assessmentMastered: new Set(childId === 'c1' ? ['m'] : []), taughtRecords: [{ letter: 's', confirmed: true }],
  })),
}));

const mockChildren = { c1: { id: 'c1', first_name: 'Amahle', last_name: 'Child', reading_level: 'Cannot blend' },
  c2: { id: 'c2', first_name: 'Lulu', last_name: 'Child', reading_level: '2 Letter Blends' } };
const mockHandle = { userId: 'ea', isCurrent: () => true, repositories: { children: {
  getChildrenByIds: jest.fn(async () => mockChildren),
  getWriteAuthority: jest.fn(async () => ({ c1: { attend: true, deliver: true, level: true }, c2: { attend: true, deliver: true, level: true } })),
} } };
let mockInitial, mockDraft, mockApply, mockBeginSave, mockEndSave;
function mockUseLessonDraft() {
  const [draft, setDraft] = React.useState(mockInitial);
  mockDraft = draft;
  mockApply = jest.fn(async (transition, ...args) => setDraft(row => ({ ...row, ...transition(row, ...args) })));
  return { draft, status: 'ready', apply: mockApply, beginSave: mockBeginSave, endSave: mockEndSave };
}
const navigation = { replace: jest.fn(), popTo: jest.fn(), setOptions: jest.fn() };
const mount = () => renderWithProviders(<LessonWrapUpScreen navigation={navigation} route={{ params: { draftId: 'draft-1' } }} />);
const ready = view => view.findByText('Amahle');
const row = (view, id = 'c1') => within(view.getByTestId(`wrap-up-child-${id}`));
beforeEach(() => {
  jest.clearAllMocks();
  mockInitial = draftStart({ id: 'draft-1', session_id: 'session-1', ticks: { letters: ['a', 'm'] } });
  mockBeginSave = jest.fn(async () => mockDraft);
  mockEndSave = jest.fn();
  saveLesson.mockResolvedValue({ sessionId: 'session-1' });
  mockHandle.repositories.children.getWriteAuthority.mockImplementation(async () => ({
    c1: { attend: true, deliver: true, level: true }, c2: { attend: true, deliver: true, level: true },
  }));
  jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-10-22T09:12:34.000Z');
});
afterEach(() => jest.restoreAllMocks());

test('the heading names the ticked letters; no ticked letters skips the section', async () => {
  const view = mount(); await ready(view);
  expect(view.getByText('Who knows a m without help?')).toBeTruthy();
  expect(view.getByText("Teaching it today doesn't count.")).toBeTruthy();
  view.unmount(); mockInitial = draftStart();
  const empty = mount(); await ready(empty);
  expect(empty.queryByText(/Who knows/)).toBeNull();
  expect(empty.queryByText("Teaching it today doesn't count.")).toBeNull();
});
test('a chip records a mark in the lesson language with the tap time', async () => {
  mockInitial.language_code = 'xh';
  const view = mount(); await ready(view);
  fireEvent.press(row(view).getByRole('button', { name: 'a, not mastered' }));
  await waitFor(() => expect(mockDraft.tracker_changes.c1.a).toEqual({ mastered: true, languageCode: 'xh', madeAt: '2026-10-22T09:12:34.000Z' }));
  fireEvent.press(row(view).getByRole('button', { name: 'a, taught, added this session' }));
  await waitFor(() => expect(mockDraft.tracker_changes.c1).toBeUndefined());
});
test('an assessment-mastered letter is locked', async () => {
  const view = mount(); await ready(view);
  const tile = await row(view).findByRole('button', { name: 'm, mastered from assessment, locked' });
  expect(tile).toBeDisabled(); fireEvent.press(tile); expect(mockApply).not.toHaveBeenCalled();
});
test("No one new yet clears the child's chips", async () => {
  mockInitial.tracker_changes = { c1: { a: { mastered: true, languageCode: 'en', madeAt: '2026-10-22T09:00:00.000Z' },
    z: { mastered: true, languageCode: 'en', madeAt: '2026-10-22T09:00:00.000Z' } } };
  const view = mount(); await ready(view);
  fireEvent.press(row(view).getByRole('button', { name: 'No one new yet' }));
  await waitFor(() => expect(mockDraft.ticks.noOneNew).toEqual(['c1']));
  expect(Object.keys(mockDraft.tracker_changes.c1)).toEqual(['z']);
});
test("the tracker sheet opens in the lesson language with the child's marks", async () => {
  mockInitial.language_code = 'xh';
  mockInitial.tracker_changes = { c1: { a: { mastered: true, languageCode: 'xh', madeAt: '2026-10-22T09:00:00.000Z' } } };
  const view = mount(); await ready(view);
  fireEvent.press(row(view).getByRole('button', { name: /letter tracker/ }));
  expect(await view.findByRole('button', { name: 'a, taught, added this session' })).toBeTruthy();
  expect(require('../src/utils/masteryState').loadMasteryState).toHaveBeenLastCalledWith(expect.objectContaining({ childId: 'c1', languageCode: 'xh' }));
  fireEvent.press(await view.findByRole('button', { name: 'z, not mastered' }));
  await waitFor(() => expect(Object.keys(mockDraft.tracker_changes.c1)).toEqual(['a', 'z']));
});
test('a reading level back to the current one removes the change', async () => {
  mockInitial.reading_level_changes = { c1: '3 Letter Blends' };
  const view = mount(); await ready(view);
  fireEvent.press(row(view).getByRole('button', { name: /reading level/ }));
  fireEvent.press(await view.findByRole('button', { name: 'Cannot blend' }));
  await waitFor(() => expect(mockDraft.reading_level_changes).toEqual({}));
});
test('resumed lesson shows its start date', async () => {
  const view = mount(); await ready(view);
  expect(view.getByRole('button', { name: 'Date, Started Mon 19 Oct' })).toBeTruthy();
});
test('empty lesson asks before saving', async () => {
  mockInitial = draftStart({ id: 'draft-1', ticks: { letters: [] } });
  const view = mount(); await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  expect(await view.findByText('Save without letters, blends or a book?')).toBeTruthy();
  expect(mockBeginSave).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Go back' }));
  await waitFor(() => expect(view.queryByText('Save without letters, blends or a book?')).toBeNull());
});
test('no child present disables Save with the reason', async () => {
  mockInitial.attendance.absentChildIds = ['c1', 'c2'];
  const view = mount();
  expect(await view.findByText('Mark at least one child as here.')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Save session' })).toBeDisabled();
});
test('a double press saves once', async () => {
  const held = deferred(); mockBeginSave.mockImplementation(() => held.promise);
  const view = mount(); await ready(view);
  const button = view.getByRole('button', { name: 'Save session' });
  fireEvent.press(button); fireEvent.press(button);
  expect(mockBeginSave).toHaveBeenCalledTimes(1);
  await act(async () => held.resolve(mockDraft));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledTimes(1));
  expect(mockEndSave).toHaveBeenCalledWith({ saved: true });
});

test('a chip preserves the other pending letters, including a mark from the full tracker', async () => {
  mockInitial.tracker_changes = { c1: { z: { mastered: true, languageCode: 'en', madeAt: '2026-10-19T09:00:00.000Z' } } };
  const view = mount(); await ready(view);
  fireEvent.press(row(view).getByRole('button', { name: 'a, not mastered' }));
  await waitFor(() => expect(Object.keys(mockDraft.tracker_changes.c1)).toEqual(['z', 'a']));
  fireEvent.press(row(view).getByRole('button', { name: 'a, taught, added this session' }));
  await waitFor(() => expect(Object.keys(mockDraft.tracker_changes.c1)).toEqual(['z']));
});
test('confirmed letters are shown as already known before any draft mark', async () => {
  mockInitial.ticks.letters = ['s'];
  const view = mount(); await ready(view);
  expect(row(view).getByRole('button', { name: 's, taught by coach' }).props.accessibilityState.selected).toBe(true);
  expect(mockDraft.tracker_changes).toEqual({});
});
test('authority hides only the controls the EA cannot write', async () => {
  mockHandle.repositories.children.getWriteAuthority.mockResolvedValue({
    c1: { attend: true, deliver: false, level: true }, c2: { attend: true, deliver: true, level: false },
  });
  const view = mount(); await ready(view);
  expect(row(view).getByText("Letters can't be updated for this child")).toBeTruthy();
  expect(row(view).queryByRole('button', { name: 'No one new yet' })).toBeNull();
  expect(row(view).queryByRole('button', { name: /letter tracker/ })).toBeNull();
  expect(row(view).getByRole('button', { name: /reading level/ })).toBeTruthy();
  expect(row(view, 'c2').queryByRole('button', { name: /reading level/ })).toBeNull();
});
test('a language without a letter order has no tracker opener', async () => {
  mockInitial.language_code = 'zu';
  const view = mount(); await ready(view);
  expect(view.queryByRole('button', { name: /letter tracker/ })).toBeNull();
  expect(row(view).getByRole('button', { name: /reading level/ })).toBeTruthy();
});
test('the date calendar refuses future dates and saves the chosen past date', async () => {
  const view = mount(); await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Date, Started Mon 19 Oct' }));
  expect(await view.findByRole('button', { name: 'Fri 23 October 2026, unavailable' })).toBeDisabled();
  fireEvent.press(view.getByRole('button', { name: 'Tue 20 October 2026' }));
  await waitFor(() => expect(mockDraft.lesson_date).toBe('2026-10-20'));
  expect(view.getByRole('button', { name: 'Date, Started Tue 20 Oct' })).toBeTruthy();
});
test('confirming an empty lesson normalizes deferred blend and book data to empty arrays', async () => {
  mockInitial.ticks = { letters: [] };
  const view = mount(); await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText('Save without letters, blends or a book?');
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await waitFor(() => expect(saveLesson).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({
    ticks: { letters: [], blends: [], books: [] },
  }) })));
});
test('Clear their changes preserves tracker marks when only reading levels are refused', async () => {
  mockInitial.tracker_changes = { c1: { a: { mastered: true, languageCode: 'en', madeAt: '2026-10-19T09:00:00.000Z' } } };
  mockInitial.reading_level_changes = { c1: '3 Letter Blends', c2: '4 Letter Blends' };
  const view = mount(); await ready(view);
  saveLesson.mockRejectedValueOnce(new LessonSaveError('CHANGES_NOT_WRITABLE', { childIds: ['c1'] }));
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await view.findByText("You can't update Amahle's letters or reading level any more.");
  mockHandle.repositories.children.getWriteAuthority.mockResolvedValue({ c1: { attend: true, deliver: true, level: false } });
  fireEvent.press(view.getByRole('button', { name: 'Clear their changes' }));
  await waitFor(() => expect(mockDraft.reading_level_changes).toEqual({ c2: '4 Letter Blends' }));
  expect(mockDraft.tracker_changes).toEqual(mockInitial.tracker_changes);
});
test('at 1.3x text the heading and child controls can grow and the letter chips wrap', async () => {
  const dimensions = ReactNative.useWindowDimensions;
  jest.spyOn(ReactNative, 'useWindowDimensions').mockImplementation(() => ({ ...dimensions(), width: 360, fontScale: 1.3 }));
  const view = mount(); await ready(view);
  expect(StyleSheet.flatten(view.getByText('Who knows a m without help?').props.style).height).toBeUndefined();
  expect(StyleSheet.flatten(view.getByTestId('wrap-up-child-c1').props.style).height).toBeUndefined();
  expect(StyleSheet.flatten(view.getAllByTestId('wrap-up-letter-chips')[0].props.style).flexWrap).toBe('wrap');
});
test('the Save footer hides while the notes keyboard is open and returns when it closes', async () => {
  const listeners = new Map();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(listener);
    return { remove: () => listeners.get(event).delete(listener) };
  });
  const phase = Platform.OS === 'ios' ? 'Will' : 'Did';
  const view = mount(); await ready(view);
  act(() => listeners.get(`keyboard${phase}Show`).forEach(fn => fn({ endCoordinates: { height: 300 } })));
  expect(view.queryByRole('button', { name: 'Save session' })).toBeNull();
  act(() => listeners.get(`keyboard${phase}Hide`).forEach(fn => fn({ endCoordinates: { height: 0 } })));
  expect(view.getByRole('button', { name: 'Save session' })).toBeTruthy();
});
test('blend and book ticks supplied as data bypass the empty confirm and keep the measured tier', async () => {
  mockInitial.ticks = { letters: [], blends: ['am', 'map'], books: [{ id: 'reader-1', how: 'printed' }] };
  const view = mount(); await ready(view);
  fireEvent.press(view.getByRole('button', { name: 'Save session' }));
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('SessionComplete', expect.objectContaining({ readingLevel: '3 Letter Blends' })));
  expect(view.queryByText('Save without letters, blends or a book?')).toBeNull();
  expect(saveLesson.mock.calls[0][0].draft.ticks).toEqual(mockInitial.ticks);
});
