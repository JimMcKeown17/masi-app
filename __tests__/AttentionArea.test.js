// __tests__/AttentionArea.test.js
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AttentionArea from '../src/components/home/AttentionArea';

const items = [
  { key: 'auto_clock_out:time-1', kind: 'auto_clock_out', tone: 'warning', title: 'Clocked out after 10 hours',
    subtitle: 'Automatic · Wed · check hours', accessibilityLabel: 'Clocked out automatically after 10 hours, Wed. Check your hours',
    route: 'TimeEntriesList', dismissible: true, entryId: 'time-1' },
  { key: 'assessment_due', kind: 'assessment_due', tone: 'neutral', title: '1 child to assess',
    subtitle: '11 of 12 children assessed', accessibilityLabel: '1 child to assess. 11 of 12 children assessed. Open Assess',
    route: 'Assessments', dismissible: true },
];

test('renders nothing when empty', () => {
  const screen = render(<AttentionArea items={[]} onOpen={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

test('cards open and dismiss independently', () => {
  const onOpen = jest.fn();
  const onDismiss = jest.fn();
  const screen = render(<AttentionArea items={items} onOpen={onOpen} onDismiss={onDismiss} />);
  expect(screen.getByLabelText('Needs your attention')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Clocked out automatically after 10 hours, Wed. Check your hours'));
  fireEvent.press(screen.getByLabelText('Dismiss: Clocked out after 10 hours'));
  expect(onOpen).toHaveBeenCalledWith(items[0]);
  expect(onDismiss).toHaveBeenCalledWith(items[0]);
});
