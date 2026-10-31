import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SequentialCapture } from '../SequentialCapture';
import { flatCopy } from '../captureCopy';
import type { Result, ResultItem } from '../../types/Result';
import { THREE_BY_THREE_LAYOUT } from '../../ui';

jest.mock('../clock', () => ({ monotonicNow: () => globalThis.performance.now() }));
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const choices = [
  { key: 'count_all', label: 'Counted from 1' },
  { key: 'count_on', label: 'Started from the first number' },
  { key: 'known', label: 'Just knew' },
];
function setup(overrides: Partial<React.ComponentProps<typeof SequentialCapture>> = {}) {
  const onComplete = jest.fn<void, [Result]>(), onItemMarked = jest.fn<void, [ResultItem]>();
  const items = ['a', 'b', 'c'].map(prompt => ({ item_key: prompt, prompt, metadata: { skill: 'add_objects', band: 5 } }));
  const r = render(<SequentialCapture language="en" childName="Amahle"
    itemSet={{ item_set_id: 'choices@fixture.en', question_code: 'choices', question_version: 'fixture', language: 'en' }}
    items={items} body={{ kind: 'grid', rows: [[0,1,2]], layout: THREE_BY_THREE_LAYOUT, variant: 'word', testID: 'grid' }}
    copy={flatCopy('item', 3)} stopRule={null} testIDPrefix="choices" choices={choices}
    onComplete={onComplete} onItemMarked={onItemMarked} {...overrides} />);
  const press = (label: string) => fireEvent.press(r.getByText(label));
  return { ...r, onComplete, onItemMarked, press, start: () => press('Start'),
    advance: (ms: number) => act(() => jest.advanceTimersByTime(ms)),
    tap: (position: number) => fireEvent.press(r.getByTestId(`tile-${position}`)),
    result: () => onComplete.mock.calls[0][0],
    end: () => { fireEvent.press(r.getByTestId('choices-end')); fireEvent.press(within(r.getByTestId('end-confirmation')).getByText('End question')); },
  };
}

test('choices replace Correct and a choice is saved as strategy', () => {
  const r = setup(); r.start();
  expect(r.queryByText('Correct')).toBeNull();
  r.press('Started from the first number'); r.end();
  expect(r.result().items[0]).toMatchObject({ is_correct: true, metadata: { skill: 'add_objects', band: 5, reached: true, strategy: 'count_on' } });
  expect(r.onItemMarked.mock.calls[0][0].metadata?.strategy).toBe('count_on');
  for (const item of r.result().items.slice(1)) {
    expect(item.metadata?.reached).toBe(false); expect(item.metadata).not.toHaveProperty('strategy');
  }
});

test('tapping a reached tile opens correcting mode; Wrong → Right saves the chosen strategy', () => {
  const r = setup(); r.start(); r.press('Incorrect');
  expect(r.getByTestId('tile-0')).toHaveAccessibleName('a, incorrect. Double-tap to change');
  r.tap(0);
  expect(r.getByRole('header', { name: 'Change Item 1' })).toBeTruthy();
  expect(r.queryByText('Back')).toBeNull(); expect(r.queryByText('Skip question')).toBeNull();
  r.press('Just knew');
  expect(r.getByTestId('tile-1')).toHaveAccessibleName('b, current');
  r.end(); expect(r.result().items[0].metadata?.strategy).toBe('known');
  expect(r.result().derived.correction_count).toBe(1);
});

test('Right → Right changes the strategy', () => {
  const r = setup(); r.start(); r.press('Counted from 1'); r.tap(0); r.press('Just knew'); r.end();
  expect(r.result().items[0]).toMatchObject({ is_correct: true, metadata: { strategy: 'known' } });
  expect(r.result().derived.correction_count).toBe(1);
});

test('Right → Incorrect drops the strategy', () => {
  const r = setup(); r.start(); r.press('Just knew'); r.tap(0); r.press('Incorrect'); r.end();
  expect(r.result().items[0].is_correct).toBe(false);
  expect(r.result().items[0].metadata).not.toHaveProperty('strategy');
  expect(r.onItemMarked.mock.calls[1][0].metadata).not.toHaveProperty('strategy');
});

