import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SkipReasonPicker } from '../SkipReasonPicker';
import { BottomBar, SecondaryButton, TextLink, UiText } from '../../ui';

const reasons = [
  ['Child refused', 'skipped_child_refused'],
  ['Child is tired', 'skipped_tired'],
  ['Out of time', 'skipped_time'],
  ["Not suitable for this child's age", 'skipped_age'],
  ['Other reason', 'skipped_other'],
] as const;

test('SkipReasonPicker lists the five reasons as buttons and Cancel as a link', () => {
  const onChoose = jest.fn();
  const onCancel = jest.fn();
  const r = render(<SkipReasonPicker onChoose={onChoose} onCancel={onCancel} />);
  expect(r.getByText('Why are you skipping this question?')).toBeTruthy();
  expect(r.UNSAFE_getAllByType(UiText).find(text => text.props.variant === 'heading')?.props.children)
    .toBe('Why are you skipping this question?');
  expect(r.UNSAFE_getAllByType(SecondaryButton)).toHaveLength(5);
  reasons.forEach(([label, reason], index) => {
    fireEvent.press(r.getByRole('button', { name: label }));
    expect(onChoose).toHaveBeenNthCalledWith(index + 1, reason);
  });
  expect(onChoose).toHaveBeenCalledTimes(5);
  expect(onCancel).not.toHaveBeenCalled();
  const cancel = r.UNSAFE_getByType(TextLink);
  expect(cancel.props.label).toBe('Cancel');
  expect(r.UNSAFE_getByType(BottomBar).findByType(TextLink)).toBe(cancel);
  fireEvent.press(r.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onChoose).toHaveBeenCalledTimes(5);
});
