import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ObservationPanel } from '../ObservationPanel';

const options = [
  { key: 'head', label: 'In their head' }, { key: 'fingers', label: 'Fingers' },
  { key: 'counters', label: 'Counters' }, { key: 'paper', label: 'Paper' },
  { key: 'not_seen', label: "Couldn't tell", exclusive: true },
];
function setup() {
  const onConfirm = jest.fn();
  const r = render(<ObservationPanel title="How did Amahle work these out? Tick all you saw." options={options}
    confirmLabel="Save" onConfirm={onConfirm} testID="observation" />);
  return { ...r, onConfirm, tick: (label: string) => fireEvent.press(r.getByRole('button', { name: label })) };
}

test('confirm is disabled until a chip is ticked', () => {
  const r = setup();
  expect(r.getByRole('header', { name: 'How did Amahle work these out? Tick all you saw.' })).toBeTruthy();
  expect(r.getByRole('button', { name: 'Save' })).toBeDisabled();
  r.tick('Save'); expect(r.onConfirm).not.toHaveBeenCalled();
  r.tick('Fingers'); expect(r.getByRole('button', { name: 'Save' })).toBeEnabled();
  r.tick('Fingers'); expect(r.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('an exclusive option clears the others and is cleared by them', () => {
  const r = setup();
  r.tick('Fingers'); r.tick('Paper'); r.tick("Couldn't tell");
  expect(r.getByRole('button', { name: "Couldn't tell" }).props.accessibilityState.selected).toBe(true);
  for (const label of ['Fingers', 'Paper']) expect(r.getByRole('button', { name: label }).props.accessibilityState.selected).toBe(false);
  r.tick('Save'); expect(r.onConfirm).toHaveBeenLastCalledWith(['not_seen']);
  r.tick('Counters');
  expect(r.getByRole('button', { name: "Couldn't tell" }).props.accessibilityState.selected).toBe(false);
  r.tick('Save'); expect(r.onConfirm).toHaveBeenLastCalledWith(['counters']);
  r.tick("Couldn't tell"); r.tick("Couldn't tell");
  expect(r.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('onConfirm receives keys in option order', () => {
  const r = setup();
  r.tick('Paper'); r.tick('In their head'); r.tick('Fingers'); r.tick('Save');
  expect(r.onConfirm).toHaveBeenCalledTimes(1);
  expect(r.onConfirm).toHaveBeenCalledWith(['head', 'fingers', 'paper']);
});
