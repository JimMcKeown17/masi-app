import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StopCard } from '../StopCard';

test('stop at one says the child made a mistake', () => {
  const r = render(<StopCard childName="Amahle" stopRule={{ kind: 'consecutive_wrong', stop_at: 1 }}
    onSave={jest.fn()} onUndo={jest.fn()} />);
  expect(r.getByRole('header', { name: 'Amahle made a mistake. The test has stopped.' })).toBeTruthy();
});

test('stop at four keeps the consecutive-wrong copy and actions', () => {
  const onSave = jest.fn(), onUndo = jest.fn();
  const r = render(<StopCard childName="Amahle" stopRule={{ kind: 'consecutive_wrong', stop_at: 4 }}
    onSave={onSave} onUndo={onUndo} />);
  expect(r.getByRole('header', { name: 'Amahle got 4 in a row wrong. The test has stopped.' })).toBeTruthy();
  fireEvent.press(r.getByRole('button', { name: 'Undo last mark' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.press(r.getByRole('button', { name: 'Save result' }));
  expect(onSave).toHaveBeenCalledTimes(1);
});
