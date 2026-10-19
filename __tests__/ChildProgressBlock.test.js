import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ChildProgressBlock from '../src/components/sessions/ChildProgressBlock';
import StatusBadge from '../src/components/common/StatusBadge';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini' };

test('shows identity and unset progress and opens the right child controls', () => {
  const onOpenLevel = jest.fn();
  const onOpenTracker = jest.fn();
  const screen = render(<ChildProgressBlock child={child} className="Grade 1A" trackerChangeCount={0}
    onOpenLevel={onOpenLevel} onOpenTracker={onOpenTracker} />);
  expect(screen.getByText('Amahle Dlamini')).toBeTruthy();
  expect(screen.getByText('Grade 1A')).toBeTruthy();
  expect(screen.getByText('AD', { includeHiddenElements: true })).toBeTruthy();
  const level = screen.getByRole('button', { name: 'Amahle Dlamini, reading level, Not set' });
  const tracker = screen.getByRole('button', { name: 'Amahle Dlamini, letter tracker, Update' });
  expect(StyleSheet.flatten(level.props.style)).toMatchObject({ minHeight: 52, paddingVertical: 0, paddingLeft: 16, paddingRight: 12 });
  fireEvent.press(level);
  fireEvent.press(tracker);
  expect(onOpenLevel).toHaveBeenCalledWith('child-1');
  expect(onOpenTracker).toHaveBeenCalledWith(child);
});

test('shows the saved level, new-letter badge and missing-class fallback', () => {
  const screen = render(<ChildProgressBlock child={child} readingLevel="Word Reading" trackerChangeCount={2} />);
  expect(screen.getByText('No class')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Amahle Dlamini, reading level, Word Reading' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Amahle Dlamini, letter tracker, 2 new' })).toBeTruthy();
  expect(screen.getByText('+2 new')).toBeTruthy();
  expect(screen.UNSAFE_getByType(StatusBadge).props.tone).toBe('successStrong');
});