test('back then a new choice saves only the new strategy', () => {
  const r = setup(); r.start(); r.press('Counted from 1'); r.press('Back');
  expect(r.getByTestId('tile-0')).toHaveAccessibleName('a, current');
  r.press('Just knew'); r.end();
  expect(r.result().items[0].metadata?.strategy).toBe('known');
  expect(r.result().derived.correction_count).toBe(1);
});

test('correcting works in review and Finish returns after Cancel', () => {
  const r = setup(); r.start(); r.press('Just knew'); r.press('Just knew'); r.press('Just knew');
  r.tap(0); expect(r.queryByText('Finish')).toBeNull();
  r.press('Cancel'); expect(r.getByText('Finish')).toBeTruthy();
  r.press('Finish'); expect(r.result().derived.correction_count).toBe(0);
  expect(r.result().items[0].metadata?.strategy).toBe('known');
});

test('a review correction is saved', () => {
  const r = setup({ durationSec: 60 }); r.start(); r.advance(20000);
  r.press('Counted from 1'); r.press('Just knew'); r.press('Just knew');
  r.advance(10000); r.tap(0); r.press('Started from the first number'); r.tap(1); r.press('Incorrect');
  r.advance(20000); r.press('Finish');
  const result = r.result();
  expect(result.duration_ms).toBe(20000);
  expect(result.items[0].metadata?.strategy).toBe('count_on');
  expect(result.items[1].is_correct).toBe(false); expect(result.items[1].metadata).not.toHaveProperty('strategy');
  expect(result.derived).toMatchObject({ correction_count: 2, total_correct: 2, total_attempted: 3 });
  expect(r.onItemMarked).toHaveBeenCalledTimes(5);
  expect(r.onItemMarked.mock.calls[3][0]).toMatchObject({ position: 0, is_correct: true, metadata: { reached: true, strategy: 'count_on' } });
  expect(r.onItemMarked.mock.calls[4][0]).toMatchObject({ position: 1, is_correct: false, metadata: { reached: true } });
  expect(r.onItemMarked.mock.calls[4][0].metadata).not.toHaveProperty('strategy');
});

test('without choices, tile taps still flip', () => {
  const r = setup({ choices: undefined }); r.start(); r.press('Correct');
  expect(r.getByTestId('tile-0')).toHaveAccessibleName('a, correct. Double-tap to change to incorrect');
  r.tap(0); r.end(); expect(r.result().items[0].is_correct).toBe(false);
  expect(r.result().items[0].metadata).not.toHaveProperty('strategy');
});

test('Undo after a stop keeps earlier choices and re-marking saves the new choice', () => {
  const r = setup({ stopRule: { kind: 'consecutive_wrong', stop_at: 1 } }); r.start();
  r.press('Counted from 1'); r.press('Incorrect'); r.advance(5000); r.press('Undo last mark');
  r.press('Just knew'); r.press('Just knew'); r.press('Finish');
  expect(r.result().items.map(item => item.metadata?.strategy)).toEqual(['count_all', 'known', 'known']);
  expect(r.result().derived.correction_count).toBe(1);
});

test('a repeated correction choice does not mark the next item', () => {
  const r = setup(); r.start(); r.press('Counted from 1'); r.tap(0);
  const choice = r.getByText('Just knew');
  act(() => { fireEvent.press(choice); fireEvent.press(choice); });
  expect(r.getByTestId('tile-1')).toHaveAccessibleName('b, current');
  r.end(); expect(r.result().derived.total_attempted).toBe(1);
  expect(r.onItemMarked).toHaveBeenCalledTimes(2);
});

test('the active deadline still expires while correcting', () => {
  const r = setup({ durationSec: 60 }); r.start(); r.press('Counted from 1'); r.tap(0); r.advance(60000);
  expect(r.result()).toMatchObject({ stopped_reason: 'timer', duration_ms: 60000 });
  expect(r.result().items[0].metadata?.strategy).toBe('count_all');
});
