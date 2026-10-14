import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LastAttemptedSheet } from '../LastAttemptedSheet';

const labels = ['a', 'n', 'i', 't'];

test('pick an item then Confirm reports its index', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByLabelText('i, item 3'));
  fireEvent.press(r.getByText('Confirm'));
  expect(onConfirm).toHaveBeenCalledWith(2);
});
test('Reached the end reports the last index', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByText('Reached the end'));
  expect(onConfirm).toHaveBeenCalledWith(3);
});
test('Nothing attempted reports -1', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByText('Nothing attempted'));
  expect(onConfirm).toHaveBeenCalledWith(-1);
});
test('Cancel appears only when onCancel is given', () => {
  const onCancel = jest.fn();
  const withCancel = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} onCancel={onCancel} />);
  fireEvent.press(withCancel.getByText('Cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  const noCancel = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} />);
  expect(noCancel.queryByText('Cancel')).toBeNull();
});
